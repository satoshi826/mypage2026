// サイトの API。R2 に置いた原本・派生画像・manifest.json の読み書きと、問い合わせフォームの受け口。
// 静的ファイルの配信は wrangler.jsonc の assets が担い、/api と /images だけここへ来る。
//
// | メソッド | パス                      | 認証 | 内容 |
// |----------|---------------------------|------|------|
// | GET      | /api/manifest             | なし | 写真の一覧 |
// | PUT      | /api/manifest             | 要   | 一覧を丸ごと置き換える |
// | GET      | /api/session              | 要   | ログイン中なら 204。サイトの上での編集（src/editor）を出すかを決める |
// | POST     | /api/contact              | Turnstile | 問い合わせフォームの内容をメールで送る（contact.ts） |
// | GET      | /images/{kind}/{name}     | originals のみ要 | 画像。kind は派生の段（manifest.ts の VARIANTS）/ originals |
// | PUT      | /images/{kind}/{name}     | 要   | 画像を置く。body がそのまま R2 へ |
// | DELETE   | /images/{kind}/{name}     | 要   | 画像を消す |
//
// 認証は Cloudflare Access。Access が付ける JWT を検証する（access.ts）。
//
// トップ（/）と Photos（/photos*）は静的ファイルをここ経由で返し、最初に要る写真の先読みヘッダを足す。
// どちらも JS の起動 → 一覧の取得と直列に待ってから写真を取りに行くので、HTML の時点でブラウザに
// 取り始めさせる。どの写真かは一覧（R2）で決まるので、ビルド時には出せない。

import {authorize} from './access'
import {contact} from './contact'
import {
  EAGER_THUMBS,
  heroesOf,
  heroSrc,
  imageUrl,
  isCategory,
  HOVER,
  LIST_HEADROOM,
  parseManifest,
  VARIANTS,
  type Photo
} from '../src/photos/manifest'

const KINDS: readonly string[] = [...VARIANTS.map((v) => v.kind), 'originals']

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {'content-type': 'application/json; charset=utf-8', ...init.headers}
  })
const error = (status: number, message: string) => json({error: message}, {status})

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    if ((parts.length === 0 || parts[0] === 'photos') && (request.method === 'GET' || request.method === 'HEAD')) {
      // Photos はカテゴリ別の URL。カテゴリの無い /photos は street へ（恒久的な転送）
      if (parts.length === 1) return Response.redirect(new URL(`/photos/street${url.search}`, url).href, 308)
      return pageWithHints(request, env, ctx, parts)
    }

    if (parts[0] === 'api' && parts[1] === 'session' && parts.length === 2) {
      if (request.method !== 'GET') return error(405, 'method not allowed')
      return (
        (await authorize(request, env)) ?? new Response(null, {status: 204, headers: {'cache-control': 'no-store'}})
      )
    }

    if (parts[0] === 'api' && parts[1] === 'contact' && parts.length === 2) {
      if (request.method !== 'POST') return error(405, 'method not allowed')
      return contact(request, env)
    }

    if (parts[0] === 'api' && parts[1] === 'manifest' && parts.length === 2) {
      if (request.method === 'GET' || request.method === 'HEAD') return getManifest(env)
      if (request.method === 'PUT') return (await authorize(request, env)) ?? putManifest(request, env)
      return error(405, 'method not allowed')
    }

    if (parts[0] === 'images' && parts.length === 3 && KINDS.includes(parts[1])) {
      const key = `${parts[1]}/${parts[2]}`
      // HEAD は etag の確認用（scripts/sync-photos.mjs）。本文はランタイムが落とす
      if (request.method === 'GET' || request.method === 'HEAD') {
        // 原本はフルサイズの作品そのものなので、公開しない
        if (parts[1] === 'originals') return (await authorize(request, env)) ?? getImage(key, env, false)
        // 版の印（?v=）付きの URL は中身が変わらないので、ずっと持たせる
        return getImage(key, env, url.searchParams.has('v'))
      }
      if (request.method === 'PUT') return (await authorize(request, env)) ?? putImage(key, request, env)
      if (request.method === 'DELETE') return (await authorize(request, env)) ?? deleteImage(key, env)
      return error(405, 'method not allowed')
    }

    return error(404, 'not found')
  }
} satisfies ExportedHandler<Env>

/**
 * ページに埋め込む写真の一覧を置いておくキャッシュ（Cloudflare のデータセンターごと）のキー。R2 から読むと
 * 応答が 0.1 秒ほど遅れるので、トップと Photos の HTML はここから読む。公開したら消す（putManifest）。
 * ほかのデータセンターには最大 MANIFEST_TTL 秒だけ古い一覧が残る。編集画面が読む /api/manifest は毎回 R2 から読む
 */
const MANIFEST_KEY = 'https://mu826.com/cache/manifest.json'
const MANIFEST_TTL = 60

async function photosOf(env: Env, ctx: ExecutionContext): Promise<Photo[]> {
  const cache = caches.default
  let response = await cache.match(MANIFEST_KEY)
  if (!response) {
    const object = await env.PHOTOS.get('manifest.json')
    response = new Response(object ? await object.text() : '[]', {
      headers: {'content-type': 'application/json', 'cache-control': `max-age=${MANIFEST_TTL}`}
    })
    ctx.waitUntil(cache.put(MANIFEST_KEY, response.clone()))
  }
  const result = parseManifest(await response.json())
  return 'error' in result ? [] : result.photos
}

/** そのページが最初に要る写真の Link ヘッダ。parts はパスを / で割ったもの */
function hintsOf(parts: string[], photos: Photo[]): string[] {
  // トップ: hero は 0 番から描き始めるので、最初の hero の写真。読むのは Web Worker なので
  // preload では「使われない」扱いになる。HTTP キャッシュを温める prefetch にする
  if (parts.length === 0) {
    const [first] = heroesOf(photos)
    return first ? [`<${heroSrc(first)}>; rel=prefetch`] : []
  }
  // Photos: カテゴリの先頭数枚（/photos/:category）。どの段を読むかは表示幅と画面の
  // 密度で決まるので、一覧用の段を候補に並べてブラウザに選ばせる。幅は列数が Auto のとき
  // （src/gallery/controls.ts の autoColumns）の写真 1 枚ぶん
  const category = parts[1]
  if (parts.length !== 2 || !isCategory(category)) return []
  // 一覧の JS（pickSource）と同じく、一覧用の段に拡大用の最大を足した候補（PC の高精細な画面の縦長が使う）
  const list = [...VARIANTS.filter((v) => v.use === 'list'), VARIANTS[VARIANTS.length - 1]]
  return photos
    .filter((photo) => photo.category === category)
    .slice(0, EAGER_THUMBS)
    .map((photo) => {
      const srcset = list
        .map((v) => {
          const width = Math.round(photo.w * Math.min(1, v.long / Math.max(photo.w, photo.h)))
          return `${imageUrl(v.kind, photo)} ${width}w`
        })
        .join(', ')
      // URL は imagesrcset を知らないブラウザ向けの代わり
      return `<${imageUrl('list-800', photo)}>; rel=preload; as=image; imagesrcset="${srcset}"; imagesizes="${SIZES}"`
    })
}

/**
 * Photos の一覧で、列数が Auto のときの写真 1 枚の表示幅に、マウスのある端末（HOVER）では段を選ぶときの
 * 余裕（LIST_HEADROOM）を掛けたもの。
 * 列数は src/gallery/controls.ts の autoColumns（640px 未満は 2 列、1280px 以上は 4 列、ほかは 3 列）。
 * 幅は容器の左右の余白と写真のあいだ（既定の隙間で、2 列は約 7px、3 列は約 14px × 2、4 列は約 12px × 3）を
 * 引いて列数で割る。一覧の JS が選ぶ段と揃えるため
 */
const SIZES = [
  ['(max-width: 639px)', '(100vw - 39px) / 2'],
  ['(max-width: 1279px)', '(100vw - 92px) / 3'],
  ['', '1181px / 4']
]
  .flatMap(([query, width]) => [
    `${query ? `${query} and ` : ''}${HOVER} calc(${width} * ${LIST_HEADROOM})`,
    `${query} calc(${width})`.trim()
  ])
  .join(', ')

/**
 * トップと Photos の HTML。最初に要る写真の先読みヘッダを足し、写真の一覧を埋め込む（src/photos/index.ts の
 * loadPhotos が読む）。JS が動いてから一覧を取りに行く往復が 1 回減り、すぐに段組を組める。
 * 中身が一覧ごとに変わるので、静的ファイルの ETag は外し、条件付きの取得（304）で古い一覧のまま
 * 使い回されないようにする
 */
async function pageWithHints(request: Request, env: Env, ctx: ExecutionContext, parts: string[]) {
  const headers = new Headers(request.headers)
  headers.delete('if-none-match')
  headers.delete('if-modified-since')
  const [page, photos] = await Promise.all([env.ASSETS.fetch(new Request(request, {headers})), photosOf(env, ctx)])
  if (!page.ok) return page
  // </script> で閉じられないよう、< を逃がす
  const json = JSON.stringify(photos).replace(/</g, '\\u003c')
  const body = new HTMLRewriter()
    .on('head', {
      element(head) {
        head.append(`<script type="application/json" id="manifest">${json}</script>`, {html: true})
      }
    })
    .transform(page)
  const response = new Response(body.body, page)
  response.headers.delete('etag')
  response.headers.delete('last-modified')
  response.headers.set('cache-control', 'no-cache')
  for (const hint of hintsOf(parts, photos)) response.headers.append('link', hint)
  return response
}

async function getManifest(env: Env) {
  const object = await env.PHOTOS.get('manifest.json')
  if (!object) return json([], {headers: {'cache-control': 'no-cache'}})
  return new Response(object.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 更新がすぐ反映されるよう、毎回 ETag で確認させる
      'cache-control': 'no-cache',
      etag: object.httpEtag
    }
  })
}

async function putManifest(request: Request, env: Env) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error(400, 'invalid json')
  }
  const result = parseManifest(body)
  if ('error' in result) return error(400, result.error)
  await env.PHOTOS.put('manifest.json', JSON.stringify(result.photos), {
    httpMetadata: {contentType: 'application/json'}
  })
  // 公開した人がすぐ確かめられるよう、このデータセンターのキャッシュは消す
  await caches.default.delete(MANIFEST_KEY)
  return json({count: result.photos.length})
}

async function getImage(key: string, env: Env, immutable: boolean) {
  const object = await env.PHOTOS.get(key)
  if (!object) return error(404, 'not found')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // 版の印が無い URL は、差し替えで同じ名前に上書きしうるので 1 日で再確認させる
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
      etag: object.httpEtag
    }
  })
}

async function putImage(key: string, request: Request, env: Env) {
  const contentType = request.headers.get('content-type')
  if (!contentType?.startsWith('image/')) return error(400, 'content-type must be image/*')
  if (!request.body) return error(400, 'empty body')
  const object = await env.PHOTOS.put(key, request.body, {httpMetadata: {contentType}})
  return json({key, size: object.size})
}

async function deleteImage(key: string, env: Env) {
  await env.PHOTOS.delete(key)
  return json({key})
}

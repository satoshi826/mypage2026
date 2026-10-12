// 写真の API。R2 に置いた原本・派生画像・manifest.json を読み書きする。
// 静的ファイルの配信は wrangler.jsonc の assets が担い、/api と /images だけここへ来る。
//
// | メソッド | パス                      | 認証 | 内容 |
// |----------|---------------------------|------|------|
// | GET      | /api/manifest             | なし | 写真の一覧 |
// | PUT      | /api/manifest             | 要   | 一覧を丸ごと置き換える |
// | GET      | /images/{kind}/{name}     | originals のみ要 | 画像。kind は派生の段（manifest.ts の VARIANTS）/ hero / originals |
// | PUT      | /images/{kind}/{name}     | 要   | 画像を置く。body がそのまま R2 へ |
// | DELETE   | /images/{kind}/{name}     | 要   | 画像を消す |
//
// 認証は Cloudflare Access。Access が付ける JWT を検証する（access.ts）。
//
// トップ（/）と Photos（/photos*）は静的ファイルをここ経由で返し、最初に要る写真の先読みヘッダを足す。
// どちらも JS の起動 → 一覧の取得と直列に待ってから写真を取りに行くので、HTML の時点でブラウザに
// 取り始めさせる。どの写真かは一覧（R2）で決まるので、ビルド時には出せない。

import {authorize} from './access'
import {EAGER_THUMBS, imageUrl, isCategory, parseManifest, VARIANTS, type Photo} from '../src/photos/manifest'

const KINDS: readonly string[] = [...VARIANTS.map((v) => v.kind), 'hero', 'originals']
const isKind = (value: string) => KINDS.includes(value)

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {'content-type': 'application/json; charset=utf-8', ...init.headers}
  })
const error = (status: number, message: string) => json({error: message}, {status})

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    if ((parts.length === 0 || parts[0] === 'photos') && (request.method === 'GET' || request.method === 'HEAD'))
      return pageWithHints(request, env, parts)

    if (parts[0] === 'api' && parts[1] === 'manifest' && parts.length === 2) {
      if (request.method === 'GET' || request.method === 'HEAD') return getManifest(env)
      if (request.method === 'PUT') return (await authorize(request, env)) ?? putManifest(request, env)
      return error(405, 'method not allowed')
    }

    if (parts[0] === 'images' && parts.length === 3 && isKind(parts[1])) {
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

async function photosOf(env: Env): Promise<Photo[]> {
  const object = await env.PHOTOS.get('manifest.json')
  if (!object) return []
  const result = parseManifest(await object.json())
  return 'error' in result ? [] : result.photos
}

/** そのページが最初に要る写真の Link ヘッダ。parts はパスを / で割ったもの */
function hintsOf(parts: string[], photos: Photo[]): string[] {
  // トップ: hero は 0 番から描き始めるので、最初の hero 用の写真。読むのは Web Worker なので
  // preload では「使われない」扱いになる。HTTP キャッシュを温める prefetch にする
  if (parts.length === 0) {
    const first = photos.find((photo) => photo.hero)
    return first ? [`<${imageUrl('hero', first)}>; rel=prefetch`] : []
  }
  // Photos: 既定は street。カテゴリの先頭数枚（/photos/:category）。どの段を読むかは表示幅と画面の
  // 密度で決まるので、一覧用の段を候補に並べてブラウザに選ばせる。幅は列数が Auto のとき
  // （狭い画面 2 列、ほかは 3 列。src/gallery/Gallery.tsx）の写真 1 枚ぶん
  const category = parts[1] ?? 'street'
  if (parts.length > 2 || !isCategory(category)) return []
  const list = VARIANTS.filter((v) => v.use === 'list')
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
 * Photos の一覧で、列数が Auto のときの写真 1 枚の表示幅。容器の左右の余白と写真のあいだ（既定の隙間で、
 * 狭い画面の 2 列は約 7px、ほかの 3 列は 16px × 2）を引いて列数で割る。一覧の JS が選ぶ段と揃えるため
 */
const SIZES = '(max-width: 639px) calc((100vw - 39px) / 2), calc((min(100vw, 1280px) - 96px) / 3)'

async function pageWithHints(request: Request, env: Env, parts: string[]) {
  const [page, photos] = await Promise.all([env.ASSETS.fetch(request), photosOf(env)])
  if (!page.ok) return page
  const response = new Response(page.body, page)
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

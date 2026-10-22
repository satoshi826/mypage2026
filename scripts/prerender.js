// vite build の後に走らせる。各ルートを HTML として書き出す。
//
// Vite の dev サーバを middleware モードで立て、ssrLoadModule で entry-server を読む。
// この経路なら動的 import は辿られないので、Hero（Worker / OffscreenCanvas）が
// Node 側で読み込まれることがない。
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import {subsetFonts} from './fonts.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 本番として読む。dev サーバの既定（development）のままだと import.meta.env.DEV が true になり、
// 開発用のパネルが HTML に入ってしまう（クライアントの本番バンドルには入らないので、表示が食い違う）。
// DEV は mode ではなく NODE_ENV で決まる
process.env.NODE_ENV = 'production'
const vite = await createServer({root, mode: 'production', appType: 'custom', server: {middlewareMode: true}})

try {
  const {render} = await vite.ssrLoadModule('/src/entry-server.tsx')
  const {ROUTES, NAME, ORIGIN} = await vite.ssrLoadModule('/src/app/routes.ts')
  const {PERSON} = await vite.ssrLoadModule('/src/app/profile.ts')
  const template = await inlineStyles(await readFile(join(dist, 'index.html'), 'utf8'))
  const hints = await preloadHints()

  // どのルートにも当たらないパス用は 404.html。Cloudflare の not_found_handling がこれを返す
  const pages = [
    ...ROUTES.map(({path, title, description}) => ({
      file: path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html'),
      path,
      title,
      description
    })),
    {file: join(dist, '404.html'), path: '/404', title: `Not found — ${NAME}`, description: 'ページが見つかりません。'}
  ].map((page) => ({...page, body: render(page.path)}))

  // 書体は全ページの本文が揃ってから、出てくる文字だけに絞る
  const fonts = await subsetFonts(
    root,
    dist,
    pages.map(({body}) => body)
  )

  // 検索に載せないページ。編集のログインの入口と、どこにも当たらないパス
  const hidden = (path) => path === '/admin' || path === '/404'

  const html = ({path, title, description, body}) => {
    const url = `${ORIGIN}${path}`
    const head = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      ...(hidden(path)
        ? ['<meta name="robots" content="noindex">']
        : [
            `<link rel="canonical" href="${url}">`,
            // SNS やメッセージで URL を貼られたときのプレビュー。画像はロゴを黒地に置いたもの（public/og.png）
            `<meta property="og:type" content="${path === '/about' ? 'profile' : 'website'}">`,
            `<meta property="og:site_name" content="${NAME}">`,
            `<meta property="og:title" content="${escapeHtml(title)}">`,
            `<meta property="og:description" content="${escapeHtml(description)}">`,
            `<meta property="og:url" content="${url}">`,
            `<meta property="og:image" content="${ORIGIN}/og.png">`,
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            '<meta property="og:locale" content="ja_JP">',
            '<meta name="twitter:card" content="summary_large_image">'
          ]),
      // 検索エンジン向けの人物の情報。トップと About に置く（src/app/profile.ts）
      ...(path === '/' || path === '/about'
        ? [`<script type="application/ld+json">${JSON.stringify(PERSON).replace(/</g, '\\u003c')}</script>`]
        : []),
      ...fonts,
      ...hints(path)
    ].join('\n    ')
    return template
      .replace(/<title>.*?<\/title>/, head)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  }

  for (const page of pages) {
    await mkdir(dirname(page.file), {recursive: true})
    await writeFile(page.file, html(page))
    console.log('prerendered', page.file.replace(root + '/', ''))
  }

  // サイトマップ。検索に載せるページの一覧（public/robots.txt から指す）
  const urls = pages
    .filter(({path}) => !hidden(path))
    .map(({path}) => `  <url><loc>${ORIGIN}${path}</loc></url>`)
    .join('\n')
  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  )
  console.log('sitemap', pages.filter(({path}) => !hidden(path)).length, 'pages')
} finally {
  await vite.close()
}

/**
 * Vite が書き出した CSS の読み込み（<link rel="stylesheet">）を、中身の <style> に置き換える。外部ファイルのままだと、
 * HTML が届いたあとにもう 1 往復待ってから描き始めることになり、遅い回線では最初の描画が 0.4 秒ほど遅れる。
 * CSS は gzip 後 7KB ほどなので、ページごとに持たせても重くない
 */
async function inlineStyles(html) {
  const links = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
  for (const [tag, href] of links) {
    const css = await readFile(join(dist, href), 'utf8')
    html = html.replace(tag, () => `<style>${css}</style>`)
  }
  return html
}

/**
 * 先読みのヒント。トップは「JS の起動 → hero チャンク → worker」と
 * 直列に待ってから写真を取りに行くので、HTML の時点で後ろの段を取り始めさせる。
 * 写真の一覧は、トップと Photos では Worker が HTML に埋め込むので、ここでは先読みしない（worker/index.ts）。
 * hero は lazy import なので、チャンク名はビルドの対応表から引く。
 * worker のチャンクは対応表に出ないので、dist/assets の名前で探す。
 * worker のスクリプトは別コンテキストが読むので preload では「使われない」扱いになり
 * 警告が出る。HTTP キャッシュを温めるだけの prefetch にする。
 * 写真そのものは一覧（R2）次第なので、ここでは出せない。Worker が応答ヘッダで足す（worker/index.ts）。
 */
async function preloadHints() {
  const manifest = JSON.parse(await readFile(join(dist, '.vite', 'manifest.json'), 'utf8'))
  const hero = manifest['src/hero/Hero.tsx']?.file
  const worker = (await readdir(join(dist, 'assets'))).find((name) => /^worker-.*\.js$/.test(name))
  if (!hero || !worker) throw new Error('hero のチャンクが見つからない。vite.config の build.manifest を確認する')

  return (path) =>
    path === '/'
      ? [`<link rel="prefetch" href="/assets/${worker}" as="script">`, `<link rel="modulepreload" href="/${hero}">`]
      : []
}

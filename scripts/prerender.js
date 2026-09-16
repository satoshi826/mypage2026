// vite build の後に走らせる。各ルートを HTML として書き出す。
//
// Vite の dev サーバを middleware モードで立て、ssrLoadModule で entry-server を読む。
// この経路なら動的 import は辿られないので、Hero（Worker / OffscreenCanvas）が
// Node 側で読み込まれることがない。
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const vite = await createServer({root, appType: 'custom', server: {middlewareMode: true}})

try {
  const {render} = await vite.ssrLoadModule('/src/entry-server.tsx')
  const {ROUTES, NAME} = await vite.ssrLoadModule('/src/app/routes.ts')
  const template = await readFile(join(dist, 'index.html'), 'utf8')

  const page = (path, title, description) => {
    const head = `<title>${escapeHtml(title)}</title>\n    <meta name="description" content="${escapeHtml(description)}">`
    return template
      .replace(/<title>.*?<\/title>/, head)
      .replace('<div id="root"></div>', `<div id="root">${render(path)}</div>`)
  }

  const write = async (file, html) => {
    await mkdir(dirname(file), {recursive: true})
    await writeFile(file, html)
    console.log('prerendered', file.replace(root + '/', ''))
  }

  for (const {path, title, description} of ROUTES) {
    const file = path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html')
    await write(file, page(path, title, description))
  }

  // どのルートにも当たらないパス用。Cloudflare の not_found_handling がこれを返す
  await write(join(dist, '404.html'), page('/404', `Not found — ${NAME}`, 'ページが見つかりません。'))
} finally {
  await vite.close()
}

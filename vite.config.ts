import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import preact from '@preact/preset-vite'
import tailwind from '@tailwindcss/vite'

const API_PORT = 8787

/**
 * `npm run dev` で写真の API（wrangler dev）も一緒に立ち上げる。
 * Vite の dev サーバーと寿命を揃え、設定の変更で Vite が再起動するときは先に止める。
 * 単体で動かしたいときは `npm run dev:api`。
 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      // prerender（middleware モード）では立てない。httpServer がなく止める契機もないので、
      // 立てると wrangler dev が残ってビルドが終わらない
      if (!server.httpServer) return
      const wrangler = fileURLToPath(new URL('./node_modules/.bin/wrangler', import.meta.url))
      // 同じプロセスグループに置く。端末の Ctrl+C は wrangler にも直接届き、自分で workerd を止める
      const child = spawn(wrangler, ['dev', '--port', String(API_PORT)], {stdio: ['ignore', 'pipe', 'pipe']})
      const {logger} = server.config
      // wrangler の準備が済むまで /api と /images を待たせる。Vite のほうが先に立ち上がるので、開いた直後の
      // 一覧の取得が失敗し、そのページは写真が出ないままになるため。終了したときも待つのをやめる
      let ready!: () => void
      const started = new Promise<void>((resolve) => (ready = resolve))
      server.middlewares.use((req, _res, next) => {
        if (/^\/(api|images)\//.test(req.url ?? '')) void started.then(next)
        else next()
      })
      const relay = (chunk: unknown) => {
        const text = String(chunk)
        if (text.includes('Ready on')) ready()
        logger.info(text.trimEnd().replace(/^(?=.)/gm, '[api] '))
      }
      child.stdout.on('data', relay)
      child.stderr.on('data', relay)
      child.once('exit', (code: number | null) => {
        ready()
        // 自分で止めたとき（設定の変更での再起動など）は知らせない
        if (code && !child.killed)
          logger.error(`[api] wrangler dev が終了した (code ${code})。/api と /images は応答しない`)
      })
      // 設定の変更での再起動と、SIGTERM や stdin の終了での停止は httpServer が閉じる
      server.httpServer.once('close', () => child.kill())
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  // React の名前で書いた依存を Preact の互換層へ流す設定（reactAliases）は切る。互換層を使わず、Preact 本体で書くため
  plugins: [preact({reactAliasesEnabled: false}), tailwind(), apiDev()],
  worker: {
    format: 'es'
  },
  build: {
    // チャンクの対応表。prerender が hero のチャンクを先読みのヒントにするために読む
    manifest: true,
    rolldownOptions: {
      // Service Worker（src/sw/worker.ts）は登録する URL が固定なので、ハッシュを付けずに /sw.js に置く
      input: {index: 'index.html', sw: 'src/sw/worker.ts'},
      output: {entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js')}
    }
  },
  define: {
    // Service Worker の置き場の名前に付ける、ビルドごとの印。前のビルドの JS・CSS を消すため
    __BUILD__: JSON.stringify(Date.now().toString(36))
  },
  server: {
    // 写真の API と画像は Worker（wrangler dev）が持つ。dev ではそちらへ流す
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/images': `http://localhost:${API_PORT}`
    }
  }
})

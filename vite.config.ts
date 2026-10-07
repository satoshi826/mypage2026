import {spawn, type ChildProcess} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const API_PORT = 8787

/**
 * `npm run dev` で写真の API（wrangler dev）も一緒に立ち上げる。
 * Vite の dev サーバーと寿命を揃え、設定の変更で Vite が再起動するときは先に止める。
 * 単体で動かしたいときは `npm run dev:api`。
 */
function apiDev(): Plugin {
  let child: ChildProcess | null = null
  const stop = () => {
    child?.kill()
    child = null
  }
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const wrangler = fileURLToPath(new URL('./node_modules/.bin/wrangler', import.meta.url))
      // 同じプロセスグループに置く。端末の Ctrl+C は wrangler にも直接届き、自分で workerd を止める
      child = spawn(wrangler, ['dev', '--port', String(API_PORT)], {stdio: ['ignore', 'pipe', 'pipe']})
      const {logger} = server.config
      const relay = (chunk: unknown) =>
        logger.info(
          String(chunk)
            .trimEnd()
            .replace(/^(?=.)/gm, '[api] ')
        )
      child.stdout?.on('data', relay)
      child.stderr?.on('data', relay)
      child.once('exit', (code: number | null) => {
        if (code) logger.error(`[api] wrangler dev が終了した (code ${code})。/api と /images は応答しない`)
      })
      // 設定の変更での再起動と、SIGTERM や stdin の終了での停止は httpServer が閉じる
      server.httpServer?.once('close', stop)
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwind(), apiDev()],
  worker: {
    format: 'es'
  },
  build: {
    // チャンクの対応表。prerender が hero のチャンクを先読みのヒントにするために読む
    manifest: true
  },
  server: {
    // 写真の API と画像は Worker（wrangler dev）が持つ。dev ではそちらへ流す
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/images': `http://localhost:${API_PORT}`
    }
  }
})

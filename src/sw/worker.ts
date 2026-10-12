// Service Worker。ビルドで /sw.js になる（vite.config.ts）。本番だけで登録する（register.ts）。
// ほかのモジュールを読み込まない。読み込むとアプリと共有のチャンクに分かれ、classic の Service Worker として動かなくなる。
//
// | 対象 | 出し方 | 置き場 |
// |------|--------|--------|
// | 版の印（?v=）付きの画像 | 手元にあれば手元から。無ければ取って置く | images（デプロイをまたいで残す） |
// | /assets/（名前にハッシュが付く JS・CSS・フォント） | 手元にあれば手元から。無ければ取って置く | assets-<ビルド> |
// | ページ（HTML）と /api/manifest | 通信で最新を取り、取れなければ手元に置いたもの | pages-<ビルド> |
//
// ページから {type: 'images', keep, fetch} を受け取り、images のうち keep に無いもの（差し替えや削除で
// 古くなった版）を消し、fetch のうち手元に無いものを順に取って置く（先読み）。

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope
/** ビルドごとに変わる印（vite.config.ts の define） */
declare const __BUILD__: string

const IMAGES = 'images'
const ASSETS = `assets-${__BUILD__}`
const PAGES = `pages-${__BUILD__}`
/**
 * 先読みで同時に取る数。本数が少ないうちは往復の待ち時間 × 枚数 ÷ 本数で時間が決まり、帯域は余る。HTTP/2 で
 * 1 本の接続に重ねて流せるので、本数を増やして待ちを重ねる。往復 310ms の回線では 8 → 16 本で約 2 倍速くなり、
 * 32 本では回線の太さで頭打ちになった
 */
const PARALLEL = 16

type Message = {type: 'images'; keep: string[]; fetch: string[]}

self.addEventListener('install', () => {
  // 古い Service Worker の終わりを待たずに入れ替わる。どの版でも出し方は同じなので食い違わない
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 前のビルドの assets と pages を消す。画像は版の印で区別するので残す
      for (const name of await caches.keys())
        if (name !== IMAGES && name !== ASSETS && name !== PAGES) await caches.delete(name)
      // 開いているページは途中から引き受けない（clients.claim しない）。最初の訪問の読み込みの途中に割り込むと、
      // 残りの画像がここを通って遅れるため。先読みした画像はブラウザのキャッシュにも入るので、最初の訪問でも
      // 列数の切り替えは通信を待たない
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/images/') && url.searchParams.has('v')) event.respondWith(cacheFirst(IMAGES, request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(ASSETS, request))
  else if (request.mode === 'navigate' || url.pathname === '/api/manifest')
    event.respondWith(networkFirst(PAGES, request))
})

self.addEventListener('message', (event) => {
  const data = event.data as Message
  if (data?.type === 'images') event.waitUntil(syncImages(data))
})

async function cacheFirst(name: string, request: Request) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) void cache.put(request, response.clone())
  return response
}

async function networkFirst(name: string, request: Request) {
  const cache = await caches.open(name)
  try {
    const response = await fetch(request)
    if (response.ok) void cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    throw error
  }
}

async function syncImages({keep, fetch: wanted}: Message) {
  const cache = await caches.open(IMAGES)
  const valid = new Set(keep.map((path) => new URL(path, self.location.origin).href))
  const cached = new Set<string>()
  for (const request of await cache.keys()) {
    if (valid.has(request.url)) cached.add(request.url)
    else await cache.delete(request)
  }
  const queue = wanted.map((path) => new URL(path, self.location.origin).href).filter((url) => !cached.has(url))
  await Promise.all(
    Array.from({length: PARALLEL}, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        try {
          const response = await fetch(url, {priority: 'low'})
          if (response.ok) await cache.put(url, response)
        } catch {
          // 通信が切れたら次の機会に回す
          return
        }
      }
    })
  )
}

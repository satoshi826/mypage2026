// 計測を回す。使い方は bench/README.md。
//
//   node bench/run.mjs [--profile <名前>] [--scenario <名前>] [--runs <回数>] [--url <URL>] [--headed]
//
// --url を省くと、dist を wrangler dev で配信して測る（本番と同じく Worker が写真の API も持つ）。

import {spawn, execSync} from 'node:child_process'
import {mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync} from 'node:fs'
import {cpus, platform, release} from 'node:os'
import {join, extname} from 'node:path'
import {gzipSync} from 'node:zlib'
import {parseArgs} from 'node:util'
import puppeteer from 'puppeteer-core'
import {PROFILES, SCENARIOS} from './scenarios.mjs'
import {median, summary} from './report.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const RESULTS = join(ROOT, 'bench/results')
/** 計測用の wrangler dev のポート。npm run dev が使う 8787 とぶつけない */
const PORT = 8790
const FRAME = 1000 / 60

const {values: args} = parseArgs({
  options: {
    profile: {type: 'string', multiple: true},
    scenario: {type: 'string', multiple: true},
    runs: {type: 'string', default: '3'},
    url: {type: 'string'},
    headed: {type: 'boolean', default: false}
  }
})
const profiles = args.profile ?? Object.keys(PROFILES)
const scenarios = args.scenario ?? Object.keys(SCENARIOS)
const runs = Number(args.runs)
for (const name of profiles) if (!PROFILES[name]) throw new Error(`端末の条件が無い: ${name}`)
for (const name of scenarios) if (!SCENARIOS[name]) throw new Error(`場面が無い: ${name}`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** dist を配信する wrangler dev を立てる。止める関数を返す */
async function serve() {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('dist が無い。先に npm run build')
  // workerd などの子プロセスごと止められるよう、プロセスグループを分ける
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore'
  })
  const stop = () => {
    try {
      process.kill(-child.pid)
    } catch {}
  }
  const url = `http://127.0.0.1:${PORT}`
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/api/manifest`)).ok) return {url, stop}
    } catch {}
    await sleep(500)
  }
  stop()
  throw new Error('wrangler dev が立ち上がらない')
}

/** ページに仕込む収集。長いフレーム、LCP、レイアウトのずれを貯め、record / stop のあいだのフレームを記録する */
function collector() {
  const bench = {loaf: [], lcp: null, cls: 0, frames: null, from: 0}
  window.__bench = bench
  const observe = (type, onEntry) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({type, buffered: true})
    } catch {}
  }
  observe('long-animation-frame', (e) => bench.loaf.push({start: e.startTime, blocking: e.blockingDuration}))
  observe('largest-contentful-paint', (e) => (bench.lcp = e.startTime))
  observe('layout-shift', (e) => {
    if (!e.hadRecentInput) bench.cls += e.value
  })
  bench.record = () => {
    const times = []
    bench.frames = times
    bench.from = performance.now()
    const tick = (now) => {
      if (bench.frames !== times) return
      times.push(now)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  bench.stop = () => {
    const to = performance.now()
    const times = bench.frames
    bench.frames = null
    const loaf = bench.loaf.filter((e) => e.start >= bench.from && e.start < to)
    return {times, duration: to - bench.from, blocking: loaf.reduce((n, e) => n + e.blocking, 0)}
  }
}

/** 1 回の計測のための新しいページ。ほかの回とキャッシュや状態を共有しない */
async function open(browser, profile) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport(profile.viewport)
  await page.emulateCPUThrottling(profile.cpu)
  await page.evaluateOnNewDocument(collector)
  // 転送量。worker が読む写真も含めるため、ページの Resource Timing ではなく CDP の通知から数える
  const client = await page.createCDPSession()
  await client.send('Network.enable')
  const transfer = {bytes: 0, requests: 0}
  client.on('Network.loadingFinished', ({encodedDataLength}) => {
    transfer.bytes += encodedDataLength
    transfer.requests++
  })
  return {page, client, transfer, close: () => context.close()}
}

/** 開いたあと、通信が落ち着くまで待つ */
const settle = (page) => page.waitForNetworkIdle({idleTime: 800, timeout: 60000}).catch(() => {})

async function measureLoad(browser, profile, scenario, url) {
  const {page, client, transfer, close} = await open(browser, profile)
  try {
    if (scenario.cache) {
      await page.goto(url + scenario.path, {waitUntil: 'load'})
      await settle(page)
      transfer.bytes = transfer.requests = 0
    } else await page.setCacheEnabled(false)
    // page.emulateNetworkConditions は 127.0.0.1 への通信に効かなかった（Chrome 155）。CDP を直接呼ぶと効く
    if (profile.network) {
      const {latency, download, upload} = profile.network
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency,
        downloadThroughput: download,
        uploadThroughput: upload
      })
    }
    await page.goto(url + scenario.path, {waitUntil: 'load', timeout: 120000})
    await settle(page)
    if (scenario.path === '/')
      await page
        .waitForFunction(() => performance.getEntriesByName('hero:photo').length > 0, {timeout: 60000})
        .catch(() => {})
    const metrics = await page.metrics()
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      return {
        ttfb: nav.responseStart,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        lcp: window.__bench.lcp,
        cls: window.__bench.cls,
        hero: performance.getEntriesByName('hero:photo')[0]?.startTime ?? null
      }
    })
    return {
      ...timing,
      transferKB: transfer.bytes / 1024,
      requests: transfer.requests,
      // ページを開き直すと計測の値は 0 から数え直すので、開いたあとの値がそのまま読み込みのぶん
      script: metrics.ScriptDuration * 1000,
      heapMB: metrics.JSHeapUsedSize / 2 ** 20
    }
  } finally {
    await close()
  }
}

async function measureInteraction(browser, profile, scenario, url) {
  const {page, client, close} = await open(browser, profile)
  const touch = !!profile.viewport.hasTouch
  const ctx = {
    page,
    wait: sleep,
    /** セレクタか要素を押す。タッチの端末はタップ */
    press: async (target) => {
      const el = typeof target === 'string' ? await page.waitForSelector(target, {visible: true}) : target
      if (touch) await el.tap()
      else await el.click()
    },
    /** 画面の中央から下へ distance px スクロールする。タッチは指で、PC はホイールで */
    scroll: (distance) =>
      client.send('Input.synthesizeScrollGesture', {
        x: profile.viewport.width / 2,
        y: profile.viewport.height / 2,
        yDistance: -distance,
        speed: 2000,
        gestureSourceType: touch ? 'touch' : 'mouse'
      })
  }
  try {
    await page.goto(url + scenario.path, {waitUntil: 'load', timeout: 120000})
    await settle(page)
    await scenario.setup?.(ctx)
    await sleep(1000)
    const before = await page.metrics()
    await page.evaluate(() => window.__bench.record())
    await scenario.run(ctx)
    const {times, duration, blocking} = await page.evaluate(() => window.__bench.stop())
    const after = await page.metrics()
    // 終わった時点で DOM にある画像の、デコード後の大きさ（1 画素 4 バイト）。GPU 側のメモリの目安
    const imageMB = await page.evaluate(
      () =>
        [...document.images].reduce(
          (n, img) => n + (img.currentSrc ? img.naturalWidth * img.naturalHeight * 4 : 0),
          0
        ) /
        2 ** 20
    )
    const gaps = times.slice(1).map((t, i) => t - times[i])
    const sorted = [...gaps].sort((a, b) => a - b)
    const delta = (key) => (after[key] - before[key]) * 1000
    return {
      fps: (times.length / duration) * 1000,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      dropped: gaps.reduce((n, gap) => n + Math.max(0, Math.round(gap / FRAME) - 1), 0),
      blocking,
      script: delta('ScriptDuration'),
      style: delta('RecalcStyleDuration'),
      layout: delta('LayoutDuration'),
      task: delta('TaskDuration'),
      heapMB: after.JSHeapUsedSize / 2 ** 20,
      imageMB
    }
  } finally {
    await close()
  }
}

/** dist の大きさ。JS・CSS・HTML は gzip 後、フォントはもともと圧縮されているのでそのまま */
function bundle() {
  const sizes = {jsKB: 0, cssKB: 0, htmlKB: 0, fontKB: 0}
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else {
        const ext = extname(name)
        const key = {'.js': 'jsKB', '.css': 'cssKB', '.html': 'htmlKB', '.woff2': 'fontKB', '.otf': 'fontKB'}[ext]
        if (!key) continue
        const data = readFileSync(path)
        sizes[key] += (key === 'fontKB' ? data.length : gzipSync(data).length) / 1024
      }
    }
  }
  walk(join(ROOT, 'dist'))
  return Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, {median: v, min: v, max: v, values: [v]}]))
}

const git = (command) => {
  try {
    return execSync(`git ${command}`, {cwd: ROOT}).toString().trim()
  } catch {
    return null
  }
}

const server = args.url ? {url: args.url.replace(/\/$/, ''), stop: () => {}} : await serve()
const browser = await puppeteer.launch({
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_PATH,
  headless: !args.headed
})
const result = {
  meta: {
    date: new Date().toISOString(),
    commit: git('rev-parse --short HEAD'),
    dirty: !!git('status --porcelain'),
    url: args.url ?? 'local (wrangler dev)',
    chrome: await browser.version(),
    headed: args.headed,
    machine: `${platform()} ${release()} / ${cpus()[0]?.model} × ${cpus().length}`,
    runs
  },
  results: {}
}
try {
  if (!args.url) result.results.build = {gzip: {kind: 'build', metrics: bundle()}}
  for (const profileName of profiles) {
    const profile = PROFILES[profileName]
    result.results[profileName] = {}
    for (const scenarioName of scenarios) {
      const scenario = SCENARIOS[scenarioName]
      const measure = scenario.kind === 'load' ? measureLoad : measureInteraction
      const samples = []
      try {
        for (let i = 0; i < runs; i++) {
          process.stdout.write(`\r${profileName} / ${scenarioName} ${i + 1}/${runs}   `)
          samples.push(await measure(browser, profile, scenario, server.url))
        }
      } catch (error) {
        // 1 つの場面の失敗で、ほかの場面の結果まで失わない
        console.error(`\n${profileName} / ${scenarioName} が失敗した: ${error.message}`)
        result.results[profileName][scenarioName] = {kind: scenario.kind, error: error.message, metrics: {}}
        continue
      }
      const metrics = {}
      for (const key of Object.keys(samples[0])) {
        const values = samples.map((s) => s[key])
        const present = values.filter((v) => v !== null)
        metrics[key] = {
          median: median(values),
          min: present.length ? Math.min(...present) : null,
          max: present.length ? Math.max(...present) : null,
          values
        }
      }
      result.results[profileName][scenarioName] = {kind: scenario.kind, metrics}
    }
  }
} finally {
  process.stdout.write('\n')
  await browser.close()
  server.stop()
}

mkdirSync(RESULTS, {recursive: true})
const file = join(
  RESULTS,
  `${result.meta.date.replace(/[:.]/g, '-')}-${result.meta.commit ?? 'nogit'}${result.meta.dirty ? '-dirty' : ''}.json`
)
writeFileSync(file, JSON.stringify(result, null, 2))
console.log(summary(result))
console.log(`\n保存: ${file.replace(ROOT, '')}`)

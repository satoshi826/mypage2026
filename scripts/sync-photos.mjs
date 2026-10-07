#!/usr/bin/env node
// 写真を、.photos/（原本から書き出したもの）、ローカルの R2（wrangler dev）、本番の R2 の
// あいだで動かす。
//
//   npm run photos:import          # .photos/ → ローカル。原本からの最初の移行と再派生のあと
//   npm run photos:pull            # 本番 → ローカル
//   npm run photos:push            # ローカル → 本番
//   node scripts/sync-photos.mjs pull --dry-run   # 何が変わるかだけ出す
//   node scripts/sync-photos.mjs push --yes       # 確認を飛ばす
//
// 一覧（manifest.json）を正とし、各写真の thumb / gallery / hero を etag で比べて
// 違うものだけ送る。送り先の一覧にあって送り元にない写真は、画像ごと消す。
// 原本（originals）は扱わない（大きく、本番の読み出しに認証が要るため）。
//
// ローカル側は wrangler dev の API（LOCAL_API、既定 http://localhost:8787）を使うので、
// `npm run dev` を動かしたまま実行する。本番側は、読みは公開 URL（SITE）、書きは wrangler
// （ログイン済みであること）。wrangler は 1 オブジェクトに 1〜2 秒かかる。

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {createInterface} from 'node:readline/promises'
import {fileURLToPath} from 'node:url'

const LOCAL = process.env.LOCAL_API ?? 'http://localhost:8787'
const SITE = process.env.SITE ?? 'https://mypage2026.stosto826.workers.dev'
const PHOTOS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.photos')
const BUCKET = 'mypage2026-photos'
const KINDS = ['thumb', 'gallery', 'hero']
const PARALLEL = 6

const [direction, ...flags] = process.argv.slice(2)
if (!['import', 'pull', 'push'].includes(direction)) {
  console.error('使い方: node scripts/sync-photos.mjs <import|pull|push> [--dry-run] [--yes]')
  process.exit(2)
}
const dryRun = flags.includes('--dry-run')
const yes = flags.includes('--yes')
const [from, to] = {import: [PHOTOS_DIR, LOCAL], pull: [SITE, LOCAL], push: [LOCAL, SITE]}[direction]

const isDir = (base) => base === PHOTOS_DIR
const imageUrl = (base, key) => (isDir(base) ? join(base, key) : `${base}/images/${key}`)
const keysOf = (photo) => KINDS.map((kind) => `${kind}/${photo.file}.webp`)

async function manifest(base) {
  if (isDir(base)) return JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
  const res = await fetch(`${base}/api/manifest`, {cache: 'no-store'})
  if (!res.ok) throw new Error(`${base}/api/manifest: ${res.status}`)
  return res.json()
}

/** etag。無ければ null。ファイルは R2 と同じ形（MD5 を引用符で囲む）で作る */
async function etag(url) {
  if (!url.startsWith('http')) {
    return existsSync(url) ? `"${createHash('md5').update(readFileSync(url)).digest('hex')}"` : null
  }
  const res = await fetch(url, {method: 'HEAD'})
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.headers.get('etag')
}

/** 送り元から 1 オブジェクト読む */
async function read(key) {
  const url = imageUrl(from, key)
  if (!url.startsWith('http')) return {body: readFileSync(url), contentType: 'image/webp'}
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${key}: ${res.status}`)
  return {body: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'image/webp'}
}

async function mapLimit(items, limit, fn) {
  const out = []
  let next = 0
  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i])
    })
  )
  return out
}

function wrangler(...args) {
  execFileSync('npx', ['--no-install', 'wrangler', 'r2', 'object', ...args, '--remote'], {stdio: ['ignore', 'ignore', 'inherit']})
}

/** 送り先へ 1 オブジェクト置く。本番は wrangler、ローカルは API */
async function put(key, body, contentType, tmp) {
  if (to === LOCAL) {
    const res = await fetch(imageUrl(LOCAL, key), {method: 'PUT', headers: {'content-type': contentType}, body})
    if (!res.ok) throw new Error(`PUT ${key}: ${res.status}`)
    return
  }
  const file = join(tmp, key.replace(/\//g, '__'))
  writeFileSync(file, Buffer.from(body))
  wrangler('put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType)
}

async function del(key) {
  if (to === LOCAL) {
    const res = await fetch(imageUrl(LOCAL, key), {method: 'DELETE'})
    if (!res.ok) throw new Error(`DELETE ${key}: ${res.status}`)
    return
  }
  wrangler('delete', `${BUCKET}/${key}`)
}

async function putManifest(photos, tmp) {
  const body = JSON.stringify(photos)
  if (to === LOCAL) {
    const res = await fetch(`${LOCAL}/api/manifest`, {method: 'PUT', headers: {'content-type': 'application/json'}, body})
    if (!res.ok) throw new Error(`PUT manifest: ${res.status}`)
    return
  }
  const file = join(tmp, 'manifest.json')
  writeFileSync(file, body)
  wrangler('put', `${BUCKET}/manifest.json`, '--file', file, '--content-type', 'application/json')
}

const source = await manifest(from)
const target = await manifest(to)
console.log(`${direction}: ${from} (${source.length} 枚) → ${to} (${target.length} 枚)`)

// 送るもの: 送り元にあって、送り先と etag が違う画像
const wanted = source.flatMap(keysOf)
const copies = (
  await mapLimit(wanted, PARALLEL, async (key) => {
    const [a, b] = await Promise.all([etag(imageUrl(from, key)), etag(imageUrl(to, key))])
    if (a === null) return {key, missing: true}
    return a === b ? null : {key}
  })
).filter(Boolean)
const missing = copies.filter((c) => c.missing).map((c) => c.key)
const toCopy = copies.filter((c) => !c.missing).map((c) => c.key)

// 消すもの: 送り先の一覧にだけある写真の画像
const sourceFiles = new Set(source.map((p) => p.file))
const orphaned = target.filter((p) => !sourceFiles.has(p.file)).flatMap(keysOf)
const toDelete = (await mapLimit(orphaned, PARALLEL, async (key) => ((await etag(imageUrl(to, key))) ? key : null))).filter(Boolean)

const manifestChanged = JSON.stringify(source) !== JSON.stringify(target)

console.log(`  画像を送る: ${toCopy.length}`)
console.log(`  画像を消す: ${toDelete.length}`)
console.log(`  一覧: ${manifestChanged ? '置き換える' : '同じ'}`)
// 最初の移行では hero: false の写真に hero 画像を作っていないので、その分はここに出る
if (missing.length) console.log(`  送り元に画像がないので飛ばす: ${missing.length}（例 ${missing.slice(0, 3).join(', ')}）`)
for (const key of toCopy) console.log(`    + ${key}`)
for (const key of toDelete) console.log(`    - ${key}`)

if (dryRun) process.exit(0)
if (!toCopy.length && !toDelete.length && !manifestChanged) {
  console.log('変更なし')
  process.exit(0)
}
if (!yes) {
  const rl = createInterface({input: process.stdin, output: process.stdout})
  const answer = await rl.question(`${to} を書き換える。続ける? [y/N] `)
  rl.close()
  if (answer.trim().toLowerCase() !== 'y') process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'sync-photos-'))
try {
  // 本番へは wrangler を 1 つずつ。ローカルへは並列
  const limit = to === LOCAL ? PARALLEL : 1
  await mapLimit(toCopy, limit, async (key) => {
    const {body, contentType} = await read(key)
    await put(key, body, contentType, tmp)
    console.log(`  + ${key}`)
  })
  await mapLimit(toDelete, limit, async (key) => {
    await del(key)
    console.log(`  - ${key}`)
  })
  if (manifestChanged) {
    await putManifest(source, tmp)
    console.log('  一覧を置き換えた')
  }
} finally {
  rmSync(tmp, {recursive: true, force: true})
}
console.log('done')

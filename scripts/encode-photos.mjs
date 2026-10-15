#!/usr/bin/env node
// 原本から、サイトで使う派生画像を .photos/ に書き出し、一覧 .photos/manifest.json を更新する。
// できたものは `npm run photos:import` でローカルの R2 へ入れ、`npm run photos:push` で本番へ送る。
// 正本は R2 で、.photos/ は作業用。
// 日常の追加・入れ替えは管理画面（/admin）で行い、これは最初の移行と作り直しのためのもの。
//
//   npm run photos:originals             # 本番の一覧を .photos/manifest.json に取り、無い原本を R2 から取る
//   npm run photos:encode                # .photos/originals/ から書き出す
//   npm run photos:encode -- <原本のディレクトリ>
//
// 派生は段ごとに .photos/<kind>/ へ。形は src/photos/manifest.ts の VARIANTS（長辺、画質）で、カラー、
// トリミングなし。トップの hero も、この段の 1 つ（拡大用の 1200）を読む。
//
// 一覧の順番・カテゴリ・hero の選択は既存の .photos/manifest.json から引き継ぐ。一覧にあって原本が
// 無い写真があれば止める（作り直せないので）。新規の写真は一覧の末尾に足し、彩度で color / street を
// 仮置きし、hero には使わない（hero を持たない）。
// 必要なツール: imagemagick, cwebp

import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {cpus, tmpdir} from 'node:os'
import {dirname, extname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {readVariants} from './variants.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PHOTOS = join(ROOT, '.photos')
const SRC = process.argv[2] ?? join(PHOTOS, 'originals')
const LIST = join(PHOTOS, 'manifest.json')
/** 平均彩度（HSL の S、0〜1）がこれを超えたらカラー扱い */
const COLOR_THRESHOLD = 0.08
const PARALLEL = Math.max(1, Math.min(4, cpus().length - 1))

const variants = readVariants(ROOT)
const largest = Math.max(...variants.map((v) => v.long))

const exec = promisify(execFile)
const run = async (cmd, args) => (await exec(cmd, args)).stdout.trim()

// 原本。名前（拡張子なし）→ パス
const originals = new Map()
for (const name of existsSync(SRC) ? readdirSync(SRC) : []) {
  if (['.jpg', '.jpeg', '.png'].includes(extname(name).toLowerCase()))
    originals.set(name.slice(0, -extname(name).length), join(SRC, name))
}
if (originals.size === 0) throw new Error(`${SRC} に jpg / jpeg / png がない`)

const prev = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : []
const missing = prev.filter((p) => !originals.has(p.file)).map((p) => p.file)
if (missing.length) {
  console.error(`一覧にあって原本が無い写真: ${missing.join(', ')}`)
  console.error('npm run photos:originals で本番の R2 から取るか、原本を置いてから実行する')
  process.exit(1)
}
const known = new Set(prev.map((p) => p.file))
const order = [
  ...prev.map((p) => ({...p, isNew: false})),
  ...[...originals.keys()]
    .filter((file) => !known.has(file))
    .sort()
    .map((file) => ({file, isNew: true}))
]

for (const variant of variants) mkdirSync(join(PHOTOS, variant.kind), {recursive: true})
const tmp = mkdtempSync(join(tmpdir(), 'encode-photos-'))

async function encode(entry) {
  const src = originals.get(entry.file)
  const base = join(tmp, `${entry.file}.png`)
  // 一番大きい段に縮めたものを元に、各段を縮める。縦横は保ったまま
  await run('magick', [src, '-auto-orient', '-resize', `${largest}x${largest}>`, '-strip', base])
  const [w, h] = (await run('magick', ['identify', '-format', '%w %h', base])).split(' ').map(Number)
  for (const variant of variants) {
    const scaled = variant.long >= Math.max(w, h) ? base : join(tmp, `${entry.file}-${variant.long}.png`)
    if (scaled !== base) await run('magick', [base, '-resize', `${variant.long}x${variant.long}>`, scaled])
    await run('cwebp', [
      '-quiet',
      '-q',
      String(variant.quality),
      scaled,
      '-o',
      join(PHOTOS, variant.kind, `${entry.file}.webp`)
    ])
  }
  let {category, hero} = entry
  if (entry.isNew) {
    const saturation = Number(
      await run('magick', [
        src,
        '-define',
        'jpeg:size=400x400',
        '-resize',
        '200x200',
        '-colorspace',
        'HSL',
        '-channel',
        'G',
        '-separate',
        '-format',
        '%[fx:mean]',
        'info:'
      ])
    )
    category = saturation > COLOR_THRESHOLD ? 'color' : 'street'
    hero = undefined
  }
  // 版は段（VARIANTS の順）をつないだ中身のハッシュ。中身が変われば版が変わる
  const hash = createHash('sha256')
  for (const variant of variants) hash.update(readFileSync(join(PHOTOS, variant.kind, `${entry.file}.webp`)))
  const v = hash.digest('hex').slice(0, 10)
  console.log(`${entry.file}  ${w}x${h}  ${category}  hero=${hero ?? '-'}  v=${v}${entry.isNew ? '  （新規）' : ''}`)
  return {file: entry.file, w, h, category, hero, v}
}

// PARALLEL 枚ずつ同時に書き出す。一覧の順番は保つ
const out = []
try {
  let next = 0
  await Promise.all(
    Array.from({length: PARALLEL}, async () => {
      for (let i = next++; i < order.length; i = next++) out[i] = await encode(order[i])
    })
  )
} finally {
  rmSync(tmp, {recursive: true, force: true})
}

writeFileSync(LIST, `${JSON.stringify(out, null, 2)}\n`)
console.log(`${out.length} 枚を書き出し、${LIST.replace(ROOT + '/', '')} を更新した`)

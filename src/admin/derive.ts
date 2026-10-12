// 原本から派生画像をブラウザで作る。Workers には画像ライブラリがないので、
// 管理画面がアップロード前に縮小・トリミング・グレースケール・WebP 化まで済ませる。
// 形は scripts/encode-photos.mjs と揃える（段は photos/manifest.ts の VARIANTS、hero は 1152x768 のグレースケール）。

import {VARIANTS, type Variant} from '../photos/manifest'
import {SOURCE_H, SOURCE_W} from '../hero/table'

const HERO_QUALITY = 0.92

export type Derived = {
  /** 段ごとの派生。キーは R2 の kind */
  variants: [Variant['kind'], Blob][]
  hero: Blob
  /** 一番大きい派生の寸法（manifest の w / h） */
  w: number
  h: number
  /** 派生の版（manifest の v） */
  v: string
}

export async function derive(file: File): Promise<Derived> {
  // EXIF の向きを反映して読む
  const source = await createImageBitmap(file, {imageOrientation: 'from-image'})
  try {
    // 一番大きい段を原本から縮め、ほかの段はそこから縮める（大きい順に）
    const largest = Math.max(...VARIANTS.map((v) => v.long))
    const scale = Math.min(1, largest / Math.max(source.width, source.height))
    const w = Math.round(source.width * scale)
    const h = Math.round(source.height * scale)
    const base = downscale(source, w, h)
    const variants: Derived['variants'] = []
    for (const variant of [...VARIANTS].sort((a, b) => b.long - a.long)) {
      const s = Math.min(1, variant.long / Math.max(w, h))
      const canvas = s === 1 ? base : downscale(base, Math.round(w * s), Math.round(h * s))
      variants.push([variant.kind, await toWebp(canvas, variant.quality / 100)])
    }

    // hero: 中央基準で 3:2 に切り出してから縮小、グレースケール
    const cropScale = Math.max(SOURCE_W / source.width, SOURCE_H / source.height)
    const cw = Math.round(SOURCE_W / cropScale)
    const ch = Math.round(SOURCE_H / cropScale)
    const cropped = await createImageBitmap(
      source,
      Math.round((source.width - cw) / 2),
      Math.round((source.height - ch) / 2),
      cw,
      ch
    )
    const heroCanvas = downscale(cropped, SOURCE_W, SOURCE_H)
    cropped.close()
    grayscale(heroCanvas)
    const hero = await toWebp(heroCanvas, HERO_QUALITY)

    // 版は段の並び（VARIANTS の順）と hero をつないだ中身のハッシュ（scripts/encode-photos.mjs と同じ決め方）
    const ordered = VARIANTS.map((variant) => variants.find(([kind]) => kind === variant.kind)![1])
    return {variants, hero, w, h, v: await versionOf([...ordered, hero])}
  } finally {
    source.close()
  }
}

/** 中身の SHA-256 の先頭 10 桁 */
async function versionOf(blobs: Blob[]) {
  const digest = await crypto.subtle.digest('SHA-256', await new Blob(blobs).arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 10)
}

/** 一度に大きく縮めると荒れるので、半分ずつ段階的に縮める */
function downscale(source: ImageBitmap | OffscreenCanvas, w: number, h: number): OffscreenCanvas {
  let current: OffscreenCanvas | ImageBitmap = source
  let cw = source.width
  let ch = source.height
  while (cw / 2 >= w && ch / 2 >= h) {
    cw = Math.round(cw / 2)
    ch = Math.round(ch / 2)
    current = draw(current, cw, ch)
  }
  return draw(current, w, h)
}

function draw(source: OffscreenCanvas | ImageBitmap, w: number, h: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return canvas
}

/** Rec.709 の輝度でグレースケールにする（ImageMagick の -colorspace Gray と同じ重み） */
function grayscale(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext('2d')!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = image.data
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = y
  }
  ctx.putImageData(image, 0, 0)
}

async function toWebp(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const blob = await canvas.convertToBlob({type: 'image/webp', quality})
  // WebP を書き出せないブラウザは PNG を返してくる。黙って PNG を置かない
  if (blob.type !== 'image/webp') throw new Error('このブラウザは WebP を書き出せない。Chrome を使う')
  return blob
}

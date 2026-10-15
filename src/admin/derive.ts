// 原本から派生画像をブラウザで作る。Workers には画像ライブラリがないので、
// 管理画面がアップロード前に縮小・WebP 化まで済ませる。
// 形は scripts/encode-photos.mjs と揃える（段は photos/manifest.ts の VARIANTS）。

import {VARIANTS, type Variant} from '../photos/manifest'

export type Derived = {
  /** 段ごとの派生。キーは R2 の kind */
  variants: [Variant['kind'], Blob][]
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
    // 一番大きい段を原本から縮め、ほかの段はそれを元に縮める
    const largest = Math.max(...VARIANTS.map((v) => v.long))
    const scale = Math.min(1, largest / Math.max(source.width, source.height))
    const w = Math.round(source.width * scale)
    const h = Math.round(source.height * scale)
    const base = downscale(source, w, h)
    const variants: Derived['variants'] = []
    for (const variant of VARIANTS) {
      const s = Math.min(1, variant.long / Math.max(w, h))
      const canvas = s === 1 ? base : downscale(base, Math.round(w * s), Math.round(h * s))
      variants.push([variant.kind, await toWebp(canvas, variant.quality / 100)])
    }

    // 版は段（VARIANTS の順）をつないだ中身のハッシュ。中身が変われば版が変わる、が成り立てばよい
    return {variants, w, h, v: await versionOf(variants.map(([, blob]) => blob))}
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

async function toWebp(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const blob = await canvas.convertToBlob({type: 'image/webp', quality})
  // WebP を書き出せないブラウザは PNG を返してくる。黙って PNG を置かない
  if (blob.type !== 'image/webp') throw new Error('このブラウザは WebP を書き出せない。Chrome を使う')
  return blob
}

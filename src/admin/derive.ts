// 原本から派生画像をブラウザで作る。Workers には画像ライブラリがないので、
// 管理画面がアップロード前に縮小・トリミング・グレースケール・WebP 化まで済ませる。
// 形は scripts/encode-photos.sh と揃える（長辺 800 と 2000 のカラー、1152x768 のグレースケール）。

import {SOURCE_H, SOURCE_W} from '../hero/table'

export const GALLERY_LONG = 2000
const THUMB_LONG = 800
const GALLERY_QUALITY = 0.82
const THUMB_QUALITY = 0.6
const HERO_QUALITY = 0.92

export type Derived = {
  thumb: Blob
  gallery: Blob
  hero: Blob
  /** 拡大用（gallery）の寸法 */
  w: number
  h: number
}

export async function derive(file: File): Promise<Derived> {
  // EXIF の向きを反映して読む
  const source = await createImageBitmap(file, {imageOrientation: 'from-image'})
  try {
    const scale = Math.min(1, GALLERY_LONG / Math.max(source.width, source.height))
    const w = Math.round(source.width * scale)
    const h = Math.round(source.height * scale)
    const galleryCanvas = downscale(source, w, h)
    const gallery = await toWebp(galleryCanvas, GALLERY_QUALITY)
    const thumbScale = Math.min(1, THUMB_LONG / Math.max(w, h))
    const thumb = await toWebp(
      downscale(galleryCanvas, Math.round(w * thumbScale), Math.round(h * thumbScale)),
      THUMB_QUALITY
    )

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

    return {thumb, gallery, hero, w, h}
  } finally {
    source.close()
  }
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

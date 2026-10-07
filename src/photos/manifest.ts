// 写真の一覧（manifest.json）の形と検証。サイト（src/photos/index.ts）と Worker（worker/）の
// 両方が使う。React も DOM も使わない純粋なモジュールにしておく。

export const CATEGORIES = ['street', 'abstract', 'color'] as const
export type Category = (typeof CATEGORIES)[number]

export type Photo = {
  file: string
  /** 拡大用（gallery）の派生画像の寸法。一覧用は同じ比率で小さい */
  w: number
  h: number
  category: Category
  /** トップの hero に使うか */
  hero: boolean
}

/** Photos で最初に待たず読む枚数。一覧（Img.tsx）が即座に読み、Worker が HTML の時点で preload させる */
export const EAGER_THUMBS = 9

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)

const FILE = /^[A-Za-z0-9_-]+$/

/** 一覧を検証する。通れば写真の配列、通らなければ理由 */
export function parseManifest(body: unknown): {photos: Photo[]} | {error: string} {
  if (!Array.isArray(body)) return {error: 'manifest must be an array'}
  const photos: Photo[] = []
  const seen = new Set<string>()
  for (const [i, entry] of body.entries()) {
    const at = `entry ${i}`
    if (typeof entry !== 'object' || entry === null) return {error: `${at}: not an object`}
    const {file, w, h, category, hero} = entry as Record<string, unknown>
    if (typeof file !== 'string' || !FILE.test(file)) return {error: `${at}: invalid file`}
    if (seen.has(file)) return {error: `${at}: duplicate file ${file}`}
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) <= 0 || (h as number) <= 0)
      return {error: `${at}: invalid size`}
    if (!isCategory(category)) return {error: `${at}: invalid category`}
    if (typeof hero !== 'boolean') return {error: `${at}: hero must be boolean`}
    seen.add(file)
    photos.push({file, w: w as number, h: h as number, category, hero})
  }
  return {photos}
}

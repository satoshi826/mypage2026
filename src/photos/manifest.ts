// 写真の一覧（manifest.json）の形と検証。サイト（src/photos/index.ts）と Worker（worker/）の
// 両方が使う。React も DOM も使わない純粋なモジュールにしておく。

export const CATEGORIES = ['street', 'abstract', 'color'] as const
export type Category = (typeof CATEGORIES)[number]

/**
 * 派生画像の段。R2 のキーは `<kind>/<file>.webp`。long は長辺 px、quality は WebP の画質（0〜100）、
 * use は list（一覧に並べる）か large（広げたとき）。表示は「表示幅 × 画面の密度」以上で一番小さい段を選ぶ
 * （src/photos/index.ts の pickSource）。
 * scripts/encode-photos.mjs と scripts/sync-photos.mjs がこの行を文字列として読むので、1 段 1 行の形を崩さない
 */
export const VARIANTS = [
  {kind: 'list-200', long: 200, quality: 60, use: 'list'},
  {kind: 'list-400', long: 400, quality: 60, use: 'list'},
  {kind: 'list-800', long: 800, quality: 60, use: 'list'},
  {kind: 'list-1200', long: 1200, quality: 60, use: 'list'},
  {kind: 'large-1200', long: 1200, quality: 80, use: 'large'},
  {kind: 'large-2000', long: 2000, quality: 80, use: 'large'}
] as const
export type Variant = (typeof VARIANTS)[number]

export type Photo = {
  file: string
  /** 一番大きい派生（large-2000）の寸法。ほかの段は同じ比率で小さい */
  w: number
  h: number
  category: Category
  /** トップの hero に使うか */
  hero: boolean
}

/** Photos の最初の数枚。Worker が HTML の時点で preload させ、一覧が描いたときにはキャッシュから出せるようにする */
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

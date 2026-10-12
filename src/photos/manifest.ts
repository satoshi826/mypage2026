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

/**
 * 一覧用の段を選ぶときの余裕。マウスのある端末（HOVER）では、表示幅 × 画面の密度のこの倍以上の段を選ぶ。
 * 密度 1 倍の画面に等倍で出すと画質 60 の圧縮の荒れがそのまま見え、マウスを載せたときのズーム（1.1 倍）で
 * 等倍を超えて引き伸ばされるため。縮めて出せば荒れは目立たない。タッチの端末はズームせず、密度が高く荒れも
 * 見えにくいので余裕を持たせない（持たせると初回の転送量が大きく増える）。拡大用は画質 80 でズームもしないので、
 * どの端末でも余裕を持たせない
 */
export const LIST_HEADROOM = 1.5
/** 余裕を持たせる端末。一覧の JS（src/photos/index.ts）と Worker の先読み（imagesizes）が同じ条件を使う */
export const HOVER = '(hover: hover)'

export type Photo = {
  file: string
  /** 一番大きい派生（large-2000）の寸法。ほかの段は同じ比率で小さい */
  w: number
  h: number
  category: Category
  /** トップの hero に使うか */
  hero: boolean
  /**
   * 派生画像の版。その写真の派生を全部つないだ中身のハッシュ（先頭 10 桁）で、書き出し直して中身が
   * 変わったときだけ変わる。画像の URL に付け、URL が同じなら中身も同じ、としてずっと手元に持てるようにする
   */
  v: string
}

/** 派生画像の URL。kind は VARIANTS の kind か hero */
export const imageUrl = (kind: string, photo: Photo) => `/images/${kind}/${photo.file}.webp?v=${photo.v}`

/** Photos の最初の数枚。Worker が HTML の時点で preload させ、一覧が描いたときにはキャッシュから出せるようにする */
export const EAGER_THUMBS = 9

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)

const FILE = /^[A-Za-z0-9_-]+$/
const VERSION = /^[0-9a-f]{10}$/

/** 一覧を検証する。通れば写真の配列、通らなければ理由 */
export function parseManifest(body: unknown): {photos: Photo[]} | {error: string} {
  if (!Array.isArray(body)) return {error: 'manifest must be an array'}
  const photos: Photo[] = []
  const seen = new Set<string>()
  for (const [i, entry] of body.entries()) {
    const at = `entry ${i}`
    if (typeof entry !== 'object' || entry === null) return {error: `${at}: not an object`}
    const {file, w, h, category, hero, v} = entry as Record<string, unknown>
    if (typeof file !== 'string' || !FILE.test(file)) return {error: `${at}: invalid file`}
    if (seen.has(file)) return {error: `${at}: duplicate file ${file}`}
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) <= 0 || (h as number) <= 0)
      return {error: `${at}: invalid size`}
    if (!isCategory(category)) return {error: `${at}: invalid category`}
    if (typeof hero !== 'boolean') return {error: `${at}: hero must be boolean`}
    if (typeof v !== 'string' || !VERSION.test(v)) return {error: `${at}: invalid v`}
    seen.add(file)
    photos.push({file, w: w as number, h: h as number, category, hero, v})
  }
  return {photos}
}

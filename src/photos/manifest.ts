// 写真の一覧（manifest.json）の形と検証。サイト（src/photos/index.ts）と Worker（worker/）の
// 両方が使う。Preact も DOM も使わない純粋なモジュールにしておく。

/** Photos に並べる作品のカテゴリ。URL（/photos/:category）とフッターの切り替えになる */
export const PHOTO_CATEGORIES = ['street', 'abstract', 'color'] as const
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]
/** 写真の置き場所すべて。works は依頼の仕事で、Works のページに並ぶ */
export const CATEGORIES = [...PHOTO_CATEGORIES, 'works'] as const
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
  /** トップの hero での順番（1 から）。カレンダーの番号。hero に使わない写真は持たない */
  hero?: number
  /** Works の写真の種類（Performance / Talk / Portrait など）。案件の最初の写真に添える */
  tag?: string
  /**
   * Works の案件の説明の 1 行（被写体 / 場 / 年）。案件の最初の写真にだけ持たせ、続く写真は持たない。
   * 書体は HTML に出る文字だけに絞っているので（scripts/fonts.js）、英数字で書くとサイトの書体で出る
   */
  caption?: string
  /**
   * 派生画像の版。その写真の派生を全部つないだ中身のハッシュ（先頭 10 桁）で、書き出し直して中身が
   * 変わったときだけ変わる。画像の URL に付け、URL が同じなら中身も同じ、としてずっと手元に持てるようにする
   */
  v: string
}

/** 派生画像の URL */
export const imageUrl = (kind: Variant['kind'], photo: Photo) => `/images/${kind}/${photo.file}.webp?v=${photo.v}`

/**
 * トップの hero が読む画像。拡大用の段を使い、Photos で広げたときの画像とキャッシュを分け合う。
 * hero の粒子は 1100×730 前後（src/hero/table.ts）なので、長辺 1200 で足りる
 */
export const heroSrc = (photo: Photo) => imageUrl('large-1200', photo)

/** hero に使う写真を、hero での順番に並べる */
export const heroesOf = (photos: Photo[]) =>
  photos.filter((photo) => photo.hero !== undefined).sort((a, b) => a.hero! - b.hero!)

/** hero の番号を、順番を保ったまま 1 から詰め直す。足す・外す・消したあとに使う */
export function renumberHero(photos: Photo[]): Photo[] {
  const rank = new Map(heroesOf(photos).map((photo, i) => [photo.file, i + 1]))
  return photos.map((photo) => {
    const hero = rank.get(photo.file)
    return photo.hero === hero ? photo : {...photo, hero}
  })
}

/** Photos の最初の数枚。Worker が HTML の時点で preload させ、一覧が描いたときにはキャッシュから出せるようにする */
export const EAGER_THUMBS = 9

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
export const isPhotoCategory = (value: unknown): value is PhotoCategory =>
  typeof value === 'string' && (PHOTO_CATEGORIES as readonly string[]).includes(value)

/** 種類と説明の 1 行の長さの上限 */
const TEXT_LIMIT = {tag: 40, caption: 160}

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
    const {file, w, h, category, hero, v, tag, caption} = entry as Record<string, unknown>
    if (typeof file !== 'string' || !FILE.test(file)) return {error: `${at}: invalid file`}
    if (seen.has(file)) return {error: `${at}: duplicate file ${file}`}
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) <= 0 || (h as number) <= 0)
      return {error: `${at}: invalid size`}
    if (!isCategory(category)) return {error: `${at}: invalid category`}
    if (hero !== undefined && !(Number.isInteger(hero) && (hero as number) > 0))
      return {error: `${at}: hero must be a positive integer`}
    if (typeof v !== 'string' || !VERSION.test(v)) return {error: `${at}: invalid v`}
    for (const [key, value] of [
      ['tag', tag],
      ['caption', caption]
    ] as const)
      if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > TEXT_LIMIT[key]))
        return {error: `${at}: invalid ${key}`}
    seen.add(file)
    const photo: Photo = {file, w: w as number, h: h as number, category, v}
    if (hero !== undefined) photo.hero = hero as number
    if (typeof tag === 'string') photo.tag = tag
    if (typeof caption === 'string') photo.caption = caption
    photos.push(photo)
  }
  return {photos: renumberHero(photos)}
}

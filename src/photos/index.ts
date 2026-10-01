import manifest from './manifest.json'

// サイトに載せる写真の一覧。唯一の出典は manifest.json で、scripts/encode-photos.sh が
// 原本から派生画像を書き出すときに生成する。カテゴリと hero の選択は manifest.json を
// 直接編集する（再生成しても引き継がれる）。
//
// 将来は管理画面（CMS）が同じ形の JSON を生成する予定なので、サイト側は
// この一覧と画像 URL だけを見る（docs/site.md）。
//
// | 派生        | 置き場           | 形 |
// |-------------|------------------|----|
// | hero 用     | public/photos/   | 1152x768、中央トリミング、グレースケール。hero: true のものだけ |
// | photos 用   | public/gallery/  | 長辺 2000px、カラー、トリミングなし。全部 |

export const CATEGORIES = ['street', 'abstract', 'color'] as const
export type Category = (typeof CATEGORIES)[number]

export type Photo = {
  file: string
  /** photos 用の派生画像の寸法 */
  w: number
  h: number
  category: Category
  /** トップの hero に使うか */
  hero: boolean
}

const isCategory = (value: string): value is Category => (CATEGORIES as readonly string[]).includes(value)

export const PHOTOS: Photo[] = manifest.map((entry) => {
  if (!isCategory(entry.category))
    throw new Error(`manifest.json: ${entry.file} のカテゴリ "${entry.category}" は未定義`)
  return {...entry, category: entry.category}
})

export const gallerySrc = (photo: Photo) => `/gallery/${photo.file}.webp`

/** hero が読む画像。再生順は実行時にランダムなので、この並びが決めるのは番号表示と最初の1枚だけ */
export const HERO_PHOTOS = PHOTOS.filter((photo) => photo.hero).map((photo) => `/photos/${photo.file}.webp`)

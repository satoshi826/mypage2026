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

/**
 * 写真の置き場所。Photos のカテゴリか、Works の案件。Works の写真はどれかの案件に入る
 */
export type Place = {category: PhotoCategory; project?: undefined} | {category: 'works'; project: string}

export type Photo = Place & {
  file: string
  /** 一番大きい派生（large-2000）の寸法。ほかの段は同じ比率で小さい */
  w: number
  h: number
  /** トップの hero での順番（1 から）。カレンダーの番号。hero に使わない写真は持たない */
  hero?: number
  /**
   * 派生画像の版。その写真の派生を全部つないだ中身のハッシュ（先頭 10 桁）で、書き出し直して中身が
   * 変わったときだけ変わる。画像の URL に付け、URL が同じなら中身も同じ、としてずっと手元に持てるようにする
   */
  v: string
}

/**
 * Works の案件。並びは一覧の projects の順で、中の写真の並びは photos の順。写真の無い案件も持てる（編集中だけ出す）。
 * 書体は HTML に出る文字だけに絞っているので（scripts/fonts.js）、英数字で書くとサイトの書体で出る
 */
export type Project = {
  id: string
  /** 種類（Performance / Talk / Portrait など） */
  tag?: string
  /** 説明の 1 行（被写体 / 場 / 年） */
  caption?: string
}

/** 一覧（manifest.json）。写真と Works の案件 */
export type Manifest = {photos: Photo[]; projects: Project[]}

export const EMPTY_MANIFEST: Manifest = {photos: [], projects: []}

/** 同じ置き場所か */
export const samePlace = (a: Place, b: Place) => a.category === b.category && a.project === b.project

/** Works の案件と、その写真（一覧の順） */
export const worksOf = ({photos, projects}: Manifest) =>
  projects.map((project) => ({project, photos: photos.filter((photo) => photo.project === project.id)}))

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

/** 種類と説明の 1 行。無いか、空でない上限以内の文字列 */
const validText = (value: unknown, limit: number) =>
  value === undefined || (typeof value === 'string' && !!value.trim() && value.length <= limit)

/** 一覧を検証する。通れば一覧（hero の番号は 1 から詰めた形）、通らなければ理由 */
export function parseManifest(body: unknown): {manifest: Manifest} | {error: string} {
  if (Array.isArray(body)) body = fromPhotoArray(body)
  if (typeof body !== 'object' || body === null) return {error: 'manifest must be an object'}
  const {photos: photoEntries, projects: projectEntries} = body as Record<string, unknown>
  if (!Array.isArray(photoEntries) || !Array.isArray(projectEntries))
    return {error: 'manifest must have photos and projects'}

  const projects: Project[] = []
  const ids = new Set<string>()
  for (const [i, entry] of projectEntries.entries()) {
    const at = `project ${i}`
    if (typeof entry !== 'object' || entry === null) return {error: `${at}: not an object`}
    const {id, tag, caption} = entry as Record<string, unknown>
    if (typeof id !== 'string' || !FILE.test(id)) return {error: `${at}: invalid id`}
    if (ids.has(id)) return {error: `${at}: duplicate id ${id}`}
    if (!validText(tag, TEXT_LIMIT.tag)) return {error: `${at}: invalid tag`}
    if (!validText(caption, TEXT_LIMIT.caption)) return {error: `${at}: invalid caption`}
    ids.add(id)
    const project: Project = {id}
    if (typeof tag === 'string') project.tag = tag
    if (typeof caption === 'string') project.caption = caption
    projects.push(project)
  }

  const photos: Photo[] = []
  const seen = new Set<string>()
  for (const [i, entry] of photoEntries.entries()) {
    const at = `photo ${i}`
    if (typeof entry !== 'object' || entry === null) return {error: `${at}: not an object`}
    const {file, w, h, category, project, hero, v} = entry as Record<string, unknown>
    if (typeof file !== 'string' || !FILE.test(file)) return {error: `${at}: invalid file`}
    if (seen.has(file)) return {error: `${at}: duplicate file ${file}`}
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) <= 0 || (h as number) <= 0)
      return {error: `${at}: invalid size`}
    if (!isCategory(category)) return {error: `${at}: invalid category`}
    if (hero !== undefined && !(Number.isInteger(hero) && (hero as number) > 0))
      return {error: `${at}: hero must be a positive integer`}
    if (typeof v !== 'string' || !VERSION.test(v)) return {error: `${at}: invalid v`}
    let place: Place
    if (category === 'works') {
      if (typeof project !== 'string' || !ids.has(project)) return {error: `${at}: unknown project`}
      place = {category, project}
    } else {
      if (project !== undefined) return {error: `${at}: only works photos have a project`}
      place = {category}
    }
    seen.add(file)
    const photo: Photo = {file, w: w as number, h: h as number, ...place, v}
    if (hero !== undefined) photo.hero = hero as number
    photos.push(photo)
  }
  return {manifest: {photos: renumberHero(photos), projects}}
}

/**
 * 写真だけの配列だった前の形を、今の形に移す。案件は並び順で表していて、説明の 1 行（caption）を持つ写真から
 * 次の案件が始まり、案件の種類と説明は最初の写真が持っていた。本番の一覧を一度公開し直したら消す
 */
function fromPhotoArray(entries: unknown[]): unknown {
  const projects: Record<string, unknown>[] = []
  const photos = entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return entry
    const {tag, caption, ...photo} = entry as Record<string, unknown>
    if (photo.category !== 'works') return photo
    if (projects.length === 0 || caption !== undefined) projects.push({id: `p${projects.length + 1}`, tag, caption})
    return {...photo, project: projects[projects.length - 1].id}
  })
  return {photos, projects}
}

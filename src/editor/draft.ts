import {heroesOf, renumberHero, showManifest, type Manifest, type Photo} from '../photos'
import {parseManifest, VARIANTS} from '../photos/manifest'
import {deleteImage, fetchManifest, saveManifest} from './api'

// 下書き。サイトの上での編集はすべてここに入り、「公開」でまとめて本番の一覧（manifest.json）へ書く。
// 下書きはこのブラウザに残し、再読み込みしても続きから編集できる。
//
// - 追加した写真の画像は、選んだ時点で R2 に置く（一覧に載るまで訪問者には見えない）。破棄したら消す
// - 削除は「消す予定」にするだけで、R2 の画像は公開のときに消す。公開前なら破棄で戻せる。原本は残す
// - 下書きの一覧は、変えるたびにサーバーが読むのと同じ形（parseManifest）にそろえる。公開のときの「別の場所で
//   変わっていないか」と未公開の変更の数は一覧を文字列で比べるので、キーの並び順の違いを変更と取り違えないため

type Draft = {
  /** 下書きを始めたときの公開中の一覧。公開のとき、別の場所で変わっていないかを確かめる */
  base: Manifest
  manifest: Manifest
  /** この下書きで R2 に置いたもののキー（kind/name）。破棄したら消す */
  uploads: string[]
  /** 公開のとき、派生画像を R2 から消す写真 */
  removed: string[]
}

export type State = {
  /** 公開中の一覧。読めるまで null */
  live: Manifest | null
  draft: Draft | null
  /** 進行中の処理（公開中、アップロード中など）。無ければ null */
  busy: string | null
  /** 直近の失敗 */
  error: string | null
}

const KEY = 'mypage2026.draft'

function read(): Draft | null {
  try {
    const text = localStorage.getItem(KEY)
    return text ? (JSON.parse(text) as Draft) : null
  } catch {
    return null
  }
}

function write(draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(KEY, JSON.stringify(draft))
    else localStorage.removeItem(KEY)
  } catch {
    // 残せない環境では、再読み込みで下書きが消えるだけ
  }
}

let state: State = {live: null, draft: read(), busy: null, error: null}
const listeners = new Set<() => void>()

export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const getState = () => state

function set(next: Partial<State>) {
  state = {...state, ...next}
  if ('draft' in next) write(state.draft)
  showManifest(state.draft?.manifest ?? state.live)
  for (const listener of listeners) listener()
}

/** 公開中の一覧を読む。編集用のコードを読み込んだときに 1 回 */
export async function start() {
  try {
    set({live: await fetchManifest()})
  } catch (e) {
    set({error: `一覧を読めない: ${(e as Error).message}`})
  }
}

/**
 * 下書きを変える。下書きが無ければ、公開中の一覧から始める。uploads と removed は、この変更で R2 に置いた
 * もの・消す予定にした写真
 */
export function edit(
  change: (manifest: Manifest) => Manifest,
  {uploads = [], removed = []}: Partial<Pick<Draft, 'uploads' | 'removed'>> = {}
) {
  const live = state.live
  if (!live) return
  const draft = state.draft ?? {base: live, manifest: live, uploads: [], removed: []}
  set({
    draft: {
      ...draft,
      // hero の番号は、足す・外す・消すたびに 1 から詰め直す（normalized の中で）
      manifest: normalized(change(draft.manifest)),
      uploads: [...draft.uploads, ...uploads],
      removed: [...draft.removed, ...removed]
    }
  })
}

/**
 * サーバーが読むのと同じ形（キーの並び、hero の番号の詰め直し）にそろえた一覧。検証に通らない一覧（説明が長すぎる
 * など）は、hero の番号だけ詰めてそのまま返す（公開のときにサーバーが断る）
 */
function normalized(manifest: Manifest): Manifest {
  const result = parseManifest(manifest)
  return 'manifest' in result ? result.manifest : {...manifest, photos: renumberHero(manifest.photos)}
}

/** 画像のキー（kind/name）の写真の名前 */
const fileOf = (key: string) => key.split('/')[1].replace(/\.[^.]+$/, '')

/** 公開中の一覧か、下書きがあれば下書き。まだ読めていなければ null */
export const current = () => state.draft?.manifest ?? state.live

/** 長い処理を、操作バーに「〜中」と出しながら行う */
export async function run(label: string, task: () => Promise<void>) {
  set({busy: `${label}中`, error: null})
  try {
    await task()
    set({busy: null})
  } catch (e) {
    set({busy: null, error: `${label}に失敗: ${(e as Error).message}`})
  }
}

/** 処理中の表示を変える（追加の進み具合など） */
export const report = (busy: string) => set({busy})

/** 下書きを本番の一覧へ書く。下書きを始めたあとに別の場所で一覧が変わっていたら、上書きしてよいか尋ねる */
export const publish = () =>
  run('公開', async () => {
    const draft = state.draft
    if (!draft) return
    const current = await fetchManifest()
    if (
      JSON.stringify(current) !== JSON.stringify(draft.base) &&
      !confirm('下書きを始めたあとに、公開中の一覧が別の場所で変わっています。上書きして公開しますか？')
    )
      return
    await saveManifest(draft.manifest)
    // 一覧を保存できたら、公開は済んでいる。画像の掃除を待たずに公開中の一覧を進める（掃除が失敗しても、公開済みの
    // 下書きを残さない。残すと、破棄で公開した写真の画像を消しうる）。公開を待っているあいだに入った編集は、
    // 公開した一覧を土台にした下書きとして残す
    const now = state.draft
    set({
      live: draft.manifest,
      draft:
        now && now !== draft
          ? {
              base: draft.manifest,
              manifest: now.manifest,
              uploads: now.uploads.filter((key) => !draft.uploads.includes(key)),
              removed: now.removed.filter((file) => !draft.removed.includes(file))
            }
          : null
    })
    // 消す写真の派生画像。この下書きで足して消した写真は、原本も消す（公開中の一覧に一度も載っていない）。
    // 失敗したものは R2 に残るだけで、一覧からは外れている
    const fresh = draft.uploads.filter((key) => draft.removed.includes(fileOf(key)))
    await Promise.allSettled([
      ...draft.removed.flatMap((file) => VARIANTS.map((v) => deleteImage(`${v.kind}/${file}.webp`))),
      ...fresh.filter((key) => key.startsWith('originals/')).map((key) => deleteImage(key))
    ])
  })

/** 下書きを捨てる。この下書きで R2 に置いた画像も消す（公開されているものは除く） */
export const discard = () =>
  run('破棄', async () => {
    const draft = state.draft
    if (!draft || !confirm('未公開の変更を捨てますか？')) return
    // 本番の一覧に載っている写真の画像は消さない。別のタブでこの下書きを公開したときなど、足した写真がもう
    // 公開されていることがある
    const live = await fetchManifest()
    const published = new Set(live.photos.map((photo) => photo.file))
    await Promise.all(draft.uploads.filter((key) => !published.has(fileOf(key))).map((key) => deleteImage(key)))
    set({live, draft: null})
  })

/**
 * 未公開の変更の数。足した写真・消す写真・置き場所や画像を変えた写真の数と、足した・消した・書き換えた案件の数に、
 * 並びの変わった置き場所（カテゴリか案件）の数と、案件の並び・hero の並び（足す・外す・並べ替える）がそれぞれ
 * 変わっていれば 1 を足したもの
 */
export function changes({base, manifest}: Draft): number {
  const count = changed(
    base.photos,
    manifest.photos,
    (photo) => photo.file,
    (photo) => ({...photo, hero: undefined})
  )
  const projects = changed(
    base.projects,
    manifest.projects,
    (project) => project.id,
    (project) => project
  )
  // 並びは、前後で同じ置き場所にいる写真だけで比べる（足した・消した・置き場所を移した写真は上で数えた）
  const placeOf = (photo: Photo) => `${photo.category}/${photo.project ?? ''}`
  const before = new Map(base.photos.map((photo) => [photo.file, placeOf(photo)]))
  const after = new Map(manifest.photos.map((photo) => [photo.file, placeOf(photo)]))
  const order = (list: Photo[], place: string) =>
    list
      .filter((photo) => after.get(photo.file) === place && before.get(photo.file) === place)
      .map((photo) => photo.file)
      .join()
  let orders = 0
  for (const place of new Set(after.values())) if (order(base.photos, place) !== order(manifest.photos, place)) orders++
  // 案件の並びも、前後どちらにもある案件だけで比べる
  const kept = (list: {id: string}[], other: {id: string}[]) =>
    list
      .filter((project) => other.some((o) => o.id === project.id))
      .map((project) => project.id)
      .join()
  if (kept(base.projects, manifest.projects) !== kept(manifest.projects, base.projects)) orders++
  const heroes = (list: Photo[]) =>
    heroesOf(list)
      .map((photo) => photo.file)
      .join()
  if (heroes(base.photos) !== heroes(manifest.photos)) orders++
  return count + projects + orders
}

/** 足した・消した・中身を変えたものの数。key で同じものを見分け、content で中身を比べる */
function changed<T>(before: T[], after: T[], key: (item: T) => string, content: (item: T) => unknown): number {
  const was = new Map(before.map((item) => [key(item), JSON.stringify(content(item))]))
  const now = new Set(after.map(key))
  let count = 0
  for (const item of after) if (was.get(key(item)) !== JSON.stringify(content(item))) count++
  for (const id of was.keys()) if (!now.has(id)) count++
  return count
}

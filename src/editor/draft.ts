import {renumberHero, showPhotos, type Photo} from '../photos'
import {VARIANTS} from '../photos/manifest'
import {deleteImage, fetchManifest, saveManifest} from './api'

// 下書き。サイトの上での編集はすべてここに入り、「公開」でまとめて本番の一覧（manifest.json）へ書く。
// 下書きはこのブラウザに残し、再読み込みしても続きから編集できる。
//
// - 追加した写真の画像は、選んだ時点で R2 に置く（一覧に載るまで訪問者には見えない）。破棄したら消す
// - 削除は「消す予定」にするだけで、R2 の画像は公開のときに消す。公開前なら破棄で戻せる。原本は残す

type Draft = {
  /** 下書きを始めたときの公開中の一覧。公開のとき、別の場所で変わっていないかを確かめる */
  base: Photo[]
  photos: Photo[]
  /** この下書きで R2 に置いたもののキー（kind/name）。破棄したら消す */
  uploads: string[]
  /** 公開のとき、派生画像を R2 から消す写真 */
  removed: string[]
}

export type State = {
  /** 公開中の一覧。読めるまで null */
  live: Photo[] | null
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
  showPhotos(state.draft?.photos ?? state.live)
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
  change: (photos: Photo[]) => Photo[],
  {uploads = [], removed = []}: Partial<Pick<Draft, 'uploads' | 'removed'>> = {}
) {
  const live = state.live
  if (!live) return
  const draft = state.draft ?? {base: live, photos: live, uploads: [], removed: []}
  set({
    draft: {
      ...draft,
      // hero の番号は、足す・外す・消すたびに 1 から詰め直す
      photos: renumberHero(change(draft.photos)),
      uploads: [...draft.uploads, ...uploads],
      removed: [...draft.removed, ...removed]
    }
  })
}

/** 公開中の一覧か、下書きがあれば下書き。まだ読めていなければ null */
export const current = () => state.draft?.photos ?? state.live

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
    await saveManifest(draft.photos)
    // 消す写真の派生画像。この下書きで足して消した写真は、原本も消す（公開中の一覧に一度も載っていない）
    const fresh = draft.uploads.filter((key) => draft.removed.includes(key.split('/')[1].replace(/\.[^.]+$/, '')))
    await Promise.all([
      ...draft.removed.flatMap((file) => VARIANTS.map((v) => deleteImage(`${v.kind}/${file}.webp`))),
      ...fresh.filter((key) => key.startsWith('originals/')).map((key) => deleteImage(key))
    ])
    set({live: draft.photos, draft: null})
  })

/** 下書きを捨てる。この下書きで R2 に置いた画像も消す */
export const discard = () =>
  run('破棄', async () => {
    const draft = state.draft
    if (!draft || !confirm('未公開の変更を捨てますか？')) return
    await Promise.all(draft.uploads.map((key) => deleteImage(key)))
    set({draft: null})
  })

/**
 * 未公開の変更の数。足した写真・消す写真・カテゴリや hero を変えた写真の数に、並びの変わったカテゴリの数を
 * 足したもの
 */
export function changes(draft: Draft): number {
  const before = new Map(draft.base.map((photo) => [photo.file, photo]))
  const after = new Map(draft.photos.map((photo) => [photo.file, photo]))
  let count = 0
  for (const photo of draft.photos) {
    const was = before.get(photo.file)
    if (!was || JSON.stringify(was) !== JSON.stringify(photo)) count++
  }
  for (const file of before.keys()) if (!after.has(file)) count++
  // 並びは、前後で同じカテゴリにいる写真だけで比べる（足した・消した・カテゴリを移した写真は上で数えた）
  const stayed = (photo: Photo) => before.get(photo.file)?.category === photo.category && after.has(photo.file)
  const order = (list: Photo[], category: string) =>
    list
      .filter((photo) => photo.category === category && stayed(after.get(photo.file) ?? photo))
      .map((photo) => photo.file)
      .join()
  for (const category of new Set(draft.photos.map((photo) => photo.category)))
    if (order(draft.base, category) !== order(draft.photos, category)) count++
  return count
}

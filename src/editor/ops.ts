import {
  samePlace,
  toCategory,
  worksOf,
  type Category,
  type Manifest,
  type Photo,
  type Place,
  type Project
} from '../photos'
import {putImage} from './api'
import {derive} from './derive'
import {current, edit, getState, report, run} from './draft'

// 写真の操作。どれも下書きを変えるだけで、公開するまでサイトには出ない（draft.ts）

/** ファイル名から拡張子を落とし、manifest で許す文字だけにする */
const toId = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'photo'

/** 使われている名前。公開中・下書き・消す予定（公開まで R2 に画像が残る）のどれとも重ねない */
function takenNames() {
  const {live, draft} = getState()
  return new Set(
    [...(live?.photos ?? []), ...(draft?.manifest.photos ?? [])].map((photo) => photo.file).concat(draft?.removed ?? [])
  )
}

/** 重ならない名前。重なるときは末尾に -2、-3 … を付ける */
function freshId(name: string, taken: Set<string>) {
  const base = toId(name)
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/** 原本と派生画像を作って R2 に置く。置いたキーと、一覧に書く寸法・版を返す */
async function upload(file: File, id: string) {
  // 公開中の一覧を読む前は下書きを作れない。先に置くと、画像だけが R2 に取り残される
  if (!getState().live) throw new Error('一覧をまだ読み込んでいる')
  const {variants, w, h, v} = await derive(file)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const keys = [`originals/${id}.${ext}`, ...variants.map(([kind]) => `${kind}/${id}.webp`)]
  await putImage(keys[0], file)
  for (const [kind, blob] of variants) await putImage(`${kind}/${id}.webp`, blob)
  return {size: {w, h, v}, keys}
}

/** 写真の一覧だけを変える */
const editPhotos = (change: (photos: Photo[]) => Photo[], extra?: Parameters<typeof edit>[1]) =>
  edit((manifest) => ({...manifest, photos: change(manifest.photos)}), extra)

/** 置き場所（カテゴリか案件）の先頭に入れる。その置き場所の写真が無ければ末尾 */
function insertAtStart(photos: Photo[], photo: Photo) {
  const i = photos.findIndex((p) => samePlace(p, photo))
  return i < 0 ? [...photos, photo] : [...photos.slice(0, i), photo, ...photos.slice(i)]
}

/** 写真を足す。置き場所の先頭に、選んだ順で並ぶ */
export const addPhotos = (files: File[], place: Place) =>
  run('追加', async () => {
    const taken = takenNames()
    // 先頭に 1 枚ずつ入れると逆順になるので、後ろの写真から入れる
    for (const [n, file] of [...files].reverse().entries()) {
      report(`追加中 ${n + 1}/${files.length}`)
      const id = freshId(file.name, taken)
      const {size, keys} = await upload(file, id)
      editPhotos((photos) => insertAtStart(photos, {file: id, ...size, ...place}), {uploads: keys})
    }
  })

/** 画像を差し替える。新しい名前の写真として同じ位置に置き、元の写真は消す予定にする（公開前に本番の画像を変えない） */
export const replacePhoto = (photo: Photo, file: File) =>
  run('差し替え', async () => {
    const id = freshId(file.name, takenNames())
    const {size, keys} = await upload(file, id)
    editPhotos((photos) => photos.map((p) => (p.file === photo.file ? {...p, file: id, ...size} : p)), {
      uploads: keys,
      removed: [photo.file]
    })
  })

export function removePhoto(photo: Photo) {
  if (!confirm(`${photo.file} を消しますか？ 公開するまでは「破棄」で戻せます。`)) return
  editPhotos((photos) => photos.filter((p) => p.file !== photo.file), {removed: [photo.file]})
}

/**
 * hero（トップの粒子）に使うか。使うときは hero の並びの末尾に入る。外すと残りの番号は詰まる（draft.ts）。
 * hero は 3:2 で描くので、違う縦横比の写真は端が切れる
 */
export function setHero(photo: Photo, on: boolean) {
  if (
    on &&
    Math.abs(photo.w / photo.h - 1.5) > 0.01 &&
    !confirm('3:2 でない写真なので、hero では端が切れます。使いますか？')
  )
    return
  const hero = on ? Number.MAX_SAFE_INTEGER : undefined
  editPhotos((photos) => photos.map((p) => (p.file === photo.file ? {...p, hero} : p)))
}

/**
 * 今見ているページで、ファイルを落としたときに足す置き場所。Photos は見ているカテゴリ、Works は落とした先の案件
 * （target の外側の data-project）。足す先が無ければ null
 */
export function dropPlace(target: Element | null): Place | null {
  if (location.pathname === '/works') {
    const project = target?.closest<HTMLElement>('[data-project]')?.dataset.project
    return project ? {category: 'works', project} : null
  }
  const match = location.pathname.match(/^\/photos\/([^/]+)/)
  return match ? {category: toCategory(match[1])} : null
}

/** 置き場所を移す。移した先の先頭に入る。前の置き場所（Works の案件）は残さない */
export function movePhotoTo({category: _category, project: _project, ...photo}: Photo, place: Place) {
  editPhotos((photos) =>
    insertAtStart(
      photos.filter((p) => p.file !== photo.file),
      {...photo, ...place}
    )
  )
}

/** カテゴリを変える。works にした写真は先頭の案件に入る（案件が無ければ変えない） */
export function setCategory(photo: Photo, category: Category) {
  if (category !== 'works') return movePhotoTo(photo, {category})
  const [first] = current()?.projects ?? []
  if (!first) return alert('Works に案件がありません。先に Works のページで案件を作ってください。')
  movePhotoTo(photo, {category, project: first.id})
}

/** 案件の一覧だけを変える */
const editProjects = (change: (projects: Project[]) => Project[]) =>
  edit((manifest) => ({...manifest, projects: change(manifest.projects)}))

/** 重ならない案件の名前 */
function freshProjectId(manifest: Manifest) {
  const taken = new Set(manifest.projects.map((project) => project.id))
  let id: string
  do id = `p${Math.random().toString(36).slice(2, 8)}`
  while (taken.has(id))
  return id
}

/** 空の案件を Works の先頭に作る */
export const addProject = () =>
  edit((manifest) => ({...manifest, projects: [{id: freshProjectId(manifest)}, ...manifest.projects]}))

/** 案件の種類か説明の 1 行を変える。空にすると外す */
export function setProjectText(project: Project, key: 'tag' | 'caption', value: string) {
  const text = value.trim() || undefined
  editProjects((projects) => projects.map((p) => (p.id === project.id ? {...p, [key]: text} : p)))
}

/** 案件を 1 つ上（-1）か下（1）へ動かす */
export function moveProject(project: Project, by: -1 | 1) {
  editProjects((projects) => {
    const from = projects.findIndex((p) => p.id === project.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= projects.length) return projects
    const next = [...projects]
    next.splice(to, 0, ...next.splice(from, 1))
    return next
  })
}

/** 案件を、中の写真ごと消す */
export function removeProject(project: Project) {
  const manifest = current()
  if (!manifest) return
  const files = worksOf(manifest)
    .find((work) => work.project.id === project.id)!
    .photos.map((photo) => photo.file)
  const what = files.length ? `この案件と、中の写真 ${files.length} 枚` : 'この空の案件'
  if (!confirm(`${what}を消しますか？ 公開するまでは「破棄」で戻せます。`)) return
  edit(
    ({photos, projects}) => ({
      photos: photos.filter((photo) => photo.project !== project.id),
      projects: projects.filter((p) => p.id !== project.id)
    }),
    {removed: files}
  )
}

/**
 * 並べ替え。file を over の位置へ移す。下へ動かすときは over の後ろ、上へ動かすときは over の前に入る
 * （一覧は全カテゴリを通した 1 本の並びで、カテゴリの中の順はその部分列）
 */
export function movePhoto(file: string, over: string) {
  editPhotos((photos) => {
    const from = photos.findIndex((p) => p.file === file)
    const to = photos.findIndex((p) => p.file === over)
    if (from < 0 || to < 0 || from === to) return photos
    const next = [...photos]
    next.splice(to, 0, ...next.splice(from, 1))
    return next
  })
}

/** hero の並びをまとめて決める（トップの hero のパネル）。files の順に 1 から番号を振り、入っていない写真は外す */
export function setHeroOrder(files: string[]) {
  const rank = new Map(files.map((file, i) => [file, i + 1]))
  editPhotos((photos) => photos.map((p) => (p.hero === rank.get(p.file) ? p : {...p, hero: rank.get(p.file)})))
}

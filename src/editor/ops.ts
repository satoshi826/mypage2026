import type {Category, Photo} from '../photos'
import {putImage} from './api'
import {derive} from './derive'
import {edit, getState, report, run} from './draft'

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
  return new Set([...(live ?? []), ...(draft?.photos ?? [])].map((photo) => photo.file).concat(draft?.removed ?? []))
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

/** カテゴリの先頭に入れる。そのカテゴリの写真が無ければ末尾 */
function insertAtStart(photos: Photo[], photo: Photo) {
  const i = photos.findIndex((p) => p.category === photo.category)
  return i < 0 ? [...photos, photo] : [...photos.slice(0, i), photo, ...photos.slice(i)]
}

/** 写真を足す。今見ているカテゴリの先頭に、選んだ順で並ぶ */
export const addPhotos = (files: File[], category: Category) =>
  run('追加', async () => {
    const taken = takenNames()
    // 先頭に 1 枚ずつ入れると逆順になるので、後ろの写真から入れる
    for (const [n, file] of [...files].reverse().entries()) {
      report(`追加中 ${n + 1}/${files.length}`)
      const id = freshId(file.name, taken)
      const {size, keys} = await upload(file, id)
      edit((photos) => insertAtStart(photos, {file: id, ...size, category, hero: false}), {uploads: keys})
    }
  })

/** 画像を差し替える。新しい名前の写真として同じ位置に置き、元の写真は消す予定にする（公開前に本番の画像を変えない） */
export const replacePhoto = (photo: Photo, file: File) =>
  run('差し替え', async () => {
    const id = freshId(file.name, takenNames())
    const {size, keys} = await upload(file, id)
    edit((photos) => photos.map((p) => (p.file === photo.file ? {...p, file: id, ...size} : p)), {
      uploads: keys,
      removed: [photo.file]
    })
  })

export function removePhoto(photo: Photo) {
  if (!confirm(`${photo.file} を消しますか？ 公開するまでは「破棄」で戻せます。`)) return
  edit((photos) => photos.filter((p) => p.file !== photo.file), {removed: [photo.file]})
}

/** hero（トップの粒子）に使うか。hero は 3:2 で描くので、違う縦横比の写真は端が切れる */
export function setHero(photo: Photo, hero: boolean) {
  if (
    hero &&
    Math.abs(photo.w / photo.h - 1.5) > 0.01 &&
    !confirm('3:2 でない写真なので、hero では端が切れます。使いますか？')
  )
    return
  edit((photos) => photos.map((p) => (p.file === photo.file ? {...p, hero} : p)))
}

export function setCategory(photo: Photo, category: Category) {
  edit((photos) => photos.map((p) => (p.file === photo.file ? {...p, category} : p)))
}

import {useEffect, useRef, useState} from 'react'
import {CATEGORIES, isCategory, thumbSrc, type Photo} from '../photos'
import {deleteImage, fetchManifest, putImage, saveManifest} from './api'
import {derive} from './derive'

// 写真の管理画面。/admin に置き、Cloudflare Access で保護する（ナビには出さない）。
// 一覧の編集はこの画面の中だけで行い、「保存」で manifest.json を丸ごと置き換える。
// 画像のアップロードと削除は即座に R2 へ反映される。

const BUTTON =
  'cursor-pointer border border-white/25 bg-white/5 px-3 py-1 text-inherit hover:bg-white/15 disabled:cursor-default disabled:opacity-40'
const SMALL =
  'cursor-pointer border border-white/20 bg-transparent px-2 py-0.5 text-xs text-inherit hover:bg-white/15 disabled:cursor-default disabled:opacity-30'

/** ファイル名から拡張子を落とし、manifest で許す文字だけにする */
const toId = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function Admin() {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  // 一覧を読めなかった理由。読めていない状態で編集に入ると、保存で空の一覧を書いてしまう
  const [failed, setFailed] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  const say = (message: string) => setLog((prev) => [message, ...prev].slice(0, 30))

  const load = () => fetchManifest().then(setPhotos, (e: Error) => setFailed(e.message))
  useEffect(() => {
    document.title = 'Admin'
    load()
  }, [])

  // 編集中にページを離れようとしたら止める
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (failed) {
    return (
      <Shell>
        <p className="mb-4">一覧を読めない: {failed}</p>
        <button
          type="button"
          onClick={() => {
            setFailed(null)
            load()
          }}
          className={BUTTON}
        >
          再読み込み
        </button>
      </Shell>
    )
  }
  if (!photos) return <Shell>読み込み中</Shell>

  const update = (next: Photo[]) => {
    setPhotos(next)
    setDirty(true)
  }
  const patch = (i: number, change: Partial<Photo>) => update(photos.map((p, j) => (j === i ? {...p, ...change} : p)))
  const move = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= photos.length) return
    const next = [...photos]
    ;[next[i], next[j]] = [next[j], next[i]]
    update(next)
  }

  const upload = async (files: FileList) => {
    const added: Photo[] = []
    for (const [n, file] of Array.from(files).entries()) {
      const id = toId(file.name)
      setBusy(`${n + 1}/${files.length} ${file.name}`)
      try {
        const {thumb, gallery, hero, w, h} = await derive(file)
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        await putImage(`originals/${id}.${ext}`, file)
        await putImage(`thumb/${id}.webp`, thumb)
        await putImage(`gallery/${id}.webp`, gallery)
        await putImage(`hero/${id}.webp`, hero)
        const existing = photos.find((p) => p.file === id)
        if (existing) {
          say(`${id}: 画像を差し替えた`)
          Object.assign(existing, {w, h})
        } else {
          added.push({file: id, w, h, category: 'street', hero: false})
          say(`${id}: 追加（${w}×${h}）`)
        }
      } catch (e) {
        say(`${file.name}: 失敗 ${(e as Error).message}`)
      }
    }
    setBusy(null)
    if (added.length) update([...photos, ...added])
    if (input.current) input.current.value = ''
  }

  const remove = async (i: number) => {
    const photo = photos[i]
    if (!confirm(`${photo.file} を消す。画像も R2 から消える。`)) return
    setBusy(`${photo.file} を削除中`)
    try {
      await Promise.all(['thumb', 'gallery', 'hero'].map((kind) => deleteImage(`${kind}/${photo.file}.webp`)))
      update(photos.filter((_, j) => j !== i))
      say(`${photo.file}: 消した（原本は残る）`)
    } catch (e) {
      say(`${photo.file}: 削除に失敗 ${(e as Error).message}`)
    }
    setBusy(null)
  }

  const save = async () => {
    setBusy('保存中')
    try {
      await saveManifest(photos)
      setDirty(false)
      say(`保存した（${photos.length} 枚）`)
    } catch (e) {
      say(`保存に失敗 ${(e as Error).message}`)
    }
    setBusy(null)
  }

  const heroCount = photos.filter((p) => p.hero).length

  return (
    <Shell>
      <div className="sticky top-(--spacing-nav) z-10 -mx-8 mb-6 flex flex-wrap items-center gap-3 border-b border-white/10 bg-ground/90 px-8 py-3 backdrop-blur-[14px]">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={busy !== null}
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
          className="text-sm"
        />
        <span className="text-sm opacity-55">
          {photos.length} 枚 / hero {heroCount}
        </span>
        <span className="grow text-sm opacity-75">{busy}</span>
        <button type="button" onClick={save} disabled={busy !== null || !dirty} className={BUTTON}>
          保存{dirty ? ' *' : ''}
        </button>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {photos.map((photo, i) => (
          <li
            key={photo.file}
            className="grid grid-cols-[6rem_1fr_auto] items-center gap-4 border-b border-white/10 py-2"
          >
            <img
              src={thumbSrc(photo)}
              alt=""
              width={photo.w}
              height={photo.h}
              loading="lazy"
              decoding="async"
              className="block aspect-3/2 h-auto w-24 object-cover"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-mono">{photo.file}</span>
              <span className="opacity-55">
                {photo.w}×{photo.h}
              </span>
              <select
                value={photo.category}
                onChange={(e) => isCategory(e.target.value) && patch(i, {category: e.target.value})}
                className="border border-white/25 bg-transparent px-1 py-0.5 text-inherit"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-ground">
                    {c}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={photo.hero} onChange={(e) => patch(i, {hero: e.target.checked})} />
                hero
              </label>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={SMALL}>
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className={SMALL}>
                ↓
              </button>
              <button type="button" onClick={() => remove(i)} disabled={busy !== null} className={SMALL}>
                削除
              </button>
            </div>
          </li>
        ))}
      </ol>

      {log.length > 0 && (
        <pre className="mt-8 max-h-48 overflow-auto border-t border-white/10 pt-4 font-mono text-xs leading-relaxed opacity-75">
          {log.join('\n')}
        </pre>
      )}
    </Shell>
  )
}

function Shell({children}: {children: React.ReactNode}) {
  return (
    <div className="mx-auto min-h-[100svh] max-w-5xl px-8 pt-[calc(var(--spacing-nav)+3.5rem)] pb-24">
      <h1 className="mb-6 text-[1.75rem] font-normal tracking-[0.05em]">Admin</h1>
      {children}
    </div>
  )
}

import {useRef} from 'preact/hooks'
import type {ComponentChildren} from 'preact'
import {CATEGORIES, isCategory, type Photo, type Place, type Project} from '../photos'
import {useExternal} from '../app/useExternal'
import {startDrag} from './drag'
import {select, selected, subscribe} from './selection'
import {current} from './draft'
import {
  addPhotos,
  addProject,
  moveProject,
  movePhotoTo,
  removePhoto,
  removeProject,
  replacePhoto,
  setCategory,
  setHero,
  setProjectText
} from './ops'

// 一覧と Works の案件に差し込む編集の部品（src/app/editing.ts の EditorTools）

const CHIP =
  'cursor-pointer border border-white/25 bg-black/70 px-1.5 py-0.5 text-[11px] leading-snug text-ink backdrop-blur-[12px] transition-colors duration-300 hover:border-white/60'

/**
 * 写真の上に重ねる操作。右上に hero・カテゴリ・差し替え・削除（Works の写真は案件も）。hero に使う写真には
 * 左下に印を出す
 */
export function PhotoTools({photo}: {photo: Photo}) {
  const active = useExternal(subscribe, () => selected() === photo.file, false)
  const input = useRef<HTMLInputElement>(null)
  return (
    // つかんで並べ替える（drag.ts）。長押しのメニューと文字の選択は出さない
    <div
      data-photo-tools
      className="absolute inset-0 cursor-grab select-none [-webkit-touch-callout:none]"
      onPointerDown={(event) => startDrag(event, photo)}
      onClick={() => select(photo.file)}
    >
      {photo.hero !== undefined && (
        <span className="absolute bottom-1.5 left-1.5 transition-opacity duration-300 group-data-dragging:opacity-0 border border-white/25 bg-black/70 px-1.5 py-0.5 text-[11px] leading-snug">
          hero
        </span>
      )}
      <div
        className={`absolute top-1.5 right-1.5 flex flex-col items-end gap-1 transition-opacity duration-300 group-data-dragging:!opacity-0 ${active ? '' : 'pointer-events-none opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100'}`}
      >
        <Chip onClick={() => setHero(photo, photo.hero === undefined)} pressed={photo.hero !== undefined}>
          hero
        </Chip>
        <select
          aria-label="カテゴリ"
          value={photo.category}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => isCategory(event.currentTarget.value) && setCategory(photo, event.currentTarget.value)}
          className={`${CHIP} appearance-none text-right`}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category} className="bg-ground">
              {category}
            </option>
          ))}
        </select>
        {photo.category === 'works' && (
          // 別の案件へ移す。移した先の先頭に入る
          <select
            aria-label="案件"
            value={photo.project}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => movePhotoTo(photo, {category: 'works', project: event.currentTarget.value})}
            className={`${CHIP} max-w-40 appearance-none truncate text-right`}
          >
            {(current()?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id} className="bg-ground">
                {projectName(project)}
              </option>
            ))}
          </select>
        )}
        <Chip onClick={() => input.current?.click()}>差し替え</Chip>
        <Chip onClick={() => removePhoto(photo)}>削除</Chip>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) void replacePhoto(photo, file)
            event.currentTarget.value = ''
          }}
        />
      </div>
    </div>
  )
}

/** 案件の呼び名。選ぶ欄に出す */
const projectName = (project: Project) =>
  [project.tag, project.caption].filter(Boolean).join(' — ') || '（種類と説明なし）'

/** 案件の種類か説明を、入力の窓で尋ねて入れる。取り消したら何もしない */
function ask(project: Project, key: 'tag' | 'caption', message: string) {
  const value = prompt(message, project[key] ?? '')
  if (value !== null) setProjectText(project, key, value)
}

/** Works の案件の見出しの右に置く操作。種類と説明・上下への並べ替え・削除 */
export function ProjectTools({project}: {project: Project}) {
  const projects = current()?.projects ?? []
  const i = projects.findIndex((p) => p.id === project.id)
  return (
    <div className="absolute top-5 right-0 flex gap-1">
      <Chip onClick={() => ask(project, 'tag', '種類（Performance / Talk / Portrait など）。空にすると外す')}>
        種類{project.tag ? '' : ' +'}
      </Chip>
      <Chip onClick={() => ask(project, 'caption', '説明の 1 行（被写体 / 場 / 年）。空にすると外す')}>
        説明{project.caption ? '' : ' +'}
      </Chip>
      <Chip onClick={() => moveProject(project, -1)} disabled={i <= 0} label="上へ">
        ↑
      </Chip>
      <Chip onClick={() => moveProject(project, 1)} disabled={i >= projects.length - 1} label="下へ">
        ↓
      </Chip>
      <Chip onClick={() => removeProject(project)}>削除</Chip>
    </div>
  )
}

/** Works の先頭に置く、空の案件を作る操作。作った案件は先頭に入る */
export function AddProjectButton() {
  return (
    <div className="mb-8 flex">
      <Chip onClick={addProject}>＋ 案件を追加</Chip>
    </div>
  )
}

function Chip({
  onClick,
  pressed,
  disabled,
  label,
  children
}: {
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  label?: string
  children: ComponentChildren
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`${CHIP} ${pressed ? 'border-white/80' : ''} disabled:pointer-events-none disabled:opacity-30`}
    >
      {children}
    </button>
  )
}

/** 一覧の先頭の「＋」の枠。押すと写真を選べ（複数可）、place（カテゴリか案件）の先頭に足す */
export function AddTile({place}: {place: Place}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 border-[0.5px] border-white/30 bg-transparent text-ink opacity-70 transition-opacity duration-300 hover:opacity-100"
    >
      <span className="text-3xl leading-none font-light">+</span>
      <span className="text-xs">写真を追加</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])]
          if (files.length) void addPhotos(files, place)
          event.currentTarget.value = ''
        }}
      />
    </button>
  )
}

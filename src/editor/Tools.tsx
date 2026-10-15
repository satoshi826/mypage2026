import {useRef} from 'preact/hooks'
import type {ComponentChildren} from 'preact'
import {useParams} from 'wouter-preact'
import {CATEGORIES, isCategory, toCategory, type Photo} from '../photos'
import {useExternal} from '../app/useExternal'
import {startDrag} from './drag'
import {select, selected, subscribe} from './selection'
import {addPhotos, removePhoto, replacePhoto, setCategory, setHero} from './ops'

// Gallery に差し込む編集の部品（src/app/editing.ts の EditorTools）

const CHIP =
  'cursor-pointer border border-white/25 bg-black/70 px-1.5 py-0.5 text-[11px] leading-snug text-ink backdrop-blur-[12px] transition-colors duration-300 hover:border-white/60'

/** 写真の上に重ねる操作。右上に hero・カテゴリ・差し替え・削除。hero に使う写真には左下に印を出す */
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
      {photo.hero && (
        <span className="absolute bottom-1.5 left-1.5 transition-opacity duration-300 group-data-dragging:opacity-0 border border-white/25 bg-black/70 px-1.5 py-0.5 text-[11px] leading-snug">
          hero
        </span>
      )}
      <div
        className={`absolute top-1.5 right-1.5 flex flex-col items-end gap-1 transition-opacity duration-300 group-data-dragging:!opacity-0 ${active ? '' : 'pointer-events-none opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100'}`}
      >
        <Chip onClick={() => setHero(photo, !photo.hero)} pressed={photo.hero}>
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

function Chip({onClick, pressed, children}: {onClick: () => void; pressed?: boolean; children: ComponentChildren}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`${CHIP} ${pressed ? 'border-white/80' : ''}`}
    >
      {children}
    </button>
  )
}

/** 一覧の先頭の「＋」の枠。押すと写真を選べ（複数可）、今見ているカテゴリの先頭に足す */
export function AddTile() {
  const params = useParams<{category?: string}>()
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
          if (files.length) void addPhotos(files, toCategory(params.category))
          event.currentTarget.value = ''
        }}
      />
    </button>
  )
}

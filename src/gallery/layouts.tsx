import {useEffect, useState} from 'react'
import {gallerySrc as photoSrc, type Photo} from '../photos'
import type {Layout} from './options'

/**
 * Photos の見せ方の候補。どれも同じ写真の配列を受け取り、並べ方だけが違う。
 * 候補を比べる段階（docs/design.md）。決まったら1つに絞って、この切り替えは消す。
 *
 * | 名前      | 形 |
 * |-----------|----|
 * | column    | 1列。横は全幅、縦は幅を絞って高さを揃える |
 * | alternate | 1列で幅 70%。左右に交互に寄せる |
 * | grid2     | 2列の格子 |
 * | grid3     | 3列の格子。一覧性重視 |
 * | masonry   | 3列の段組。縦横の混在で隙間が出ない |
 * | full      | 1枚ずつ画面の高さに収める。スライドに近い |
 * | scatter   | 幅と位置をばらして散らす。視線が泳ぐ |
 * | twopane   | 左にサムネイル格子、右に固定表示の1枚。ホバーで切り替わる |
 */
type Props = {photos: Photo[]; label: string}

export function Gallery({layout, ...props}: Props & {layout: Layout}) {
  switch (layout) {
    case 'column':
      return <Column {...props} />
    case 'alternate':
      return <Alternate {...props} />
    case 'grid2':
      return <Grid {...props} cols={2} />
    case 'grid3':
      return <Grid {...props} cols={3} />
    case 'masonry':
      return <Masonry {...props} />
    case 'full':
      return <Full {...props} />
    case 'scatter':
      return <Scatter {...props} />
    case 'twopane':
      return <TwoPane {...props} />
  }
}

const isPortrait = (photo: Photo) => photo.h > photo.w

function Img({photo, alt, index, className = ''}: {photo: Photo; alt: string; index: number; className?: string}) {
  return (
    <img
      src={photoSrc(photo)}
      alt={alt}
      width={photo.w}
      height={photo.h}
      loading={index < 2 ? 'eager' : 'lazy'}
      decoding="async"
      className={`block h-auto w-full ${className}`}
    />
  )
}

function Column({photos, label}: Props) {
  return (
    <div className="flex flex-col items-center gap-24 max-sm:gap-12">
      {photos.map((photo, i) => (
        <figure
          key={photo.file}
          data-reveal
          className={`m-0 ${isPortrait(photo) ? 'w-[48%] max-sm:w-[72%]' : 'w-full'}`}
        >
          <Img photo={photo} alt={`${label} ${i + 1}`} index={i} />
        </figure>
      ))}
    </div>
  )
}

function Alternate({photos, label}: Props) {
  return (
    <div className="flex flex-col gap-32 max-sm:gap-16">
      {photos.map((photo, i) => (
        <figure
          key={photo.file}
          data-reveal
          className={`m-0 ${isPortrait(photo) ? 'w-[40%] max-sm:w-[64%]' : 'w-[70%] max-sm:w-[88%]'} ${i % 2 ? 'self-end' : 'self-start'}`}
        >
          <Img photo={photo} alt={`${label} ${i + 1}`} index={i} />
        </figure>
      ))}
    </div>
  )
}

function Grid({photos, label, cols}: Props & {cols: 2 | 3}) {
  return (
    <div className={`grid gap-4 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'} max-sm:grid-cols-1`}>
      {photos.map((photo, i) => (
        <figure key={photo.file} data-reveal className="m-0">
          <Img photo={photo} alt={`${label} ${i + 1}`} index={i} />
        </figure>
      ))}
    </div>
  )
}

function Masonry({photos, label}: Props) {
  return (
    <div className="columns-3 gap-4 max-sm:columns-1">
      {photos.map((photo, i) => (
        <figure key={photo.file} data-reveal className="mb-4 break-inside-avoid">
          <Img photo={photo} alt={`${label} ${i + 1}`} index={i} />
        </figure>
      ))}
    </div>
  )
}

function Full({photos, label}: Props) {
  return (
    <div className="-mx-8 flex flex-col max-sm:-mx-4">
      {photos.map((photo, i) => (
        <figure key={photo.file} data-reveal className="m-0 flex h-[100svh] items-center justify-center px-8">
          <Img
            photo={photo}
            alt={`${label} ${i + 1}`}
            index={i}
            className={isPortrait(photo) ? 'max-h-[86svh] w-auto' : 'max-h-[86svh] w-auto max-w-full'}
          />
        </figure>
      ))}
    </div>
  )
}

/** 疑似乱数。index から決まるので、リロードしても同じ散らばり方になる */
const noise = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function Scatter({photos, label}: Props) {
  return (
    <div className="flex flex-col">
      {photos.map((photo, i) => {
        const width = (isPortrait(photo) ? 24 : 36) + noise(i, 1) * 18
        const left = noise(i, 2) * (100 - width)
        const gap = 8 + noise(i, 3) * 24
        return (
          <figure
            key={photo.file}
            data-reveal
            className="m-0 self-start max-sm:w-[80%]!"
            style={{width: `${width}%`, marginLeft: `${left}%`, marginTop: i === 0 ? 0 : `${gap}vh`}}
          >
            <Img photo={photo} alt={`${label} ${i + 1}`} index={i} />
          </figure>
        )
      })}
    </div>
  )
}

function TwoPane({photos, label}: Props) {
  // 一覧が変わるときは呼び出し側が key で作り直すので、ここで戻す必要はない
  const [active, setActive] = useState(0)
  const photo = photos[active] ?? photos[0]
  if (!photo) return <div />
  return (
    <div className="grid grid-cols-[1fr_1.3fr] gap-8 max-sm:grid-cols-1">
      <div className="grid grid-cols-3 gap-2 content-start">
        {photos.map((p, i) => (
          <button
            key={p.file}
            type="button"
            data-reveal
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className="m-0 cursor-pointer border-0 bg-transparent p-0 opacity-45 transition-opacity duration-300 aria-pressed:opacity-100 hover:opacity-100"
          >
            <Img photo={p} alt={`${label} ${i + 1}`} index={i} className="aspect-3/2 object-cover" />
          </button>
        ))}
      </div>
      <div className="sticky top-(--spacing-nav) h-[calc(100svh-var(--spacing-nav))] flex items-center justify-center max-sm:hidden">
        <Appear key={photo.file}>
          <img
            src={photoSrc(photo)}
            alt={`${label} ${active + 1}`}
            width={photo.w}
            height={photo.h}
            decoding="async"
            className="block max-h-[80svh] w-auto max-w-full"
          />
        </Appear>
      </div>
    </div>
  )
}

/** マウント直後に現す。IntersectionObserver を介さず、差し替わるたびに演出をかけ直す */
function Appear({children}: {children: React.ReactNode}) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div data-reveal data-revealed={revealed ? '' : undefined} className="contents">
      {children}
    </div>
  )
}

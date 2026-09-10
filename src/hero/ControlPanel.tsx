import {forwardRef, useLayoutEffect, useRef, type RefObject} from 'react'
import {PHOTOS} from './photos'
import {layoutVars, type Direction, type Layout} from './layout'

const label = (index: number) => String(index + 1).padStart(2, '0')

/**
 * 写真の下に置く操作面。自動再生の切り替えと、カレンダー状に並べた番号。
 * 選択中の1枚は丸で囲み、その丸が数字から数字へ移動する。
 * 寸法は layout の CSS 変数から取る。
 */
export const ControlPanel = forwardRef<
  HTMLDivElement,
  {
    index: number
    autoplay: boolean
    layout: Layout
    direction: Direction
    onToggle: () => void
    onSelect: (index: number) => void
    /** カレンダー上部のプログレス。Hero が --progress と --morph を毎フレーム書き込む */
    progressRef: RefObject<HTMLDivElement>
  }
>(function ControlPanel({index, autoplay, layout, direction, onToggle, onSelect, progressRef}, ref) {
  const listRef = useRef<HTMLOListElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)

  // 丸を選択中のマスへ移動させる。座標は実測なので、列数や大きさが変わっても追従する
  useLayoutEffect(() => {
    const move = () => {
      const item = listRef.current?.children[index] as HTMLElement | undefined
      if (!item || !markerRef.current) return
      markerRef.current.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`
    }
    move()
    const observer = new ResizeObserver(move)
    if (listRef.current) observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [index])

  return (
    <div
      ref={ref}
      className={`flex shrink-0 flex-col items-center gap-4 ${direction === 'side' ? '' : 'pt-1'}`}
      style={layoutVars(layout)}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={autoplay}
        className="cursor-pointer text-xs tracking-[0.2em]"
      >
        AUTO {autoplay ? 'ON' : 'OFF'}
      </button>

      {/* カレンダーと同じ幅に収める。幅は列数・一辺・間隔から決まる */}
      <div className="w-fit">
        {/* 前の遷移の開始で 0、次の遷移の開始で 1。通過した部分は白一色にして、
            まだ通過していない部分を遷移ぶんと静止帯ぶんで塗り分け、どの地点で
            止まるかが先に見えるようにする */}
        <div ref={progressRef} className="relative flex w-full [height:var(--progress-height)]">
          <div className="shrink-0 bg-ink [opacity:var(--morph-opacity)] [width:var(--morph)]" />
          <div className="flex-1 bg-ink [opacity:var(--dwell-opacity)]" />
          <div
            className="absolute inset-0 bg-ink"
            style={{clipPath: 'inset(0 calc((1 - var(--progress, 0)) * 100%) 0 0)'}}
          />
        </div>

        <div className="relative mt-4">
          <div
            ref={markerRef}
            aria-hidden
            className="pointer-events-none absolute rounded-full border-ink transition-transform ease-out [border-width:var(--marker-border)] [transition-duration:var(--marker-duration)] size-(--cell)"
          />
          <ol
            ref={listRef}
            className="m-0 grid p-0 [column-gap:var(--gap-x)] [row-gap:var(--gap-y)] [grid-template-columns:repeat(var(--cols),var(--cell))]"
          >
            {PHOTOS.map((photo, i) => (
              <li key={i} className="list-none size-(--cell)">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={i === index}
                  aria-label={`${label(i)} ${photo.title}`}
                  className={`size-full cursor-pointer text-[0.7rem] tracking-[0.1em] transition-opacity duration-300 ${
                    i === index ? 'opacity-100' : 'hover:opacity-70 [opacity:var(--idle-opacity)]'
                  }`}
                >
                  {label(i)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
})

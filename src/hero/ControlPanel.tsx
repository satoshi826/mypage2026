import {forwardRef, useLayoutEffect, useRef, type ReactNode, type RefObject} from 'react'
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
    shuffle: boolean
    layout: Layout
    direction: Direction
    onToggle: () => void
    onShuffle: () => void
    onPrev: () => void
    onNext: () => void
    onSelect: (index: number) => void
    /** カレンダー下の棒グラフ。Hero が毎フレーム各棒の scaleY を書き込む */
    equalizerRef: RefObject<HTMLDivElement>
    /** カレンダー上部のプログレス。Hero が --progress と --morph を毎フレーム書き込む */
    progressRef: RefObject<HTMLDivElement>
  }
>(function ControlPanel(
  {
    index,
    autoplay,
    shuffle,
    layout,
    direction,
    onToggle,
    onShuffle,
    onPrev,
    onNext,
    onSelect,
    progressRef,
    equalizerRef
  },
  ref
) {
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
    // 幅はカレンダーに合わせる（列数・一辺・間隔から決まる）。バーとスペクトラムの
    // w-full はこれを基準にする。横並びでは写真と同じ高さまで伸ばし、操作を上端、
    // スペクトラムを下端に置く
    <div
      ref={ref}
      className={`w-fit shrink-0 ${direction === 'side' ? 'flex flex-col justify-between self-stretch' : 'pt-1'}`}
      style={layoutVars(layout)}
    >
      <div>
        {/* 曲目リストの上に置く再生操作。番号をクリックするのが「曲を選ぶ」にあたる。
          移動の3つを中央に、モードであるシャッフルを右端に離す。左右の欄を同じ 1fr に
          するので、右端に何を置いても中央の塊は動かない */}
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center">
          <div />
          <div className="flex items-center gap-6">
            <Transport label="Previous" onClick={onPrev} size="size-6">
              <path d="M7 5h2v14H7zM19 5 10 12l9 7z" />
            </Transport>
            <Transport label={autoplay ? 'Pause' : 'Play'} onClick={onToggle} size="size-8">
              {autoplay ? <path d="M8 5h3v14H8zM14 5h3v14h-3z" /> : <path d="M8 5 19 12 8 19z" />}
            </Transport>
            <Transport label="Next" onClick={onNext} size="size-6">
              <path d="M5 5 14 12 5 19zM15 5h2v14h-2z" />
            </Transport>
          </div>
          <Transport label="Shuffle" onClick={onShuffle} pressed={shuffle} className="justify-self-end">
            <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h4l10 12h4M3 18h4l10-12h4" />
              <path d="M18 3l3 3-3 3M18 15l3 3-3 3" />
            </g>
          </Transport>
        </div>

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

      {/* 横並びのときだけ出す。縦並びでは写真とパネルで画面を使い切っている */}
      {direction === 'side' && layout.eqHeight > 0 && (
        <div ref={equalizerRef} aria-hidden className="flex w-full items-end gap-px [height:var(--eq-height)]">
          {Array.from({length: layout.eqBars}, (_, i) => (
            <div key={i} className="h-full flex-1 origin-bottom bg-ink" style={{transform: 'scaleY(0)', opacity: 0}} />
          ))}
        </div>
      )}
    </div>
  )
})

/** 再生操作の1ボタン。`pressed` を渡したときだけ入り切りのあるモードとして扱う */
function Transport({
  label,
  onClick,
  pressed,
  size = 'size-4',
  className = '',
  children
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  size?: string
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`cursor-pointer transition-opacity duration-300 hover:opacity-60 ${className} ${
        pressed === false ? '[opacity:var(--idle-opacity)]' : ''
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={`${size} fill-current`}>
        {children}
      </svg>
    </button>
  )
}

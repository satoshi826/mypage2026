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
    /** スペクトラムの棒にホバーしたときの添字。外れたら null */
    onHover: (index: number | null) => void
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
    onHover,
    progressRef,
    equalizerRef
  },
  ref
) {
  const listRef = useRef<HTMLOListElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)

  // 丸を選択中のマスへ移動させ、中の複製を「丸が重なっている一点」を基準に拡大する。
  // 座標は実測なので、列数や大きさが変わっても追従する
  useLayoutEffect(() => {
    let settle = 0

    const place = (zoom: number) => {
      const item = listRef.current?.children[index] as HTMLElement | undefined
      const marker = markerRef.current
      const lens = lensRef.current
      if (!item || !marker || !lens) return

      // 丸はマスより大きいので、はみ出すぶんの半分だけ戻して中心を合わせる
      const inset = layout.markerGrow / 2
      marker.style.transform = `translate(${item.offsetLeft - inset}px, ${item.offsetTop - inset}px)`

      const x = item.offsetLeft + item.offsetWidth / 2
      const y = item.offsetTop + item.offsetHeight / 2

      // 下のカレンダーを丸くくり抜く。拡大鏡の中と外で同じ数字が二重に見えるのを防ぐ
      listRef.current?.style.setProperty('--lens-x', `${x}px`)
      listRef.current?.style.setProperty('--lens-y', `${y}px`)

      // 丸の中心に来ているカレンダー上の点が、拡大後も中心に残るように置く
      lens.style.transform = `translate(${marker.clientWidth / 2 - x * zoom}px, ${
        marker.clientHeight / 2 - y * zoom
      }px) scale(${zoom})`
    }

    // 移動中は等倍にしておく。拡大したまま滑ると、丸の縁で内と外の数字が食い違い、
    // 後ろの数字が削られているように見える。等倍なら複製が下と重なって継ぎ目が消える
    const move = () => {
      place(1)
      clearTimeout(settle)
      settle = setTimeout(() => place(layout.markerZoom), layout.markerDuration)
    }

    move()
    const observer = new ResizeObserver(move)
    if (listRef.current) observer.observe(listRef.current)
    return () => {
      clearTimeout(settle)
      observer.disconnect()
    }
  }, [index, layout.markerDuration, layout.markerGrow, layout.markerZoom])

  return (
    // 幅はカレンダーに合わせる（列数・一辺・間隔から決まる）。バーと棒グラフの
    // w-full はこれを基準にする
    <div
      ref={ref}
      className={`flex w-fit shrink-0 flex-col [gap:var(--block-gap)] ${direction === 'side' ? '' : 'pt-1'}`}
      style={layoutVars(layout)}
    >
      {/* 横並びのときだけ出す。縦並びでは写真とパネルで画面を使い切っている */}
      {direction === 'side' && layout.eqHeight > 0 && (
        <div
          ref={equalizerRef}
          aria-hidden
          onPointerMove={(event) => {
            // 棒は pointer-events-none なので offsetX は必ずこの枠が基準になる
            const position = event.nativeEvent.offsetX / event.currentTarget.clientWidth
            onHover(Math.min(layout.eqBars - 1, Math.max(0, Math.floor(position * layout.eqBars))))
          }}
          onPointerLeave={() => onHover(null)}
          className="flex w-full items-end gap-px border-t-ink/15 border-b-ink/50 [border-block-width:var(--progress-height)] [height:min(var(--eq-height),14vh)]"
        >
          {Array.from({length: layout.eqBars}, (_, i) => (
            <div
              key={i}
              className="pointer-events-none h-full flex-1 origin-bottom bg-ink"
              style={{transform: 'scaleY(0)', opacity: 0}}
            />
          ))}
        </div>
      )}
      {/* 曲目リストの上に置く再生操作。番号をクリックするのが「曲を選ぶ」にあたる。
          移動の3つを中央に、モードであるシャッフルを右端に離す。左右の欄を同じ 1fr に
          するので、右端に何を置いても中央の塊は動かない */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
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

      <div className="relative">
        {/* 丸は拡大鏡。地の色で塗って下を隠し、中にカレンダーの複製を拡大して置く */}
        <div
          ref={markerRef}
          aria-hidden
          className="pointer-events-none absolute overflow-hidden rounded-full bg-ground transition-transform ease-out [border-color:var(--marker-line)] [border-width:var(--marker-border)] [transition-duration:var(--marker-duration)] size-(--marker-size)"
        >
          <div
            ref={lensRef}
            className="absolute origin-top-left transition-transform ease-out [transition-duration:var(--marker-duration)]"
          >
            {numbers(index, null)}
          </div>
        </div>
        {numbers(index, onSelect, listRef)}
      </div>
    </div>
  )
})

/**
 * カレンダーの数字。onSelect を渡すと押せるボタンに、渡さないと拡大鏡用の複製になる。
 * 複製は読み上げにもタブ移動にも出さない。
 */
function numbers(index: number, onSelect: ((index: number) => void) | null, ref?: RefObject<HTMLOListElement>) {
  return (
    <ol
      ref={ref}
      aria-hidden={onSelect ? undefined : true}
      className={`m-0 grid p-0 [column-gap:var(--gap-x)] [row-gap:var(--gap-y)] [grid-template-columns:repeat(var(--cols),var(--cell))] ${
        onSelect ? 'lens-hole' : ''
      }`}
    >
      {PHOTOS.map((photo, i) => {
        const tone = i === index ? 'opacity-100' : '[opacity:var(--idle-opacity)] [scale:var(--idle-scale)]'
        const shared = `flex size-full items-center justify-center text-[0.7rem] tracking-[0.1em] transition-opacity duration-300 ${tone}`
        return (
          <li key={i} className="list-none size-(--cell)">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={i === index}
                aria-label={`${label(i)} ${photo.title}`}
                className={`${shared} cursor-pointer hover:opacity-70`}
              >
                {label(i)}
              </button>
            ) : (
              <span className={shared}>{label(i)}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

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

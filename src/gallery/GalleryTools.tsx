import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode
} from 'react'
import {createPortal} from 'react-dom'
import {COUNTS, MAX_COLUMNS, useGalleryControls, type Count} from './controls'
import {DEFAULT_SLIDER, SLIDER_PARAMS, type SliderLook} from './tuning'
import {DevPanel} from '../app/DevPanel'

const subscribe = () => () => {}

/** メニューの出入りの動き。少し下から浮かびながら現れ、沈みながら消える */
/** input[type=range] のつまみの幅（styles.css の [data-slider]）。溝の両端はこの半分ずつ内側になる */
const THUMB = 16

const SHOWN = 'opacity-100 translate-y-0'
const HIDDEN = 'pointer-events-none opacity-0 translate-y-1'

/**
 * Photos のフッターの右（SNS の手前）に置く一覧の操作。列数のスライダー。
 * PC（640px 以上）はフッターにそのまま置き、狭い画面はアイコンを押すと上に開く。
 * 状態と操作は Gallery が controls.ts に出したものを使う
 */
export function GalleryTools() {
  const [open, setOpen] = useState(false)
  const [look, setLook] = useState(DEFAULT_SLIDER)
  const button = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // 開く入れ物はフッターの外（body の直下）に描く。フッターはぼかし（backdrop-filter）を持つので、
  // その中に置くと入れ物のぼかしがフッターの中しか見えず、後ろの写真をぼかせないため。
  // プリレンダでは描かず、ブラウザでだけ出す
  const body = useSyncExternalStore(
    subscribe,
    () => document.body,
    () => null
  )
  // 開く位置。ボタンの上に、右端をそろえて左へ開く（フッターの右端寄りに置くので）
  const [at, setAt] = useState({right: 0, bottom: 0})
  useLayoutEffect(() => {
    const place = () => {
      const r = button.current?.getBoundingClientRect()
      if (r) setAt({right: innerWidth - r.right, bottom: innerHeight - r.top + 8})
    }
    place()
    addEventListener('resize', place)
    return () => removeEventListener('resize', place)
  }, [open])

  // 入れ物とボタンの外を押すか Esc で閉じる。動かしても閉じない（見比べられるように）
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!button.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', close)
    addEventListener('keydown', escape)
    return () => {
      removeEventListener('pointerdown', close)
      removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="flex h-full items-stretch">
      {import.meta.env.DEV && (
        <DevPanel
          title="列数のスライダー"
          typeName="SliderLook"
          constName="DEFAULT_SLIDER"
          params={SLIDER_PARAMS}
          defaults={DEFAULT_SLIDER}
          storageKey="mypage2026.slider"
          onChange={setLook}
        />
      )}
      {/* フッターの並びの間隔（Footer.tsx の gap-6 = 24px）と、溝の端の内側の余白（つまみの半分）を引いて、
          溝の右端から仕切りまでを dividerGap にする */}
      <ColumnSlider
        max={MAX_COLUMNS.wide}
        look={look}
        className="max-sm:hidden"
        style={{marginRight: look.dividerGap - 24 - THUMB / 2}}
      />
      <div ref={button} className="flex sm:hidden">
        <IconButton label="列数" onClick={() => setOpen(!open)} expanded={open}>
          <rect x="4" y="5" width="16" height="14" rx="1" />
          <path d="M9.33 5v14M14.67 5v14" />
        </IconButton>
      </div>
      {body &&
        createPortal(
          <div
            ref={menu}
            aria-hidden={!open}
            style={at}
            className={`fixed z-20 border border-white/10 bg-black/70 px-3 backdrop-blur-[20px] transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:hidden ${open ? SHOWN : HIDDEN}`}
          >
            <ColumnSlider max={MAX_COLUMNS.narrow} look={look} focusable={open} className="h-12" />
          </div>,
          body
        )}
    </div>
  )
}

/**
 * 列数のスライダー。0.5px の溝に列数ぶんの目盛りを刻み、今の列数に点を置き、左に数字を添える。マウスを載せると
 * 点が大きくなり、目盛りが濃くなる。左が列の少ない
 * （写真の大きい）側。目盛りをまたぐたびに列数を変え、一覧はそのたびに組み替わる（Gallery が動きの途中から
 * 引き継ぐ）。
 * 見た目は自前で描き、操作は透明な input[type=range] が受ける（ドラッグ、タップ、矢印キー、読み上げ）。
 * 目盛りの位置は、input のつまみの幅（styles.css の [data-slider]）の半分ずつ内側に寄せて揃える
 */
function ColumnSlider({
  max,
  look,
  focusable = true,
  className = '',
  style
}: {
  max: Count
  look: SliderLook
  /** 閉じている入れ物の中では、キーボードで辿れないようにする */
  focusable?: boolean
  className?: string
  style?: CSSProperties
}) {
  const controls = useGalleryControls()
  const value = controls?.columns
  const steps = COUNTS.filter((count) => count <= max)
  const position = (count: number) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${(count - 2) / (max - 2)})`
  return (
    <div
      className={`group flex items-center opacity-90 transition-opacity duration-300 select-none hover:opacity-100 ${className}`}
      style={{...style, gap: look.numberGap - THUMB / 2}}
    >
      {/* 計器の数字のように、2〜6 を縦に積んだ帯を 1 文字ぶんの窓から覗かせ、今の値の位置まで滑らせる。
          増えると下から上がってきて、減ると上から下りてくる。間の数字は素早く通り過ぎる。
          帯と点は、今の列数が分かってから描く。分かる前の位置から動いて見えないように（動くのは値が変わったときだけ）。
          この書体の数字は行の箱の中で約 1px 下に寄るので、窓ごと 1px 上げて溝の高さにそろえる */}
      <span
        aria-hidden
        className="h-[1em] w-2.5 -translate-y-px overflow-hidden text-sm leading-none font-light tabular-nums"
      >
        {value && (
          <span
            className="flex flex-col transition-[translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{translate: `0 ${-(value - 2)}em`}}
          >
            {COUNTS.map((count) => (
              <span key={count}>{count}</span>
            ))}
          </span>
        )}
      </span>
      <div className="relative h-full" style={{'--thumb': `${THUMB}px`, width: look.length + THUMB} as CSSProperties}>
        {look.track === 'on' && (
          <div aria-hidden className="absolute inset-x-[calc(var(--thumb)/2)] top-1/2 h-[0.5px] bg-ink/35" />
        )}
        {steps.map((count) => (
          <div
            key={count}
            aria-hidden
            // 点は線より小さく目立たないので、線より濃くする
            className={`absolute top-1/2 -translate-1/2 transition-colors duration-300 ${look.tick === 'dot' ? 'rounded-full bg-ink/70 group-hover:bg-ink/90' : 'bg-ink/45 group-hover:bg-ink/75'}`}
            style={
              look.tick === 'dot'
                ? {left: position(count), width: look.tickDot, height: look.tickDot}
                : {left: position(count), width: 0.5, height: look.tickHeight}
            }
          />
        ))}
        {value && (
          <div
            aria-hidden
            className="absolute top-1/2 -translate-1/2 rounded-full bg-ink transition-[left,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-140 group-has-[input:focus-visible]:scale-150"
            style={{left: position(value), width: look.thumbSize, height: look.thumbSize}}
          />
        )}
        <input
          type="range"
          data-slider
          min={2}
          max={max}
          step={1}
          value={value ?? 2}
          disabled={!controls}
          tabIndex={focusable ? 0 : -1}
          aria-label="列数"
          onChange={(event) => controls?.setColumns(Number(event.target.value) as Count)}
          className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
    </div>
  )
}

/**
 * バーの高さいっぱいを押せる、細い線のアイコンのボタン。濃さはタブと同じ 90%、ホバーで 100%。
 * 枠の幅は SNS のアイコンと同じ（Footer.tsx）。アイコンは SNS と高さをそろえ、タブの文字のようには上げない
 */
function IconButton({
  label,
  onClick,
  expanded,
  children
}: {
  label: string
  onClick: () => void
  expanded?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      className="flex w-10 cursor-pointer items-center justify-center opacity-90 transition-opacity duration-300 hover:opacity-100 max-sm:w-8"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  )
}

import {useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {Underline} from '../app/Tabs'
import {COUNTS, maxColumns, useGalleryControls} from './controls'

const subscribe = () => () => {}

/** メニューの出入りの動き。少し下から浮かびながら現れ、沈みながら消える */
const SHOWN = 'opacity-100 translate-y-0'
const HIDDEN = 'pointer-events-none opacity-0 translate-y-1'

/**
 * Photos のフッターの右（SNS の手前）に置く一覧の操作。列数のボタンで、押すとメニューが開く。
 * 状態と操作は Gallery が controls.ts に出したものを使う
 */
export function GalleryTools() {
  const controls = useGalleryControls()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // メニューはフッターの外（body の直下）に描く。フッターはぼかし（backdrop-filter）を持つので、
  // その中に置くとメニューのぼかしがフッターの中しか見えず、後ろの写真をぼかせないため。
  // プリレンダでは描かず、ブラウザでだけ出す
  const body = useSyncExternalStore(
    subscribe,
    () => document.body,
    () => null
  )
  // メニューの位置。ボタンの上に、右端をそろえて左へ開く（フッターの右端寄りに置くので）
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

  // メニューとボタンの外を押すか Esc で閉じる。選んでも閉じない（見比べられるように）
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
      <div ref={button} className="flex">
        <IconButton label="列数" onClick={() => setOpen(!open)} expanded={open}>
          <rect x="4" y="5" width="16" height="14" rx="1" />
          <path d="M9.33 5v14M14.67 5v14" />
        </IconButton>
      </div>
      {body &&
        createPortal(
          // 選んでいる列数は下線で示し、切り替えると線が滑る
          <div
            ref={menu}
            aria-hidden={!open}
            style={at}
            className={`fixed z-20 border border-white/10 bg-black/70 backdrop-blur-[20px] transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? SHOWN : HIDDEN}`}
          >
            {/* 選択肢は同じ幅の枠。中身から幅が決まる入れ物なので、1fr ずつの等分では幅が決まらない */}
            <div className="relative flex h-10 px-2 text-xs font-light tracking-[0.12em] max-sm:text-[0.625rem]">
              {COUNTS.filter((columns) => columns <= maxColumns(innerWidth)).map((columns) => (
                <button
                  key={columns}
                  type="button"
                  tabIndex={open ? 0 : -1}
                  aria-current={controls?.columns === columns || undefined}
                  onClick={() => controls?.setColumns(columns)}
                  className="flex w-10 shrink-0 cursor-pointer items-center justify-center opacity-90 transition-opacity duration-300 hover:opacity-100 max-sm:w-9"
                >
                  <span className="-translate-y-0.5">{columns}</span>
                </button>
              ))}
              <Underline current={String(controls?.columns)} />
            </div>
          </div>,
          body
        )}
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

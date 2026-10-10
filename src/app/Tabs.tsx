import {useLayoutEffect, useRef} from 'react'
import {Link} from 'wouter'

/** 文字の下端から下線までの間隔 px */
const GAP = 6
/** 下線を枠から左右にはみ出させる量 px */
const OVERHANG = 4

export type Tab = {href: string; label: string; current: boolean}

/**
 * 固定バー（ナビとフッター）のリンク 1 つ。押せる範囲はバーの高さいっぱい。文字の濃さは 80%、
 * ホバーで 100%。選んでいるかどうかは文字では示さず、入れ物の Underline が下線で示す
 */
export function TabLink({href, label, current, className = ''}: Tab & {className?: string}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`flex items-center justify-center no-underline opacity-80 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100 ${className}`}
    >
      {/* バーの中央からわずかに上げる。下線は文字の実寸から測るので一緒に上がる */}
      <span className="-translate-y-0.5">{label}</span>
    </Link>
  )
}

/** TabLink の列。どの枠も一番長い名前の幅にそろえる */
export function Tabs({items, className = ''}: {items: Tab[]; className?: string}) {
  return (
    // 列を 1fr ずつにすると、どの枠も一番長い名前の幅にそろう
    <div
      className={`inline-grid h-full auto-cols-fr grid-flow-col gap-6 text-xs tracking-[0.12em] max-sm:gap-3 max-sm:text-[0.625rem] ${className}`}
    >
      {items.map((item) => (
        <TabLink key={item.href} {...item} />
      ))}
    </div>
  )
}

/**
 * 入れ物（この線の親要素）の中で選んでいるリンク（aria-current）の下に引く 1 本の線。選ぶリンクが変わると、
 * 次のリンクの下へ滑って移る（hero のカレンダーの丸と同じ考え方）。文字の大きさが違うリンクの
 * あいだでも、その字のすぐ下へ縦にも滑る。選んでいるリンクが無いときは消し、次に出すときは
 * 滑らせずにその場に置く。親要素は position を持つこと（線の基準になる）。
 *
 * 入れ物を ref で受け取らずに親要素を使うのは、描画直後の処理が子（この線）から先に走り、
 * 親の ref がまだ空のため。開発中は処理が 2 回走るので気づきにくい
 */
export function Underline({current}: {current: string}) {
  const lineRef = useRef<HTMLDivElement>(null)
  // 線が出ているか
  const shown = useRef(false)

  useLayoutEffect(() => {
    const line = lineRef.current
    const box = line?.parentElement
    if (!line || !box) return
    const label = box.querySelector<HTMLElement>('[aria-current=page] > span')
    if (!label) {
      line.style.opacity = '0'
      shown.current = false
      return
    }
    const move = () => {
      // 横は枠（少しはみ出させる）、縦は文字のすぐ下。どちらも入れ物の内側の左上から測る
      const origin = box.getBoundingClientRect()
      const link = label.parentElement!.getBoundingClientRect()
      const text = label.getBoundingClientRect()
      // 画面の画素にそろえる。1px の線が画素の境目にかかると 2 画素ににじんで太く見えるため
      const snap = (v: number) => Math.round(v * devicePixelRatio) / devicePixelRatio
      const x = snap(link.left - origin.left - box.clientLeft - OVERHANG)
      const y = snap(text.bottom - origin.top - box.clientTop + GAP)
      line.style.width = `${snap(link.width + OVERHANG * 2)}px`
      line.style.transform = `translate(${x}px, ${y}px)`
    }
    if (shown.current) move()
    else {
      shown.current = true
      line.style.transition = 'none'
      move()
      line.style.opacity = ''
      line.getBoundingClientRect()
      line.style.transition = ''
    }
    // 画面の幅が変わったときと、書体が読み込まれて文字の幅が変わったときに測り直す
    const observer = new ResizeObserver(move)
    observer.observe(box)
    observer.observe(label)
    return () => observer.disconnect()
  }, [current])

  return (
    <div
      ref={lineRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 h-px bg-ink/60 transition-transform duration-800 ease-[cubic-bezier(0.22,1,0.36,1)]"
    />
  )
}

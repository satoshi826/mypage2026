import {useLayoutEffect, useRef} from 'preact/hooks'
import {Link} from 'wouter-preact'
import {DevPanel, type Param} from './DevPanel'

/** 文字の下端から下線までの間隔 px */
const GAP = 6
/** 下線を枠から左右にはみ出させる量 px */
const OVERHANG = 4

export type Tab = {href: string; label: string; current: boolean}

/**
 * Tabs のリンク 1 つ。押せる範囲はバーの高さいっぱい。文字の濃さは 75%、
 * ホバーで 100%。選んでいるかどうかは入れ物の Underline が下線で示し、文字はうっすら光らせる（試し中。
 * 見た目は styles.css の [data-tab-label]）。光は下線が滑るのと同じ長さでにじみ、引いていく
 */
function TabLink({href, label, current}: Tab) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className="flex items-center justify-center no-underline opacity-75 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
    >
      {/* バーの中央からわずかに上げる。下線は文字の実寸から測るので一緒に上がる */}
      <span
        data-tab-label
        className="-translate-y-0.5 transition-[text-shadow] duration-800 ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        {label}
      </span>
    </Link>
  )
}

/** TabLink の列。どの枠も一番長い名前の幅にそろえる */
export function Tabs({items, className = ''}: {items: Tab[]; className?: string}) {
  return (
    // 列を 1fr ずつにすると、どの枠も一番長い名前の幅にそろう
    <div
      className={`inline-grid h-full auto-cols-fr grid-flow-col gap-6 text-sm tracking-[0.12em] max-sm:gap-3 max-sm:text-xs ${className}`}
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
 * あいだでも、その字のすぐ下へ縦にも滑る。親要素は position を持つこと（線の基準になる）。
 *
 * 選んでいるリンクが無くなる・現れるとき（ナビのトップと他のページのあいだ）は、その場で中央の点へ縮んで
 * 消え、中央の点から左右へ伸びて線になる。ページを直接開いたときは出入りさせずにその場に置く。
 * 線はうっすら光らせる（影を白でにじませる。試し中。見た目は styles.css の [data-tab-line]）。滑ると光も一緒に移る。
 */
export function Underline({current}: {current: string}) {
  const lineRef = useRef<HTMLDivElement>(null)
  // 線が出ているか
  const shown = useRef(false)
  // 描いてから最初の 1 回か
  const mounted = useRef(false)

  useLayoutEffect(() => {
    const line = lineRef.current
    const box = line?.parentElement
    if (!line || !box) return
    const first = !mounted.current
    mounted.current = true
    const label = box.querySelector<HTMLElement>('[aria-current] > span')
    if (!label) {
      // 消えるときは位置と長さを残したまま、横の倍率だけを 0 へ。縮みきると点になって見えなくなる
      if (shown.current) line.style.transform = line.style.transform.replace(/scaleX\([^)]*\)/, 'scaleX(0)')
      shown.current = false
      return
    }
    // 画面の画素にそろえる。1px の線が画素の境目にかかると 2 画素ににじんで太く見えるため
    const snap = (v: number) => Math.round(v * devicePixelRatio) / devicePixelRatio
    /** 文字の下に置く。横は枠（少しはみ出させる）、縦は文字のすぐ下。入れ物の内側の左上から測る */
    const put = (scale: number) => {
      const origin = box.getBoundingClientRect()
      const link = label.parentElement!.getBoundingClientRect()
      const text = label.getBoundingClientRect()
      const x = snap(link.left - origin.left - box.clientLeft - OVERHANG)
      const y = snap(text.bottom - origin.top - box.clientTop + GAP)
      line.style.width = `${snap(link.width + OVERHANG * 2)}px`
      line.style.transform = `translate(${x}px, ${y}px) scaleX(${scale})`
    }
    const move = () => put(1)
    if (!shown.current) {
      shown.current = true
      // 最初の表示はその場に置く。それ以外は中央の点に置いてから伸ばす
      line.style.transition = 'none'
      put(first ? 1 : 0)
      line.getBoundingClientRect()
      line.style.transition = ''
    }
    move()
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
      data-tab-line
      className="pointer-events-none absolute top-0 left-0 h-[0.5px] transition-transform duration-800 ease-[cubic-bezier(0.22,1,0.36,1)]"
    />
  )
}

/** タブの選んでいる印の光。濃さは %、にじみは px */
type TabGlow = {
  line: number
  nearBlur: number
  near: number
  farBlur: number
  far: number
  textBlur: number
  text: number
}

/** 既定値。styles.css の --tab-* と同じ値。決まったら両方を書き換える */
const DEFAULT_TAB_GLOW: TabGlow = {line: 80, nearBlur: 3, near: 60, farBlur: 20, far: 80, textBlur: 12, text: 60}

const TAB_GLOW_PARAMS: Param<TabGlow>[] = [
  {key: 'line', label: '線の濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'nearBlur', group: '線の光', label: '近いにじみ', min: 0, max: 12, step: 0.5, hint: 'px'},
  {key: 'near', group: '線の光', label: '近い濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'farBlur', group: '線の光', label: '遠いにじみ', min: 0, max: 32, step: 1, hint: 'px'},
  {key: 'far', group: '線の光', label: '遠い濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'textBlur', group: '文字の光', label: 'にじみ', min: 0, max: 24, step: 1, hint: 'px'},
  {key: 'text', group: '文字の光', label: '濃さ', min: 0, max: 100, step: 5, hint: '%'}
]

/** 値を CSS 変数へ書く。パネルの onChange は描くたびに比べられるので、外に置いて同じ関数を渡す */
function applyTabGlow(g: TabGlow) {
  const style = document.documentElement.style
  style.setProperty('--tab-line', `${g.line}%`)
  style.setProperty('--tab-near-blur', `${g.nearBlur}px`)
  style.setProperty('--tab-near', `${g.near}%`)
  style.setProperty('--tab-far-blur', `${g.farBlur}px`)
  style.setProperty('--tab-far', `${g.far}%`)
  style.setProperty('--tab-text-blur', `${g.textBlur}px`)
  style.setProperty('--tab-text', `${g.text}%`)
}

/** タブの光を詰める開発用パネル（DevPanel） */
export function TabGlowPanel() {
  return (
    <DevPanel
      title="タブの光"
      typeName="TabGlow"
      constName="DEFAULT_TAB_GLOW"
      params={TAB_GLOW_PARAMS}
      defaults={DEFAULT_TAB_GLOW}
      storageKey="mypage2026.tabGlow"
      onChange={applyTabGlow}
    />
  )
}

import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties} from 'react'
import {Img} from './Img'
import {GAP, layout, type Expansion} from './layout'
import {useReveal} from './reveal'
import {chosenColumns, rememberColumns, setGalleryControls, type Columns} from './controls'
import {DEFAULT_MOTION, EASINGS, MOTION_PARAMS, type Motion} from './tuning'
import {DevPanel} from '../app/DevPanel'
import {jumpTo, scrollToElement} from '../app/useSmoothScroll'
import type {Photo} from '../photos'

/** 容器の幅、画面の幅で決まる列数（auto のとき使う）、広げた写真に許す高さ（画面からナビと余白を引いたもの） */
type Metrics = {width: number; autoCols: number; maxHeight: number}

/** FLIP の「変更前」の figure の位置と大きさ */
type Before = Map<string, DOMRect>

/**
 * Photos の一覧。3 列（狭い画面は 2 列）の段組。配置は layout.ts が計算し、
 * ここは絶対配置で並べるだけ。
 *
 * クリックした写真はその場で広がり（全幅。縦長は画面の高さに収まる幅）、上にあった
 * 写真は動かさず、残りを押し下げる。もう一度押すと戻る。何枚でも広げておける。動きは FLIP。変更前の位置を記録し、レイアウトが
 * 変わった直後に差分だけ transform で動かして 0 へ戻す。基準の写真の画面上の位置は
 * スクロールを即座にずらして固定する（docs/design.md の連続性）。
 *
 * マウスを載せた写真は、枠を動かさずに中の画像だけ少しズームする（Img の zoom）。広げている写真は除く。
 */
export function Gallery({photos, label}: {photos: Photo[]; label: string}) {
  const root = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  // 広げている写真。広げた順
  const [expanded, setExpanded] = useState<string[]>([])
  const [motion, setMotion] = useState(DEFAULT_MOTION)
  // 列数。フッターで選ぶ（controls.ts）
  const [columns, setColumns] = useState<Columns>(chosenColumns)
  const before = useRef<Before | null>(null)
  // 段組を変えたときに画面上の位置を保つ写真。押した写真、またはそのとき画面の中央にあった写真
  const anchorFile = useRef<string | null>(null)
  // 広げた写真が画面に収まらなければ寄せるか。押して広げたときだけ
  const reveal = useRef(false)

  useReveal(root, [photos, metrics === null])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const {top, bottom} = bars()
      setMetrics({
        width: el.clientWidth,
        autoCols: innerWidth < 640 ? 2 : 3,
        maxHeight: innerHeight - top - bottom - GAP * 2
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      removeEventListener('resize', measure)
    }
  }, [])

  const cols = columns === 'auto' ? metrics?.autoCols : columns

  const placed = useMemo(() => {
    if (!metrics || !cols) return null
    const expansions: Expansion[] = expanded.flatMap((file) => {
      const photo = photos.find((p) => p.file === file)
      return photo ? [{file, width: Math.min(metrics.width, (metrics.maxHeight * photo.w) / photo.h)}] : []
    })
    return layout(photos, metrics.width, cols, expansions)
  }, [photos, metrics, cols, expanded])

  /**
   * 段組を変える。変更前の位置を記録してから change で状態を変え、直後に FLIP で動かす（下の useLayoutEffect）。
   * anchor は画面上の位置を保つ写真。null ならそのとき画面の中央にある写真
   */
  const relayout = (anchor: string | null, change: () => void) => {
    const el = root.current
    if (!el) return
    const map: Before = new Map()
    let center: string | null = null
    let nearest = Infinity
    for (const figure of el.querySelectorAll<HTMLElement>('figure[data-file]')) {
      const rect = figure.getBoundingClientRect()
      map.set(figure.dataset.file!, rect)
      // 配置の変化で画面に入ってくる写真は、ワイプなしで即座に出す。ワイプはスクロールで
      // 見つけるためのもので、動いている最中に現れ始めると不連続に見える
      if (near(rect)) figure.dataset.revealed = ''
      const distance = Math.hypot(
        rect.left + rect.width / 2 - innerWidth / 2,
        rect.top + rect.height / 2 - innerHeight / 2
      )
      if (distance < nearest) [nearest, center] = [distance, figure.dataset.file!]
    }
    el.dataset.revealInstant = ''
    requestAnimationFrame(() => delete el.dataset.revealInstant)
    before.current = map
    anchorFile.current = anchor ?? center
    change()
  }

  /** 押した写真を広げる・戻す */
  const toggle = (file: string) =>
    relayout(file, () => {
      reveal.current = !expanded.includes(file)
      setExpanded((list) => (list.includes(file) ? list.filter((f) => f !== file) : [...list, file]))
    })

  // フッターの操作（列数、全部戻す）を出す。外れるときは消す
  useEffect(() => {
    setGalleryControls({
      columns,
      setColumns: (next) => {
        if (next === columns) return
        rememberColumns(next)
        relayout(null, () => setColumns(next))
      },
      collapsible: expanded.length > 0,
      collapseAll: () => {
        if (expanded.length > 0) relayout(null, () => setExpanded([]))
      }
    })
  })
  useEffect(() => () => setGalleryControls(null), [])

  // レイアウトが変わった直後。基準の写真の画面上の位置を固定してから、差分を動かす
  useLayoutEffect(() => {
    const first = before.current
    before.current = null
    const el = root.current
    if (!first || !el) return

    // 基準の写真の document 上の位置が変わったぶんだけスクロールを即座にずらし、
    // 画面上の位置を変えない。残りの動きは全部 FLIP が受け持つ
    const file = anchorFile.current
    const anchor = file ? el.querySelector<HTMLElement>(`figure[data-file="${CSS.escape(file)}"]`) : null
    const was = anchor && first.get(anchor.dataset.file!)
    if (anchor && was) {
      const limit = document.documentElement.scrollHeight - innerHeight
      jumpTo(Math.max(0, Math.min(limit, scrollY + anchor.getBoundingClientRect().top - was.top)))
    }

    // 大きさが変わる写真も figure ごと動かす。img とワイプ用の覆いが一緒に動くので、中身だけを
    // 動かすより単純で、枠と中身がずれない。
    // 位置を全部読んでから動かす。animate() のたびにスタイルが無効になるので、読みと交互にすると
    // 読むたびに全体の再計算が走り、写真の数の 2 乗で重くなる。
    // 変更前も変更後も画面から遠い写真は動かさない。見えない動きで、動かす本数が写真の数に比例して増えるため
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!still) {
      const moves: [HTMLElement, DOMRect, DOMRect][] = []
      for (const figure of el.querySelectorAll<HTMLElement>('figure[data-file]')) {
        const from = first.get(figure.dataset.file!)
        const to = figure.getBoundingClientRect()
        if (from && (near(from) || near(to))) moves.push([figure, from, to])
      }
      for (const [figure, from, to] of moves) flip(figure, from, to, motion)
    }

    // 押して広げた写真がナビとフッターのあいだに収まらなければ、上辺をナビの下へ慣性で寄せる
    if (reveal.current && anchor) {
      reveal.current = false
      const {top, bottom} = bars()
      const rect = anchor.getBoundingClientRect()
      if (rect.top < top + GAP || rect.bottom > innerHeight - bottom)
        scrollToElement(anchor, {
          offset: -(top + GAP),
          duration: motion.scrollSeconds,
          easing: EASINGS[motion.easing].fn
        })
    }
  }, [expanded, photos, motion, cols])

  return (
    <div
      ref={root}
      className="relative"
      style={
        {
          height: placed?.height ?? 0,
          '--hover-zoom': motion.hoverZoom,
          '--hover-seconds': `${motion.hoverSeconds}s`,
          '--hover-ease': EASINGS[motion.easing].css
        } as CSSProperties
      }
    >
      {import.meta.env.DEV && (
        <DevPanel
          title="Photos の動き"
          typeName="Motion"
          constName="DEFAULT_MOTION"
          params={MOTION_PARAMS}
          defaults={DEFAULT_MOTION}
          storageKey="mypage2026.motion"
          onChange={setMotion}
        />
      )}
      {placed &&
        photos.map((photo, i) => {
          const at = placed.items.get(photo.file)!
          const wide = expanded.includes(photo.file)
          return (
            <figure
              key={photo.file}
              data-file={photo.file}
              data-reveal
              onClick={() => toggle(photo.file)}
              className={`group absolute m-0 overflow-hidden ${wide ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
              // 高さも配置の計算値で与える。src を外した img は高さ 0 になり、枠が潰れるため。
              // content-visibility: auto は使わない。中身を飛ばすかどうかの判定がフレームの更新に
              // 乗っていて、スクロールが止まったあと画面内の写真が飛ばされたまま残ることがある（Chrome）
              style={{left: at.x, top: at.y, width: at.w, height: at.h}}
            >
              <Img photo={photo} alt={`${label} ${i + 1}`} index={i} large={wide} zoom={!wide} />
              {/* ワイプ用の覆い。styles.css の [data-reveal] を参照 */}
              <div data-reveal-cover aria-hidden />
            </figure>
          )
        })}
    </div>
  )
}

/** 固定のナビ（文書で最初の nav）とフッターが、画面の上下を覆う高さ px */
const bars = () => ({
  top: document.querySelector('nav')?.getBoundingClientRect().height ?? 0,
  bottom: document.querySelector('footer')?.getBoundingClientRect().height ?? 0
})

/**
 * 広げる・戻すあいだに見えうる範囲にあるか。画面の上下に 1 画面ずつ余裕を持つ。広げたあとの
 * 寄せるスクロール（最大でほぼ 1 画面）で画面に入ってくる写真も含めるため
 */
const near = (rect: DOMRect) => rect.bottom > -innerHeight && rect.top < innerHeight * 2

/** 変更前の位置・大きさから今の位置へ、transform の差分を戻す形で動かす */
function flip(el: HTMLElement, from: DOMRect, to: DOMRect, motion: Motion) {
  const dx = from.left - to.left
  const dy = from.top - to.top
  const sx = from.width / to.width
  const sy = from.height / to.height
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return
  el.animate(
    [
      {transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`},
      {transformOrigin: '0 0', transform: 'none'}
    ],
    {duration: motion.expandSeconds * 1000, easing: EASINGS[motion.easing].css}
  )
}

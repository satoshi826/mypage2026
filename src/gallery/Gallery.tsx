import {useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties} from 'react'
import {Img} from './Img'
import {gapFor, layout, type Expansion, type Placed} from './layout'
import {useReveal} from './reveal'
import {chosenColumns, rememberColumns, setGalleryControls, type Columns} from './controls'
import {DEFAULT_MOTION, DEFAULT_SPACING, EASINGS, MOTION_PARAMS, SPACING_PARAMS, type Motion} from './tuning'
import {DevPanel} from '../app/DevPanel'
import {glideTo, jumpTo} from '../app/useSmoothScroll'
import type {Photo} from '../photos'

/**
 * 寸法。容器の幅、画面の幅で決まる列数（auto のとき使う）、広げた写真に許す高さ、画面の高さ、
 * 容器の文書上の上端、固定のナビとフッターの高さ。どれも画面の大きさが変わったときだけ読む
 */
type Metrics = {
  width: number
  autoCols: number
  maxHeight: number
  viewport: number
  top: number
  bars: {top: number; bottom: number}
}

/** 広げた写真とナビ・フッターのあいだ px */
const MARGIN = 16
/** 画面の上下に、画面の高さのこの倍だけ先まで写真を描く（描くと画像を読み始める）。慣性スクロールでも間に合うように */
const RANGE = 2.5
/** 描く範囲を見直すスクロールの刻み。画面の高さに対する割合。スクロールのたびに描き直さないため */
const STEP = 0.25

/** 段組を変える直前の状態。変更前の配置、そのときのスクロール（容器の上端から）、画面上の位置を保つ写真 */
type Before = {items: Map<string, Placed>; scroll: number; anchor: string | null}

/** 画面上の位置と大きさ */
type Box = {left: number; top: number; width: number; height: number}

const NONE: ReadonlySet<string> = new Set()

/**
 * Photos の一覧。3 列（狭い画面は 2 列）の段組。配置は layout.ts が計算し、
 * ここは絶対配置で並べるだけ。画面に近い写真だけを描く。全部の写真の位置は計算で分かっているので、
 * 写真が何枚あっても描く要素の数は画面の大きさで決まる。
 *
 * クリックした写真はその場で広がり（全幅。縦長は画面の高さに収まる幅）、上にあった
 * 写真は動かさず、残りを押し下げる。もう一度押すか Esc で戻る。広げられるのは 1 枚で、広げているあいだに
 * 別の写真を押すと、前の写真を戻しながらその写真を広げる（1 回の動きで）。動きは FLIP。
 * 変更前と変更後の位置はどちらも配置の計算から出し、差分だけ transform で動かして 0 へ戻す。DOM から
 * 位置を読まないので、レイアウトの計算を強制しない。基準の写真の画面上の位置は
 * スクロールを即座にずらして固定する（docs/design.md の連続性）。
 *
 * マウスを載せた写真は、枠を動かさずに中の画像だけ少しズームする（Img の zoom）。広げている写真は除く。
 */
export function Gallery({photos, label}: {photos: Photo[]; label: string}) {
  const root = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  // 広げている写真
  const [expanded, setExpanded] = useState<string | null>(null)
  const [motion, setMotion] = useState(DEFAULT_MOTION)
  const [spacing, setSpacing] = useState(DEFAULT_SPACING)
  // 列数。フッターで選ぶ（controls.ts）
  const [columns, setColumns] = useState<Columns>(chosenColumns)
  // 段組を変えている最中の、変更前の状態。変えた直後の useLayoutEffect が使って消す
  const [before, setBefore] = useState<Before | null>(null)
  // 段組を変えるとき、変更前に画面の近くにあった写真。動き終わるまで描き続ける（離れていく動きを見せるため）
  const [keep, setKeep] = useState(NONE)
  // 現れる演出を済ませた写真。画面から離れて要素が外れても、戻ってきたときにもう一度演出しない
  const revealed = useRef(new Set<string>())
  // 広げた写真が画面に収まらなければ寄せるか。押して広げたときだけ
  const reveal = useRef(false)

  // スクロール位置を刻みで丸めたもの。刻みをまたいだときだけ描き直す
  const step = useSyncExternalStore(
    subscribeScroll,
    () => (metrics ? Math.floor((scrollY - metrics.top) / (metrics.viewport * STEP)) : 0),
    () => 0
  )

  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const bars = {
        top: document.querySelector('nav')?.getBoundingClientRect().height ?? 0,
        bottom: document.querySelector('footer')?.getBoundingClientRect().height ?? 0
      }
      const next: Metrics = {
        width: el.clientWidth,
        autoCols: innerWidth < 640 ? 2 : 3,
        maxHeight: innerHeight - bars.top - bars.bottom - MARGIN * 2,
        viewport: innerHeight,
        top: pageTop(el),
        bars
      }
      // 容器の高さが変わるたび（写真を広げるたび）に呼ばれるので、変わらなければ描き直さない
      setMetrics((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
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
    const photo = expanded ? photos.find((p) => p.file === expanded) : undefined
    const expansion: Expansion | null = photo
      ? {file: photo.file, width: Math.min(metrics.width, (metrics.maxHeight * photo.w) / photo.h)}
      : null
    return layout(photos, metrics.width, cols, gapFor(metrics.width, cols, spacing), expansion)
  }, [photos, metrics, cols, spacing, expanded])

  // 描く写真。画面の近くと、動き終わるまで描き続ける写真。段組を変えている最中は、基準の写真に
  // 合わせてずらしたあとのスクロール位置で選ぶ（ずらす前の位置で選ぶと、ずらした先の写真が 1 フレーム欠ける）
  const mounted: {photo: Photo; index: number}[] = []
  if (metrics && placed) {
    const height = metrics.viewport
    let view = step * STEP * height
    if (before) {
      const was = before.anchor ? before.items.get(before.anchor) : undefined
      const now = before.anchor ? placed.items.get(before.anchor) : undefined
      view = before.scroll + (was && now ? now.y - was.y : 0)
    }
    const from = view - RANGE * height
    const to = view + (1 + STEP + RANGE) * height
    photos.forEach((photo, index) => {
      const at = placed.items.get(photo.file)!
      if ((at.y + at.h > from && at.y < to) || keep.has(photo.file)) mounted.push({photo, index})
    })
  }

  // 描く写真が変わったときと、段組を変える動きの始めと終わりに見直す。配置の変化で画面に入ってきた
  // 写真は、動いているあいだは位置の判定にかからないので、動き終わってから現す
  useReveal(root, [mounted.map(({photo}) => photo.file).join(), keep], (target) =>
    revealed.current.add(target.dataset.file!)
  )

  /**
   * 段組を変える。変更前の配置を記録してから change で状態を変え、直後に FLIP で動かす（下の useLayoutEffect）。
   * anchor は画面上の位置を保つ写真。null ならそのとき画面の中央にある写真
   */
  const relayout = (anchor: string | null, change: () => void) => {
    const el = root.current
    if (!el || !metrics || !placed) return
    const scroll = scrollY - metrics.top
    const near = new Set<string>()
    let center: string | null = null
    let nearest = Infinity
    for (const [file, at] of placed.items) {
      const box = toBox(at, scroll)
      if (!isNear(box, metrics.viewport)) continue
      near.add(file)
      // 配置の変化で画面に入ってくる写真は、ワイプなしで即座に出す。ワイプはスクロールで
      // 見つけるためのもので、動いている最中に現れ始めると不連続に見える
      revealed.current.add(file)
      const distance = Math.hypot(
        box.left + box.width / 2 - metrics.width / 2,
        box.top + box.height / 2 - metrics.viewport / 2
      )
      if (distance < nearest) [nearest, center] = [distance, file]
    }
    el.dataset.revealInstant = ''
    requestAnimationFrame(() => delete el.dataset.revealInstant)
    setBefore({items: placed.items, scroll, anchor: anchor ?? center})
    setKeep(near)
    change()
  }

  // 動き終わったら、離れていった写真を外す
  useEffect(() => {
    if (keep.size === 0) return
    const timer = setTimeout(() => setKeep(NONE), motion.expandSeconds * 1000)
    return () => clearTimeout(timer)
  }, [keep, motion.expandSeconds])

  /** 押した写真を広げる・戻す。別の写真を広げているときは、そちらを戻しながら広げる */
  const toggle = (file: string) =>
    relayout(file, () => {
      reveal.current = expanded !== file
      setExpanded(expanded === file ? null : file)
    })

  // 広げているあいだは Esc でも戻す
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && toggle(expanded)
    addEventListener('keydown', close)
    return () => removeEventListener('keydown', close)
  })

  // フッターの操作（列数）を出す。外れるときは消す
  useEffect(() => {
    setGalleryControls({
      columns,
      setColumns: (next) => {
        if (next === columns) return
        rememberColumns(next)
        relayout(null, () => setColumns(next))
      }
    })
  })
  useEffect(() => () => setGalleryControls(null), [])

  // レイアウトが変わった直後。基準の写真の画面上の位置を固定してから、差分を動かす
  useLayoutEffect(() => {
    const first = before
    const el = root.current
    if (!first || !el || !metrics || !placed) return
    setBefore(null)

    // 基準の写真の文書上の位置が変わったぶんだけスクロールを即座にずらし、
    // 画面上の位置を変えない。残りの動きは全部 FLIP が受け持つ
    const was = first.anchor ? first.items.get(first.anchor) : undefined
    const now = first.anchor ? placed.items.get(first.anchor) : undefined
    if (was && now) jumpTo(scrollY + now.y - was.y)
    const scroll = scrollY - metrics.top

    // 大きさが変わる写真も figure ごと動かす。img とワイプ用の覆いが一緒に動くので、中身だけを
    // 動かすより単純で、枠と中身がずれない。
    // 変更前も変更後も画面から遠い写真は動かさない。見えない動きで、動かす本数が写真の数に比例して増えるため
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!still) {
      for (const figure of el.querySelectorAll<HTMLElement>('figure[data-file]')) {
        const from = first.items.get(figure.dataset.file!)
        const to = placed.items.get(figure.dataset.file!)
        if (!from || !to) continue
        const a = toBox(from, first.scroll)
        const b = toBox(to, scroll)
        if (isNear(a, metrics.viewport) || isNear(b, metrics.viewport)) flip(figure, a, b, motion)
      }
    }

    // 押して広げた写真がナビとフッターのあいだに収まらなければ、上辺をナビの下へ慣性で寄せる
    if (reveal.current && now) {
      reveal.current = false
      const {top, bottom} = metrics.bars
      const box = toBox(now, scroll)
      if (box.top < top + MARGIN || box.top + box.height > metrics.viewport - bottom)
        glideTo(metrics.top + now.y - top - MARGIN, {
          duration: motion.scrollSeconds,
          easing: EASINGS[motion.easing].fn
        })
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [before])

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
      {import.meta.env.DEV && (
        <DevPanel
          title="Photos の隙間"
          typeName="Spacing"
          constName="DEFAULT_SPACING"
          params={SPACING_PARAMS}
          defaults={DEFAULT_SPACING}
          storageKey="mypage2026.spacing"
          onChange={setSpacing}
        />
      )}
      {placed &&
        mounted.map(({photo, index}) => {
          const at = placed.items.get(photo.file)!
          const wide = expanded === photo.file
          return (
            <figure
              key={photo.file}
              data-file={photo.file}
              data-reveal
              // 現れる演出を済ませた写真は、描き直しても覆いを付けない
              ref={(node) => {
                if (node && revealed.current.has(photo.file)) node.dataset.revealed = ''
              }}
              onClick={() => toggle(photo.file)}
              className={`group absolute m-0 overflow-hidden ${wide ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
              // 高さも配置の計算値で与える。画像が届くまでの img は高さを持たず、枠が潰れるため。
              // content-visibility: auto は使わない。中身を飛ばすかどうかの判定がフレームの更新に
              // 乗っていて、スクロールが止まったあと画面内の写真が飛ばされたまま残ることがある（Chrome）
              style={{left: at.x, top: at.y, width: at.w, height: at.h}}
            >
              <Img
                photo={photo}
                alt={`${label} ${index + 1}`}
                width={at.w}
                large={wide}
                hold={keep.size > 0}
                zoom={!wide}
              />
              {/* ワイプ用の覆い。styles.css の [data-reveal] を参照 */}
              <div data-reveal-cover aria-hidden />
            </figure>
          )
        })}
    </div>
  )
}

const subscribeScroll = (onChange: () => void) => {
  addEventListener('scroll', onChange, {passive: true})
  return () => removeEventListener('scroll', onChange)
}

/** 文書の上端からの位置。transform を含まない（ページの移動の演出で動いている最中に測っても狂わない） */
function pageTop(el: HTMLElement) {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop
  return top
}

/** 配置（容器の中の位置）を、容器の上端から scroll だけスクロールしたときの画面上の位置にする。左右は容器の左端から */
const toBox = (at: Placed, scroll: number): Box => ({left: at.x, top: at.y - scroll, width: at.w, height: at.h})

/**
 * 広げる・戻すあいだに見えうる範囲にあるか。画面の上下に 1 画面ずつ余裕を持つ。広げたあとの
 * 寄せるスクロール（最大でほぼ 1 画面）で画面に入ってくる写真も含めるため
 */
const isNear = (box: Box, viewport: number) => box.top + box.height > -viewport && box.top < viewport * 2

/** 変更前の位置・大きさから今の位置へ、transform の差分を戻す形で動かす */
function flip(el: HTMLElement, from: Box, to: Box, motion: Motion) {
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

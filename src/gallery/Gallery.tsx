import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {Img} from './Img'
import {GAP, layout, type Expansion} from './layout'
import {useReveal} from './reveal'
import {DEFAULT_MOTION, EASINGS, MOTION_PARAMS, type Motion} from './tuning'
import {DevPanel} from '../app/DevPanel'
import {jumpTo, scrollToElement} from '../app/useSmoothScroll'
import type {Photo} from '../photos'

/** 容器の幅、列数、広げた写真に許す高さ（画面からナビと余白を引いたもの） */
type Metrics = {width: number; cols: number; maxHeight: number}

/** FLIP の「変更前」の figure の位置と大きさ */
type Before = Map<string, DOMRect>

/**
 * Photos の一覧。3 列（狭い画面は 2 列）の段組。配置は layout.ts が計算し、
 * ここは絶対配置で並べるだけ。
 *
 * クリックした写真はその場で広がり（全幅。縦長は画面の高さに収まる幅）、上にあった
 * 写真は動かさず、残りを押し下げる。動きは FLIP。変更前の位置を記録し、レイアウトが
 * 変わった直後に差分だけ transform で動かして 0 へ戻す。基準の写真の画面上の位置は
 * スクロールを即座にずらして固定する（docs/design.md の連続性）。
 */
export function Gallery({photos, label}: {photos: Photo[]; label: string}) {
  const root = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [motion, setMotion] = useState(DEFAULT_MOTION)
  const before = useRef<Before | null>(null)
  // 直前に広げていた写真。戻すときの基準
  const focus = useRef<string | null>(null)

  useReveal(root, [photos, metrics === null])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const nav = document.querySelector('nav')?.getBoundingClientRect().height ?? 0
      setMetrics({width: el.clientWidth, cols: innerWidth < 640 ? 2 : 3, maxHeight: innerHeight - nav - GAP * 2})
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      removeEventListener('resize', measure)
    }
  }, [])

  const expansion = useMemo<Expansion | null>(() => {
    const photo = expanded && photos.find((p) => p.file === expanded)
    if (!photo || !metrics) return null
    return {file: photo.file, width: Math.min(metrics.width, (metrics.maxHeight * photo.w) / photo.h)}
  }, [expanded, photos, metrics])

  const placed = useMemo(
    () => (metrics ? layout(photos, metrics.width, metrics.cols, expansion) : null),
    [photos, metrics, expansion]
  )

  /** 変更前の位置を記録してから状態を変える */
  const go = (next: string | null) => {
    const el = root.current
    if (!el) return
    const map: Before = new Map()
    for (const figure of el.querySelectorAll<HTMLElement>('figure[data-file]')) {
      const rect = figure.getBoundingClientRect()
      map.set(figure.dataset.file!, rect)
      // 配置の変化で画面に入ってくる写真は、ワイプなしで即座に出す。ワイプはスクロールで
      // 見つけるためのもので、動いている最中に現れ始めると不連続に見える
      if (rect.top < innerHeight * 2 && rect.bottom > -innerHeight) figure.dataset.revealed = ''
    }
    el.dataset.revealInstant = ''
    requestAnimationFrame(() => delete el.dataset.revealInstant)
    before.current = map
    if (next) focus.current = next
    setExpanded(next)
  }

  // レイアウトが変わった直後。基準の写真の画面上の位置を固定してから、差分を動かす
  useLayoutEffect(() => {
    const first = before.current
    before.current = null
    const el = root.current
    if (!first || !el) return

    // 基準は広げた写真、戻すときは縮む写真。document 上の位置が変わったぶんだけスクロールを
    // 即座にずらし、画面上の位置を変えない。残りの動きは全部 FLIP が受け持つ
    const file = expanded ?? focus.current
    const anchor = file ? el.querySelector<HTMLElement>(`figure[data-file="${CSS.escape(file)}"]`) : null
    const was = anchor && first.get(anchor.dataset.file!)
    if (anchor && was) {
      const limit = document.documentElement.scrollHeight - innerHeight
      jumpTo(Math.max(0, Math.min(limit, scrollY + anchor.getBoundingClientRect().top - was.top)))
    }

    // 大きさが変わる写真も figure ごと動かす。中の img だけを scale すると、ワイプ用の窓
    // （overflow: hidden）が先に新しい大きさになり、縮むときに画像が窓で切り取られる
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!still) {
      for (const figure of el.querySelectorAll<HTMLElement>('figure[data-file]')) {
        const from = first.get(figure.dataset.file!)
        if (from) flip(figure, from, figure.getBoundingClientRect(), motion)
      }
    }

    // 広げた写真が画面に収まらなければ、上辺をナビの下へ慣性で寄せる
    if (expanded && anchor) {
      const nav = document.querySelector('nav')?.getBoundingClientRect().height ?? 0
      const rect = anchor.getBoundingClientRect()
      if (rect.top < nav + GAP || rect.bottom > innerHeight)
        scrollToElement(anchor, {
          offset: -(nav + GAP),
          duration: motion.scrollSeconds,
          easing: EASINGS[motion.easing].fn
        })
    }
  }, [expanded, photos, motion])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && go(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return (
    <div ref={root} className="relative" style={{height: placed?.height ?? 0}}>
      {import.meta.env.DEV && (
        <div className="pointer-events-none fixed top-16 left-4 z-10">
          <DevPanel
            title="Photos の動き"
            typeName="Motion"
            constName="DEFAULT_MOTION"
            params={MOTION_PARAMS}
            defaults={DEFAULT_MOTION}
            storageKey="mypage2026.motion"
            onChange={setMotion}
          />
        </div>
      )}
      {placed &&
        photos.map((photo, i) => {
          const at = placed.items.get(photo.file)!
          const wide = photo.file === expanded
          return (
            <figure
              key={photo.file}
              data-file={photo.file}
              data-reveal
              onClick={() => go(wide ? null : photo.file)}
              className={`absolute m-0 ${wide ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
              // 高さも配置の計算値で与える。src を外した img は高さ 0 になり、figure が面積 0 だと
              // content-visibility が中身を飛ばして img が箱を失い、IntersectionObserver が二度と拾えない。
              // content-visibility: 画面外の写真は描画を丸ごと飛ばす
              style={{
                left: at.x,
                top: at.y,
                width: at.w,
                height: at.h,
                contentVisibility: 'auto',
                containIntrinsicSize: `${at.w}px ${at.h}px`
              }}
            >
              {/* ワイプ用の窓。styles.css の [data-reveal] を参照 */}
              <div className="overflow-hidden">
                <Img photo={photo} alt={`${label} ${i + 1}`} index={i} large={wide} />
              </div>
            </figure>
          )
        })}
    </div>
  )
}

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

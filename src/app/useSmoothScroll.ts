import {useEffect} from 'react'
import {useLocation} from 'wouter'

/*
 * 慣性スクロール。ホイールの入力を直接使わず、目標位置へ毎フレーム少しずつ寄せる（docs/design.md）。
 * ブラウザのスクロール位置そのものを動かすので、IntersectionObserver や sticky はそのまま使える。
 *
 * - ホイールだけを横取りする。タッチ・キーボード・スクロールバー・ページ遷移の先頭戻しはブラウザに
 *   任せ、その結果（scroll イベント）を現在地として受け取る。自分が動かしている最中の scroll イベントは
 *   自分の書き込み（ブラウザの scrollTo は進行中のキー操作などの滑らかな移動を打ち切る）。
 * - 寄せ方は frame-rate independent damping（1 - e^(-λ·dt)）。λ = LERP × 60 で、60fps なら
 *   1 フレームに残り距離の LERP だけ進む。
 * - 動きを減らす設定（prefers-reduced-motion）ではホイールに触らず、scrollToElement も即座に飛ぶ。
 */

/** 60fps 換算で 1 フレームに進む残り距離の割合 */
const LERP = 0.1
/** deltaMode が行単位（Firefox）のときの 1 行の px */
const LINE = 100 / 6

/** duration 付きの移動。from から to へ easing で進む */
type Glide = {from: number; to: number; duration: number; easing: (t: number) => number; elapsed: number}

/** 寄せている最中の位置（小数）。目標に着いたら target と一致する */
let position = 0
let target = 0
let glide: Glide | null = null
/** 直前に自分で書いたスクロール位置。scroll イベントが自分のものかを見分ける */
let wrote: number | null = null
let frame = 0
let last = 0
let still = false

const limit = () => document.documentElement.scrollHeight - innerHeight
const clamp = (y: number) => Math.max(0, Math.min(limit(), y))

function write(y: number) {
  wrote = y
  window.scrollTo(0, y)
}

/** ブラウザが動かしたスクロール。そこを現在地にする。自分が動かしている最中のものは自分の書き込み */
function onScroll() {
  if (frame || (wrote !== null && Math.abs(scrollY - wrote) < 1)) return
  position = target = scrollY
  glide = null
  wrote = null
}

function onWheel(event: WheelEvent) {
  // ピンチズーム、横方向のジェスチャはブラウザに任せる
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.cancelable) return
  const dy = event.deltaY * (event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? innerHeight : 1)
  if (dy === 0) return
  event.preventDefault()
  // duration 付きの移動の途中なら、今いる場所から引き継ぐ
  if (glide) {
    glide = null
    target = position
  }
  target = clamp(target + dy)
  run()
}

function run() {
  if (frame) return
  last = performance.now()
  frame = requestAnimationFrame(tick)
}

function tick(time: number) {
  // タブに戻った直後などの大きな dt で一気に飛ばない
  const dt = Math.min((time - last) / 1000, 0.1)
  last = time
  if (glide) {
    glide.elapsed += dt
    const t = Math.min(1, glide.elapsed / glide.duration)
    position = glide.from + (glide.to - glide.from) * glide.easing(t)
    if (t >= 1) {
      target = position
      glide = null
    }
  } else {
    position += (target - position) * (1 - Math.exp(-LERP * 60 * dt))
    if (Math.abs(target - position) < 0.5) position = target
  }
  write(position)
  frame = glide || position !== target ? requestAnimationFrame(tick) : 0
}

/** 要素の上辺へ寄せる。offset は上辺からのずらし px（負で手前に止める）、duration は秒、easing は 0〜1 → 0〜1 */
export function scrollToElement(
  el: HTMLElement,
  {offset, duration, easing}: {offset: number; duration: number; easing: (t: number) => number}
) {
  const to = clamp(el.getBoundingClientRect().top + scrollY + offset)
  if (still) return jumpTo(to)
  glide = {from: position, to, duration, easing, elapsed: 0}
  target = to
  run()
}

/** 即座にその位置へ。進行中の移動は打ち切る。レイアウトの変化に合わせて視点を固定するために使う */
export function jumpTo(y: number) {
  position = target = clamp(y)
  glide = null
  write(position)
}

/** 全ページ共通。ページ遷移時は先頭へ即座に戻す */
export function useSmoothScroll() {
  const [location] = useLocation()

  useEffect(() => {
    still = matchMedia('(prefers-reduced-motion: reduce)').matches
    position = target = scrollY
    addEventListener('scroll', onScroll)
    if (!still) addEventListener('wheel', onWheel, {passive: false})
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('wheel', onWheel)
      cancelAnimationFrame(frame)
      frame = 0
    }
  }, [])

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant'})
  }, [location])
}

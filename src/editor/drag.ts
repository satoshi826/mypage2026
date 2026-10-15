import {setDragging} from '../app/editing'
import type {Photo} from '../photos'
import {movePhoto} from './ops'

// 写真をつかんで並べ替える。マウスは押したまま少し動かすと、指は長押しすると持ち上がる（普通に触って動かすと
// スクロールになる）。つかんだ写真の下に別の写真が来たら、その位置へ並べ替え、ほかの写真は Gallery が
// 今の移動の動きで場所を空ける。画面の上下の端に近づけると自動でスクロールする

/** 指で持ち上げるまでの長押し ms */
const HOLD = 350
/** 持ち上げる前にこれより動いたら、マウスはつかむ、指はスクロールとみなす px */
const SLOP = 6
/**
 * 並べ替えたあと、次に並べ替えるまでに動かす距離 px。段組は写真を順に空いている列へ置くので、1 つ並べ替えると
 * 後ろの写真がまとめて動き、つかんでいる写真の下に別の写真が来る。すぐ並べ替えると行ったり来たりする
 */
const STEP = 24
/** ナビの下端・フッターの上端からこの距離に入ると自動でスクロールする px */
const EDGE = 72
/** 自動スクロールの最大の速さ px / フレーム */
const SPEED = 16

/** 写真の上の操作（Tools.tsx）の pointerdown から呼ぶ */
export function startDrag(event: PointerEvent, photo: Photo) {
  if (event.button !== 0 || (event.target as Element).closest('button, select, input')) return
  const handle = event.currentTarget as HTMLElement
  const figure = handle.closest('figure')!
  const grid = figure.parentElement!
  const touch = event.pointerType !== 'mouse'
  const start = {x: event.clientX, y: event.clientY}
  let pointer = start
  let last = start
  let grab = {x: 0, y: 0}
  let active = false
  let frame = 0
  const timer = touch ? setTimeout(lift, HOLD) : 0

  /** つかんだ写真を指（マウス）の位置へ。要素の位置（offset）は並べ替えた先の配置なので、そこからの差を変形で表す */
  function place() {
    const box = grid.getBoundingClientRect()
    const x = pointer.x - box.left - grab.x - figure.offsetLeft
    const y = pointer.y - box.top - grab.y - figure.offsetTop
    figure.style.transform = `translate(${x}px, ${y}px) scale(1.03)`
  }

  function lift() {
    active = true
    const r = figure.getBoundingClientRect()
    grab = {x: pointer.x - r.left, y: pointer.y - r.top}
    last = pointer
    figure.dataset.dragging = ''
    figure.style.zIndex = '1'
    figure.style.transformOrigin = `${grab.x}px ${grab.y}px`
    for (const animation of figure.getAnimations()) animation.cancel()
    setDragging(photo.file)
    place()
    frame = requestAnimationFrame(tick)
  }

  /** 指（マウス）の下にある、つかんでいない写真 */
  function under() {
    const box = grid.getBoundingClientRect()
    const x = pointer.x - box.left
    const y = pointer.y - box.top
    for (const el of grid.querySelectorAll<HTMLElement>('figure[data-file]')) {
      if (el === figure) continue
      if (
        x >= el.offsetLeft &&
        x < el.offsetLeft + el.offsetWidth &&
        y >= el.offsetTop &&
        y < el.offsetTop + el.offsetHeight
      )
        return el.dataset.file!
    }
    return null
  }

  function tick() {
    // 上下の端に近いほど速くスクロールする
    const top = (document.querySelector('nav')?.getBoundingClientRect().bottom ?? 0) + EDGE
    const bottom = (document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight) - EDGE
    const depth = pointer.y < top ? pointer.y - top : pointer.y > bottom ? pointer.y - bottom : 0
    if (depth) scrollBy(0, Math.max(-SPEED, Math.min(SPEED, depth / 4)))
    const over = Math.hypot(pointer.x - last.x, pointer.y - last.y) >= STEP ? under() : null
    if (over) {
      last = pointer
      movePhoto(photo.file, over)
      // 並べ替えの描き直しが済んでから位置を合わせる（済む前に合わせると、新しい位置へ 1 フレーム跳ぶ）
      queueMicrotask(() => queueMicrotask(place))
    }
    place()
    frame = requestAnimationFrame(tick)
  }

  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return
    pointer = {x: e.clientX, y: e.clientY}
    if (active) return
    if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < SLOP) return
    if (touch) end()
    else lift()
  }

  // 持ち上げたあとは、指の動きでスクロールさせない。長押しのメニューも出さない
  const block = (e: Event) => active && e.cancelable && e.preventDefault()
  const menu = (e: Event) => e.preventDefault()

  function end() {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', end)
    removeEventListener('pointercancel', end)
    removeEventListener('touchmove', block)
    removeEventListener('contextmenu', menu)
    if (!active) return
    // 今の位置から並べ替えた先の場所へ収める
    const from = figure.style.transform
    figure.style.transform = ''
    figure.style.zIndex = ''
    const settle = figure.animate([{transform: from}, {transform: 'none'}], {
      duration: 300,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    })
    settle.onfinish = settle.oncancel = () => {
      figure.style.transformOrigin = ''
      delete figure.dataset.dragging
    }
    setDragging(null)
  }

  addEventListener('pointermove', move)
  addEventListener('pointerup', end)
  addEventListener('pointercancel', end)
  addEventListener('touchmove', block, {passive: false})
  if (touch) addEventListener('contextmenu', menu)
}

import {useEffect} from 'react'
import Lenis from 'lenis'
import {useLocation} from 'wouter'

let current: Lenis | null = null

/** 要素の上辺へ寄せる。offset は上辺からのずらし px（負で手前に止める）、duration は秒、easing は 0〜1 → 0〜1 */
export function scrollToElement(
  el: HTMLElement,
  {offset, duration, easing}: {offset: number; duration: number; easing: (t: number) => number}
) {
  current?.scrollTo(el, {offset, duration, easing})
}

/** 即座にその位置へ。進行中の慣性スクロールは打ち切る。レイアウトの変化に合わせて視点を固定するために使う */
export function jumpTo(y: number) {
  // レイアウトが変わった直後に呼ぶので、Lenis が覚えている文書の高さを先に更新する（古いと目標が丸められる）
  current?.resize()
  current?.scrollTo(y, {immediate: true, force: true})
}

/**
 * 慣性スクロール。ホイールの入力を直接使わず、少し遅れて滑らかに追従させる（docs/design.md）。
 * ネイティブのスクロール位置を Lenis が rAF で動かすので、IntersectionObserver や
 * sticky はそのまま使える。ページ遷移時は先頭へ即座に戻す。
 */
export function useSmoothScroll() {
  const [location] = useLocation()

  useEffect(() => {
    const lenis = new Lenis({lerp: 0.1})
    current = lenis
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      current = null
    }
  }, [])

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant'})
  }, [location])
}

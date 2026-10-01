import {useEffect} from 'react'
import Lenis from 'lenis'
import {useLocation} from 'wouter'

/**
 * 慣性スクロール。ホイールの入力を直接使わず、少し遅れて滑らかに追従させる（docs/design.md）。
 * ネイティブのスクロール位置を Lenis が rAF で動かすので、IntersectionObserver や
 * sticky はそのまま使える。ページ遷移時は先頭へ即座に戻す。
 */
export function useSmoothScroll() {
  const [location] = useLocation()

  useEffect(() => {
    const lenis = new Lenis({lerp: 0.1})
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant'})
  }, [location])
}

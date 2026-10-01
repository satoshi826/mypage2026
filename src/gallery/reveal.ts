import {useEffect} from 'react'
import {REVEAL_VARIANTS, useChoice, type RevealVariant} from './options'

/**
 * 視界に入った要素を現す演出。要素に `data-reveal` を付けると、視界に入ったときに
 * `data-revealed` が付く。現れ方は <html data-reveal-variant> で切り替え、見た目は
 * styles.css の `[data-reveal]` が持つ。一度現れたら戻さない。
 */
export function useRevealVariant() {
  const choice = useChoice<RevealVariant>('reveal-variant', REVEAL_VARIANTS, 'wipe')
  const [variant] = choice
  useEffect(() => {
    document.documentElement.dataset.revealVariant = variant
  }, [variant])
  return choice
}

/**
 * root 配下の `[data-reveal]` を監視する。要素の 15% が見えたら現す。
 * 画面下端ぎりぎりで始まると現れきる前に通り過ぎるので、下側に少し余白を取る。
 * deps は一覧の中身が変わったときに監視し直すため。
 */
export function useReveal(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).dataset.revealed = ''
          observer.unobserve(entry.target)
        }
      },
      {threshold: 0.15, rootMargin: '0px 0px -8% 0px'}
    )
    for (const target of el.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')) {
      observer.observe(target)
    }
    return () => observer.disconnect()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

import {useEffect} from 'react'

/**
 * 視界に入った要素を現す演出。要素に `data-reveal` を付けると、視界に入ったときに
 * `data-revealed` が付く。見た目は styles.css の `[data-reveal]` が持つ（下から現像するワイプ）。
 * 一度現れたら戻さない。
 *
 * root 配下の `[data-reveal]` を監視する。要素の 15% が見えたら現す。
 * 画面下端ぎりぎりで始まると現れきる前に通り過ぎるので、下側に少し余白を取る。
 *
 * 中に画像があるときは、読み込みが終わるまで待ってから現す。空の枠に演出をかけて
 * あとから画像が突然出るのを避けるため。
 * deps は一覧の中身が変わったときに監視し直すため。
 */
export function useReveal(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reveal = (target: HTMLElement) => {
      target.dataset.revealed = ''
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const target = entry.target as HTMLElement
          observer.unobserve(target)
          const img = target.querySelector('img')
          if (img && !isLoaded(img)) {
            img.addEventListener('load', () => reveal(target), {once: true})
            img.addEventListener('error', () => reveal(target), {once: true})
          } else {
            reveal(target)
          }
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

/** src がまだ無い img も complete は true になるので、実際に画素があるかで見る */
const isLoaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0

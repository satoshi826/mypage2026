import type {RefObject} from 'preact'
import {useEffect} from 'preact/hooks'

/** 要素のこの割合が見えたら現す */
const THRESHOLD = 0.15
/** 画面下端（フッターの上）のこの割合は数えない。ぎりぎりで始まると現れきる前に通り過ぎるため */
const MARGIN = 0.08

/**
 * 視界に入った要素を現す演出。要素に `data-reveal` を付けると、視界に入ったときに
 * `data-revealed` が付く。見た目は styles.css の `[data-reveal-cover]` が持つ（下から現像するワイプ）。
 * 一度現れたら戻さない。
 *
 * 判定はスクロールのたびに、まだ現れていない要素の位置を読んで行う。上辺が画面の上に出た要素は
 * 見えている割合に関わらず現す。IntersectionObserver のしきい値に頼らないのは、画像のデコードで main thread が
 * 止まっている間にスクロールが大きく進むと、一度も「15% 見えた」状態を経ずに画面の上へ抜ける
 * 要素が出て、しきい値の通知では拾えないため。読むだけなので再レイアウトは起きない。
 *
 * 中に画像があるときは、読み込みが終わるまで待ってから現す。空の枠に演出をかけて
 * あとから画像が突然出るのを避けるため。待っている写真は候補に残したまま、スクロールと
 * 画像の読み込み完了のたびに見直す。1 回きりのリスナーだと、src の付け外しの順序次第で取りこぼす。
 * deps は描かれている要素が変わったときに見直すため。onReveal は現したときに呼ぶ。要素が外れて
 * 描き直されても現した状態を引き継げるよう、使う側が覚えておくため（Gallery）。
 */
export function useReveal(
  root: RefObject<HTMLElement | null>,
  deps: unknown[],
  onReveal: (target: HTMLElement) => void
) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const pending = new Set(el.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])'))
    const check = () => {
      const bottom = innerHeight * (1 - MARGIN) - (document.querySelector('footer')?.offsetHeight ?? 0)
      for (const target of pending) {
        // 配置の変化に合わせて即座に出したもの（Gallery の relayout）
        if (target.hasAttribute('data-revealed')) {
          pending.delete(target)
          continue
        }
        const rect = target.getBoundingClientRect()
        const visible = Math.min(rect.bottom, bottom) - Math.max(rect.top, 0)
        // 上辺が画面の上に出ているものは、通り過ぎた（通り過ぎつつある）ので出す
        if (rect.top >= 0 && visible < rect.height * THRESHOLD) continue
        // 画像が届くまでは残しておき、届いたとき（load）に見直す
        const img = target.querySelector('img')
        if (img && !isLoaded(img)) continue
        pending.delete(target)
        target.dataset.revealed = ''
        onReveal(target)
      }
    }
    check()
    const listeners = new AbortController()
    const {signal} = listeners
    addEventListener('scroll', check, {passive: true, signal})
    addEventListener('resize', check, {signal})
    // load はバブリングしないので capture で拾う。読み込みの完了を待っていた写真を見直す
    el.addEventListener('load', check, {capture: true, signal})
    return () => listeners.abort()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** src がまだ無い img も complete は true になるので、実際に画素があるかで見る */
const isLoaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0

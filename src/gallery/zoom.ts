import {useEffect, useRef} from 'react'
import type {Motion} from './tuning'

/**
 * スクロールが速いあいだ、写真を枠の中で少し拡大する。枠の大きさはそのままで中身だけが寄り、
 * 止まると戻る（docs/design.md の連続性）。拡大しているあいだは写真の縁が枠で切れる。
 *
 * - 拡大するのは img だけ。枠（figure）は動かさないので、段組・現れる判定・FLIP に影響しない。
 *   はみ出たぶんは枠の overflow: hidden で切る。
 * - 速さは毎フレームのスクロール位置の差（画面/秒）。ホイールの慣性も指のスクロールも同じ経路で拾う。
 *   向きつきで、上がるときと下がるときで別の時定数で均す。
 * - 拡大の基準は zoomBias で中心から進む向きの先端へ寄せられる。下へスクロールしているなら上端を基準に
 *   下へ広がるので、中身が慣性で遅れてついてくるように見える。向きが変わるのは速さが 0 を通るとき
 *   （拡大も 0 のとき）なので、基準が切り替わっても跳ばない。
 * - 1 フレームで 1 画面を超える移動は飛び（ページ遷移の先頭戻しなど）とみなして数えない。
 *   quiet の時刻までも数えない。広げる・戻すときのスクロールの補正と寄せるスクロールで拡大しないように。
 * - 書き込むのは画面の前後 1 画面にある写真だけ。枚数が増えても 1 フレームの仕事は増えない。
 *   その写真には will-change を付けて別のレイヤーにしておく。付けないと拡大率を書き換えるたびに
 *   描き直しが走り、スクロール中のフレーム落ちが増える。
 * deps は一覧の中身が変わったときに監視し直すため。
 */
export function useZoom(
  root: React.RefObject<HTMLElement | null>,
  motion: Motion,
  quiet: {current: number},
  deps: unknown[]
) {
  const params = useRef(motion)
  useEffect(() => {
    params.current = motion
  })

  useEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const near = new Set<HTMLImageElement>()
    let scale = 1
    /** 拡大の基準の縦位置 % */
    let origin = 50
    /** 向きつきの速さ。下へスクロールで正 */
    let speed = 0
    let lastY = scrollY
    let last = 0
    let frame = 0

    const apply = (img: HTMLImageElement) => {
      img.style.scale = scale === 1 ? '' : String(scale)
      img.style.transformOrigin = scale === 1 ? '' : `50% ${origin}%`
    }

    // 監視するのは枠。src を外した img は箱を持たないため（Img.tsx と同じ）
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const img = entry.target.querySelector('img')
          if (!img) continue
          if (entry.isIntersecting) {
            near.add(img)
            img.style.willChange = 'transform'
            apply(img)
          } else {
            near.delete(img)
            img.style.scale = img.style.transformOrigin = img.style.willChange = ''
          }
        }
      },
      {rootMargin: '100% 0px'}
    )
    for (const figure of el.querySelectorAll('figure[data-file]')) observer.observe(figure)

    const tick = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, 0.1) : 1 / 60
      last = time
      const dy = scrollY - lastY
      lastY = scrollY
      const raw = time < quiet.current || Math.abs(dy) > innerHeight ? 0 : dy / innerHeight / dt

      const {zoom, zoomSpeed, zoomRise, zoomFall, zoomBias} = params.current
      const tau = Math.abs(raw) > Math.abs(speed) ? zoomRise : zoomFall
      speed += (raw - speed) * (1 - Math.exp(-dt / tau))
      const x = Math.min(1, Math.abs(speed) / zoomSpeed)
      // smoothstep。遅いスクロールではほとんど拡大せず、速くなるにつれて立ち上がる
      const amount = zoom * x * x * (3 - 2 * x)
      // 見分けられないほど戻ったら止める
      const done = raw === 0 && amount < 1e-4
      const next = done ? 1 : 1 + amount
      const at = 50 - 50 * zoomBias * Math.sign(speed)
      if (next !== scale || at !== origin) {
        scale = next
        origin = at
        for (const img of near) apply(img)
      }
      if (done) {
        frame = 0
        last = 0
        return
      }
      frame = requestAnimationFrame(tick)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }
    addEventListener('scroll', onScroll, {passive: true})

    return () => {
      removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const img of near) img.style.scale = img.style.transformOrigin = img.style.willChange = ''
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

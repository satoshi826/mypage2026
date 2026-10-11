import {useEffect, useRef} from 'react'
import {glideTo, jumpTo} from './useSmoothScroll'

/** つまみの最短の長さ px。ページが長くても掴めるように */
const MIN = 32
/** 溝を押したときに寄せる時間（秒）と動き */
const GLIDE = {duration: 0.6, easing: (t: number) => 1 - (1 - t) ** 5}

/**
 * 自前のスクロールバー。マウスなどの細かいポインタの環境だけで出す（ブラウザのものは styles.css で消す）。
 * ナビとフッターのあいだを溝にして、ページ全体のスクロールを示す。ページが画面に収まるときは出さない。
 *
 * - つまみの長さは画面の高さ ÷ ページの高さ。写真を広げてページが伸びれば縮む。
 * - 普段は薄く、スクロール中・マウスを載せている間・掴んでいる間だけ濃くする。
 * - つまみを掴んで動かすと、その位置へ即座にスクロールする。溝を押すと、つまみの中央がそこへ来る
 *   位置へ寄せ、そのまま掴んで動かせる。
 *
 * スクロールのたびに描き直さないよう、位置と状態は DOM へ直接書く。
 */
export function Scrollbar() {
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = track.current
    const bar = thumb.current
    if (!el || !bar) return
    const root = document.documentElement

    // 溝の高さ、つまみの長さ、つまみが動ける距離、スクロールできる距離
    let length = 0
    let travel = 0
    let range = 0
    const update = () => {
      const height = el.clientHeight
      range = root.scrollHeight - innerHeight
      length = Math.max(MIN, (height * innerHeight) / root.scrollHeight)
      travel = height - length
      el.hidden = range <= 0
      bar.style.height = `${length}px`
      bar.style.transform = `translateY(${range > 0 ? (travel * scrollY) / range : 0}px)`
    }

    // スクロール中の印。スクロールの起きなかった最初のフレームで外す（慣性スクロールが止まった瞬間）。
    // scroll イベントはそのフレームの requestAnimationFrame より先に届くので、2 フレーム先で外す予約を
    // 次の scroll イベントが取り消す。時間で待つと、慣性で動いているフレームの合間に外れてしまう
    let frame = 0
    const onScroll = () => {
      update()
      el.dataset.active = ''
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => delete el.dataset.active)
      })
    }

    // 掴んでいる点が、つまみの上端から何 px 下か。掴んでいないあいだは null
    let grab: number | null = null
    const at = (event: PointerEvent) => ((event.clientY - el.getBoundingClientRect().top - grab!) / travel) * range
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || range <= 0) return
      event.preventDefault()
      el.setPointerCapture(event.pointerId)
      el.dataset.dragging = ''
      const top = bar.getBoundingClientRect().top
      if (event.target === bar) grab = event.clientY - top
      else {
        grab = length / 2
        glideTo(at(event), GLIDE)
      }
    }
    const move = (event: PointerEvent) => {
      if (grab !== null) jumpTo(at(event))
    }
    const up = () => {
      grab = null
      delete el.dataset.dragging
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(document.body)
    observer.observe(el)
    addEventListener('scroll', onScroll, {passive: true})
    addEventListener('resize', update)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', update)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [])

  // 掴める幅は見た目より広く取る。つまみは右端から少し離した細い線
  return (
    <div
      ref={track}
      aria-hidden
      className="group fixed top-(--spacing-nav) right-[env(safe-area-inset-right)] bottom-[calc(var(--spacing-footer)+env(safe-area-inset-bottom))] z-10 hidden w-3 pointer-fine:block"
    >
      <div
        ref={thumb}
        className="absolute top-0 right-1 w-0.5 rounded-full bg-ink opacity-20 transition-opacity duration-500 group-hover:opacity-60 group-data-active:opacity-60 group-data-dragging:opacity-60"
      />
    </div>
  )
}

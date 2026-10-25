import {useEffect, useRef} from 'preact/hooks'
import {onScrollFrame} from './scrollFrame'
import {glideTo, jumpTo} from './useSmoothScroll'

/** つまみの最短の長さ px。ページが長くても掴めるように */
const MIN = 32
/** 自前のスクロールバーを出す環境。styles.css の pointer-fine と同じ */
const FINE = '(hover: hover) and (pointer: fine)'
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
    // タッチの端末では出さないので、スクロールのたびの処理もしない。マウスをつなぐなどで変われば合わせる
    const fine = matchMedia(FINE)
    let stop: (() => void) | undefined
    const toggle = () => {
      stop?.()
      stop = fine.matches ? follow(el, bar) : undefined
    }
    toggle()
    fine.addEventListener('change', toggle)
    return () => {
      fine.removeEventListener('change', toggle)
      stop?.()
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
        className="glow-line absolute top-0 right-1 w-0.5 rounded-full bg-ink opacity-15 transition-[opacity,box-shadow] duration-500 group-hover:opacity-80 group-hover:[--glow:var(--glow-weak)] group-data-active:opacity-80 group-data-active:[--glow:1] group-data-dragging:opacity-80 group-data-dragging:[--glow:1]"
      />
    </div>
  )
}

/** つまみをページのスクロールに合わせ、掴んで動かせるようにする。止める関数を返す */
function follow(el: HTMLDivElement, bar: HTMLDivElement) {
  const root = document.documentElement

  // 溝の高さ、つまみの長さ、つまみが動ける距離、スクロールできる距離
  let length = 0
  let travel = 0
  let range = 0
  const place = (y: number) => {
    bar.style.transform = `translateY(${range > 0 ? (travel * y) / range : 0}px)`
  }
  // 大きさは、ページか画面の大きさが変わったときだけ測る。読み終えてから書く
  const update = () => {
    const y = scrollY
    const height = el.clientHeight
    range = root.scrollHeight - innerHeight
    length = Math.max(MIN, (height * innerHeight) / root.scrollHeight)
    travel = height - length
    el.hidden = range <= 0
    bar.style.height = `${length}px`
    place(y)
  }

  // スクロール中の印。スクロールの起きなかった最初のフレームで外す（慣性スクロールが止まった瞬間）。
  // 2 フレーム先で外す予約を、次のフレームのスクロールが取り消す。時間で待つと、慣性で動いている
  // フレームの合間に外れてしまう
  let frame = 0
  const stopScroll = onScrollFrame(() => {
    const y = scrollY
    return () => {
      place(y)
      if (!('active' in el.dataset)) el.dataset.active = ''
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => delete el.dataset.active)
      })
    }
  })

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
  const listeners = new AbortController()
  const {signal} = listeners
  addEventListener('resize', update, {signal})
  el.addEventListener('pointerdown', down, {signal})
  el.addEventListener('pointermove', move, {signal})
  el.addEventListener('pointerup', up, {signal})
  el.addEventListener('pointercancel', up, {signal})
  return () => {
    stopScroll()
    cancelAnimationFrame(frame)
    observer.disconnect()
    listeners.abort()
  }
}

import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks'
import {CATEGORIES, heroesOf, pickSource, type Category, type Photo} from '../photos'
import {useExternal} from '../app/useExternal'
import {current} from './draft'
import {setHeroOrder} from './ops'
import {isPanelOpen, setPanelOpen, subscribePanel} from './panel'

// トップの hero を選び、並べ替えるパネル。下から開く。上段が hero の並び（番号順。つかんで横に並べ替え、× で外す）、
// 下段が全写真（触ると hero に足す・外す）。開いているあいだはパネルの中の並びで作業し、閉じたときにまとめて
// 下書きへ入れる（hero はそこで 1 回だけ作り直す。src/app/pages/Top.tsx）

const LABEL: Record<Category, string> = {street: 'Street', abstract: 'Abstract', color: 'Color', works: 'Works'}
const HOLD = 350
const SLOP = 6
const STEP = 24
const EDGE = 48
const SPEED = 12
const THUMB = 96

const isThreeTwo = (photo: Photo) => Math.abs(photo.w / photo.h - 1.5) <= 0.01
const thumb = (photo: Photo) => pickSource(photo, THUMB * devicePixelRatio, false).src

export function HeroPanel() {
  const open = useExternal(subscribePanel, isPanelOpen, false)
  return open ? <Panel /> : null
}

function Panel() {
  // 開いたときの一覧。閉じるまでこのパネルの外では変わらない
  const [photos] = useState(() => current() ?? [])
  const byFile = new Map(photos.map((photo) => [photo.file, photo]))
  const [initial] = useState(() => heroesOf(photos).map((photo) => photo.file))
  const [order, setOrder] = useState(initial)
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const strip = useRef<HTMLDivElement>(null)
  // 並びが変わる直前の各写真の位置。変わった直後に、そこから今の位置へ動かす
  const rects = useRef<Map<string, number> | null>(null)

  const close = () => {
    if (order.join() !== initial.join()) setHeroOrder(order)
    setPanelOpen(false)
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close()
    addEventListener('keydown', escape)
    return () => removeEventListener('keydown', escape)
  })

  /** 並びを変える。変える前の位置を覚えておき、変わったあとで動かす */
  const change = (next: string[]) => {
    rects.current = new Map(
      [...(strip.current?.querySelectorAll<HTMLElement>('[data-hero]') ?? [])].map((el) => [
        el.dataset.hero!,
        el.getBoundingClientRect().left
      ])
    )
    setOrder(next)
  }
  useLayoutEffect(() => {
    const before = rects.current
    rects.current = null
    if (!before) return
    for (const el of strip.current?.querySelectorAll<HTMLElement>('[data-hero]') ?? []) {
      if (el.hasAttribute('data-dragging')) continue
      const from = before.get(el.dataset.hero!)
      if (from === undefined) continue
      const dx = from - el.getBoundingClientRect().left
      if (Math.abs(dx) > 0.5)
        el.animate([{transform: `translateX(${dx}px)`}, {transform: 'none'}], {
          duration: 400,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
        })
    }
  }, [order])

  const toggle = (photo: Photo) => {
    if (order.includes(photo.file)) return change(order.filter((file) => file !== photo.file))
    if (!isThreeTwo(photo) && !confirm('3:2 でない写真なので、hero では端が切れます。使いますか？')) return
    change([...order, photo.file])
  }

  /** 上段の写真をつかんで横に並べ替える。マウスは押して動かす、指は長押し（Photos の並べ替えと同じ手触り） */
  const grab = (event: PointerEvent, file: string) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return
    const item = event.currentTarget as HTMLElement
    const row = strip.current!
    const touch = event.pointerType !== 'mouse'
    const start = event.clientX
    let x = start
    let last = start
    let offset = 0
    let active = false
    let frame = 0
    let latest = order
    const timer = touch ? setTimeout(lift, HOLD) : 0

    function place() {
      const left = row.getBoundingClientRect().left - row.scrollLeft
      item.style.transform = `translateX(${x - left - offset - item.offsetLeft}px) scale(1.05)`
    }
    function lift() {
      active = true
      offset = x - item.getBoundingClientRect().left
      last = x
      item.dataset.dragging = ''
      item.style.zIndex = '1'
      place()
      frame = requestAnimationFrame(tick)
    }
    function tick() {
      const box = row.getBoundingClientRect()
      const depth = x < box.left + EDGE ? x - box.left - EDGE : x > box.right - EDGE ? x - box.right + EDGE : 0
      if (depth) row.scrollLeft += Math.max(-SPEED, Math.min(SPEED, depth / 3))
      if (Math.abs(x - last) >= STEP) {
        // 並んだ先の位置で判定する。場所を空けて動いている最中の写真の見えている位置で判定すると、
        // 動いている写真に当たって行ったり来たりする
        const at = x - row.getBoundingClientRect().left + row.scrollLeft
        const over = [...row.querySelectorAll<HTMLElement>('[data-hero]')].find(
          (el) => el !== item && at >= el.offsetLeft && at < el.offsetLeft + el.offsetWidth
        )
        if (over) {
          last = x
          const next = latest.filter((f) => f !== file)
          const to = latest.indexOf(over.dataset.hero!)
          next.splice(to, 0, file)
          latest = next
          change(next)
          queueMicrotask(() => queueMicrotask(place))
        }
      }
      place()
      frame = requestAnimationFrame(tick)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return
      x = e.clientX
      if (active || Math.abs(x - start) < SLOP) return
      if (touch) end()
      else lift()
    }
    const block = (e: Event) => active && e.cancelable && e.preventDefault()
    function end() {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      removeEventListener('touchmove', block)
      if (!active) return
      const from = item.style.transform
      item.style.transform = ''
      item.style.zIndex = ''
      const settle = item.animate([{transform: from}, {transform: 'none'}], {
        duration: 300,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      })
      settle.onfinish = settle.oncancel = () => delete item.dataset.dragging
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
    addEventListener('touchmove', block, {passive: false})
  }

  const shown = filter === 'all' ? photos : photos.filter((photo) => photo.category === filter)
  const tab = (active: boolean) =>
    `cursor-pointer border-0 bg-transparent p-0 text-xs text-inherit transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-55 hover:opacity-80'}`

  return (
    // ホイールはサイト全体のなめらかなスクロール（useSmoothScroll）に渡さない。渡すと後ろのページが動く
    <div
      onWheel={(event) => event.stopPropagation()}
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[75svh] flex-col border-t border-white/20 bg-black/85 pb-[env(safe-area-inset-bottom)] text-ink backdrop-blur-[20px]"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs">
        <span>
          hero <span className="opacity-55">{order.length} 枚</span>
        </span>
        <button type="button" onClick={close} className={tab(true)}>
          閉じる
        </button>
      </div>
      {/* hero の並び。小さな画像は hero と同じく中央を 3:2 で切り出して見せる */}
      {/* 縦のホイールは横のスクロールに変える（スクロールバーは出さない） */}
      <div
        ref={strip}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
          strip.current!.scrollLeft += event.deltaY
          event.preventDefault()
        }}
        className="relative flex shrink-0 gap-2 overflow-x-auto overscroll-contain px-5 pb-3 [scrollbar-width:none]"
      >
        {order.map((file, i) => {
          const photo = byFile.get(file)
          if (!photo) return null
          return (
            <div
              key={file}
              data-hero={file}
              onPointerDown={(event) => grab(event, file)}
              className="relative shrink-0 cursor-grab touch-pan-x select-none [-webkit-touch-callout:none]"
              style={{width: `${THUMB}px`}}
            >
              <img src={thumb(photo)} alt="" draggable={false} className="block aspect-3/2 w-full object-cover" />
              <span className="absolute top-1 left-1 bg-black/70 px-1 text-[10px]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                aria-label="hero から外す"
                onClick={() => change(order.filter((f) => f !== file))}
                className="absolute top-0.5 right-0.5 size-5 cursor-pointer border-0 bg-black/70 p-0 text-xs leading-none text-ink"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 border-t border-white/10 px-5 pt-3 pb-2">
        <button type="button" onClick={() => setFilter('all')} className={tab(filter === 'all')}>
          すべて
        </button>
        {CATEGORIES.map((category) => (
          <button key={category} type="button" onClick={() => setFilter(category)} className={tab(filter === category)}>
            {LABEL[category]}
          </button>
        ))}
      </div>
      {/* 全写真。触ると hero に足す（並びの末尾）・外す */}
      <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5 overflow-y-auto overscroll-contain px-5 pb-4">
        {shown.map((photo) => {
          const rank = order.indexOf(photo.file)
          return (
            <button
              key={photo.file}
              type="button"
              onClick={() => toggle(photo)}
              className={`relative cursor-pointer border p-0 ${rank >= 0 ? 'border-white/80' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              <img src={thumb(photo)} alt="" loading="lazy" className="block aspect-3/2 w-full object-cover" />
              {rank >= 0 && (
                <span className="absolute top-1 left-1 bg-black/70 px-1 text-[10px]">
                  {String(rank + 1).padStart(2, '0')}
                </span>
              )}
              {!isThreeTwo(photo) && (
                <span className="absolute right-1 bottom-1 bg-black/70 px-1 text-[10px]">3:2 でない</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

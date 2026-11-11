import {resizeObserver} from 'glaku'
import {useEffect, useLayoutEffect, useMemo, useRef} from 'preact/hooks'

type Message = Record<string, unknown>

/** worker ごとに 1 つ持ち続ける canvas と worker。worker を作る前に送られた指示はためておく */
type Held = {
  canvas: HTMLCanvasElement
  worker: Worker | null
  queue: [Message, Transferable[]][]
  /** 今付いている部品の、返信の受け手。外れているあいだは null */
  reply: ((reply: unknown) => void) | null
  post: (message: Message, transfer?: Transferable[]) => void
}
const held = new Map<new () => Worker, Held>()

const holdOf = (Worker: new () => Worker) => {
  let hold = held.get(Worker)
  if (hold) return hold
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%'
  const created: Held = {
    canvas,
    worker: null,
    queue: [],
    reply: null,
    post: (message, transfer = []) => {
      if (created.worker) created.worker.postMessage(message, transfer)
      else created.queue.push([message, transfer])
    }
  }
  held.set(Worker, created)
  return created
}

/**
 * canvas を作って OffscreenCanvas として worker に譲渡する。
 * 以降の描画は worker 側で完結し、Preact は描き直しに関与しない。
 *
 * canvas と worker は、部品が外れても捨てずに持ち続ける（worker ごとに 1 つ）。外れたら canvas を DOM から外すだけにし、
 * 付き直したら同じ canvas を付け直す。worker の中で作ったもの（hero の写真や光の層）を作り直さずに済む。
 * post は付き直しても同じ関数で、外れているあいだも worker へ届く。
 *
 * 譲渡は枠の寸法が決まってから行う。0×0 のまま譲渡して最初のフレームが送られると、
 * あとで寸法が付いても画面側の canvas に描画が反映されない（Chrome で確認）。
 * それまでに post されたものは溜めておき、worker ができた時点で順に流す。
 */
export function useCanvas<Reply>(Worker: new () => Worker, onReply?: (reply: Reply) => void) {
  const hold = holdOf(Worker)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // 返信の受け手は毎レンダー作り直されるので、付いているあいだは最新のものへ差し替える
  useLayoutEffect(() => {
    hold.reply = (onReply as ((reply: unknown) => void) | undefined) ?? null
  })

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const {canvas} = hold
    wrapper.append(canvas)

    let observer: ResizeObserver | null = null
    const start = (width: number, height: number) => {
      const offscreen = canvas.transferControlToOffscreen()
      offscreen.width = width
      offscreen.height = height

      const worker = new Worker()
      worker.onmessage = ({data}: MessageEvent<unknown>) => hold.reply?.(data)
      hold.worker = worker
      worker.postMessage({canvas: offscreen, pixelRatio: devicePixelRatio}, [offscreen])
      for (const [message, transfer] of hold.queue) worker.postMessage(message, transfer)
      hold.queue = []
    }

    // 2 回目からは worker ができているので、付け直すだけ。canvas は absolute なので、寸法はラッパーから取る
    if (!hold.worker) {
      const {width, height} = wrapper.getBoundingClientRect()
      if (width > 0 && height > 0) start(width, height)
      else {
        observer = new ResizeObserver(([entry]) => {
          const {width, height} = entry.contentRect
          if (width <= 0 || height <= 0) return
          observer?.disconnect()
          observer = null
          start(width, height)
        })
        observer.observe(wrapper)
      }
    }

    return () => {
      observer?.disconnect()
      hold.reply = null
      canvas.remove()
    }
  }, [hold, Worker])

  const canvas = useMemo(() => <div ref={wrapperRef} className="relative flex-1" />, [])
  return {canvas, post: hold.post, ref: wrapperRef}
}

export function useCanvasResize(post: (message: Message) => void, ref: {current: HTMLElement | null}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = resizeObserver(({width, height}) => post({resize: {width, height}}))
    observer.observe(el)
    return () => observer.unobserve(el)
  }, [post, ref])
}

// Worker には requestAnimationFrame がないので、描画のタイミングはメインスレッドから駆動する。
// タブが非表示になると rAF が止まり、無駄な描画も止まる。
export function useAnimationFrame(callback: () => void) {
  const latest = useRef(callback)
  useLayoutEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    let id = requestAnimationFrame(function tick() {
      latest.current()
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [])
}

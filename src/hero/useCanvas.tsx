import {resizeObserver} from 'glaku'
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef} from 'react'

type Message = Record<string, unknown>

/**
 * canvas を作って OffscreenCanvas として worker に譲渡する。
 * 以降の描画は worker 側で完結し、React は再レンダリングに関与しない。
 *
 * 譲渡は枠の寸法が決まってから行う。0×0 のまま譲渡して最初のフレームが送られると、
 * あとで寸法が付いても画面側の canvas に描画が反映されない（Chrome で確認）。
 * それまでに post されたものは溜めておき、worker ができた時点で順に流す。
 */
export function useCanvas<Reply>(Worker: new () => Worker, onReply?: (reply: Reply) => void) {
  const workerRef = useRef<Worker | null>(null)
  const queue = useRef<[Message, Transferable[]][]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  // 返信の受け手は毎レンダー作り直されるので、worker の作り直しを避けるため ref 越しに呼ぶ
  const latestReply = useRef(onReply)
  useLayoutEffect(() => {
    latestReply.current = onReply
  })

  const post = useCallback((message: Message, transfer: Transferable[] = []) => {
    const worker = workerRef.current
    if (worker) worker.postMessage(message, transfer)
    else queue.current.push([message, transfer])
  }, [])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%'
    wrapper.append(canvas)

    let observer: ResizeObserver | null = null
    const start = (width: number, height: number) => {
      const offscreen = canvas.transferControlToOffscreen()
      offscreen.width = width
      offscreen.height = height

      const worker = new Worker()
      worker.onmessage = ({data}: MessageEvent<Reply>) => latestReply.current?.(data)
      workerRef.current = worker
      worker.postMessage({canvas: offscreen, pixelRatio: devicePixelRatio}, [offscreen])
      for (const [message, transfer] of queue.current) worker.postMessage(message, transfer)
      queue.current = []
    }

    // canvas は absolute なので、寸法はラッパーから取る
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

    return () => {
      observer?.disconnect()
      workerRef.current?.terminate()
      workerRef.current = null
      queue.current = []
      canvas.remove()
    }
  }, [Worker])

  const canvas = useMemo(() => <div ref={wrapperRef} className="relative flex-1" />, [])
  return {canvas, post, ref: wrapperRef}
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

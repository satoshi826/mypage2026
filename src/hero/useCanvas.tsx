import {resizeObserver} from 'glaku'
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef} from 'react'

type Message = Record<string, unknown>

/**
 * canvas を作って OffscreenCanvas として worker に譲渡する。
 * 以降の描画は worker 側で完結し、React は再レンダリングに関与しない。
 */
export function useCanvas(Worker: new () => Worker) {
  const workerRef = useRef<Worker | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const post = useCallback(
    (message: Message, transfer: Transferable[] = []) => workerRef.current?.postMessage(message, transfer),
    []
  )

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%'
    wrapper.append(canvas)

    const offscreen = canvas.transferControlToOffscreen()
    // canvas は absolute なので、寸法はラッパーから取る
    const {width, height} = wrapper.getBoundingClientRect()
    offscreen.width = width
    offscreen.height = height

    const worker = new Worker()
    workerRef.current = worker
    worker.postMessage({canvas: offscreen, pixelRatio: devicePixelRatio}, [offscreen])

    return () => {
      worker.terminate()
      workerRef.current = null
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

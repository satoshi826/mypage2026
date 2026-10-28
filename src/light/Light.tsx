import {useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {useAnimationFrame, useCanvas, useCanvasResize} from '../hero/useCanvas'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'
import Worker from './worker?worker'

/**
 * トップの hero の下に置く、光が mu のロゴを照らす段（試し）。描くのは worker（worker.ts）で、ここは大きさと
 * 調整値を渡し、画面に見えているあいだだけ毎フレーム描かせる
 */
export function Light() {
  const {canvas, post, ref} = useCanvas(Worker)
  useCanvasResize(post, ref)
  const [tuning, setTuning] = useState(DEFAULT_LIGHT)

  // スマホは光線を半分にする
  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    post({tuning: {...tuning, rays: coarse ? Math.max(256, tuning.rays / 2) : tuning.rays}})
  }, [post, tuning])

  const visible = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => (visible.current = entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  useAnimationFrame(() => {
    if (visible.current) post({frame: true})
  })

  return (
    <section className="relative flex h-[100svh]" aria-hidden>
      {canvas}
      {import.meta.env.DEV && (
        <DevPanel<LightTuning>
          title="光とロゴ"
          typeName="LightTuning"
          constName="DEFAULT_LIGHT"
          params={LIGHT_PARAMS}
          defaults={DEFAULT_LIGHT}
          storageKey="mypage2026.light"
          onChange={setTuning}
        />
      )}
    </section>
  )
}

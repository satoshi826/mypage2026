import {useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {lightOf, travelOf, type Stage} from '../app/stage'
import {useAnimationFrame, useCanvas, useCanvasResize} from '../hero/useCanvas'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'
import Worker from './worker?worker'

/**
 * トップの舞台で、光が mu のロゴを照らす層（試し）。hero の後ろに画面いっぱいに重ねる。描くのは worker（worker.ts）で、
 * ここは大きさと調整値と、舞台の進み具合から決まる光の状態を渡す。光がついているあいだだけ毎フレーム描かせる
 */
export function Light({stage}: {stage: {readonly current: Stage}}) {
  const {canvas, post, ref} = useCanvas(Worker)
  useCanvasResize(post, ref)
  const [tuning, setTuning] = useState(DEFAULT_LIGHT)

  // スマホは光線を半分にする
  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    post({tuning: {...tuning, rays: coarse ? Math.max(256, tuning.rays / 2) : tuning.rays}})
  }, [post, tuning])

  // 消えたフレームも 1 回は送り、画面から光を消させる
  const lit = useRef(false)
  useAnimationFrame(() => {
    const {progress, source} = stage.current
    const intensity = lightOf(progress)
    if (intensity <= 0 && !lit.current) return
    lit.current = intensity > 0
    post({frame: {source, travel: travelOf(progress), intensity}})
  })

  return (
    <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
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
    </div>
  )
}

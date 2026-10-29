import {useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {brightnessOf, type Stage} from '../app/stage'
import {useAnimationFrame, useCanvas, useCanvasResize} from '../hero/useCanvas'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'
import Worker from './worker?worker'

/** 光がついてから、下りた先へ着くまでの秒数 */
const SETTLE_SECONDS = 0.9

/** 光が下りる一番下。画面の高さに対する割合。ページの中の位置がまだこれより下なら、ここで待つ */
const LOWEST = 0.8

/**
 * トップの舞台で、光が mu のロゴを照らす層（試し）。hero の後ろに画面いっぱいに重ねる。描くのは worker（worker.ts）。
 *
 * ロゴの位置はページの中の要素（logo）から取る。ロゴと光はその要素と一緒に、ページの中身としてスクロールで上がってくる。
 * 光は粒子が集まった点（stage の source）でつき、時間をかけてロゴの上の自分の位置へ下りる。その位置がまだ画面の下の方より
 * 下にあるうちは画面の下の方（LOWEST）で待ち、上がってきた位置に合流してからはロゴと一緒に動く
 *
 * @param logo ロゴを置く場所の要素。大きさは問わず、中心にロゴを描く
 */
export function Light({stage, logo}: {stage: {readonly current: Stage}; logo: {readonly current: HTMLElement | null}}) {
  const {canvas, post, ref} = useCanvas(Worker)
  useCanvasResize(post, ref)
  const [tuning, setTuning] = useState(DEFAULT_LIGHT)

  // スマホは光線を半分にする
  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    post({tuning: {...tuning, rays: coarse ? Math.max(256, tuning.rays / 2) : tuning.rays}})
  }, [post, tuning])

  // 光がついた時刻。消えているあいだは null。消えたフレームも 1 回は送り、画面から光を消させる
  const litAt = useRef<number | null>(null)
  useAnimationFrame(() => {
    const brightness = brightnessOf(stage.current)
    const box = logo.current?.getBoundingClientRect()
    if (brightness <= 0 || !box) {
      if (litAt.current !== null) post({frame: {light: {x: 0, y: 0}, logo: {x: 0, y: 0}, brightness: 0}})
      litAt.current = null
      return
    }
    const now = performance.now()
    litAt.current ??= now
    const center = {x: box.left + box.width / 2, y: box.top + box.height / 2}
    const home = {x: center.x, y: Math.min(center.y - tuning.lightHeight, (ref.current?.clientHeight ?? 0) * LOWEST)}
    const {source} = stage.current
    const t = Math.min(1, (now - litAt.current) / 1000 / SETTLE_SECONDS)
    const settle = 1 - (1 - t) ** 3
    const light = {x: source.x + (home.x - source.x) * settle, y: source.y + (home.y - source.y) * settle}
    post({frame: {light, logo: center, brightness}})
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

import {useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {lightAt, lightOf, type Stage} from '../app/stage'
import {useAnimationFrame, useCanvas, useCanvasResize} from '../hero/useCanvas'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'
import Worker from './worker?worker'

/** 光が集まった点でついてから、光の位置へ着くまでの秒数（集まった点が光の位置と違うときだけ動く） */
const SETTLE_SECONDS = 0.9

/**
 * トップの舞台で、光が mu のロゴを照らす層（試し）。hero の後ろに画面いっぱいに重ねる。描くのは worker（worker.ts）。
 *
 * 光は画面に固定した位置（lightAt）にあり、粒子が集まった点（stage の source）でつく。部屋の床の上には上向きの棒の光があり、
 * 部屋が画面の下端に近づくと光り始める。ロゴを置く部屋はページの中の要素
 * （room）で、その要素と一緒に、ページの中身としてスクロールで上がってきて光の下に入る
 *
 * @param room ロゴを置く部屋の要素。左・右・下の辺が光を返す壁になり、中央にロゴを描く
 */
export function Light({stage, room}: {stage: {readonly current: Stage}; room: {readonly current: HTMLElement | null}}) {
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
    const brightness = lightOf(stage.current)
    const box = room.current?.getBoundingClientRect()
    if (brightness <= 0 || !box) {
      if (litAt.current !== null)
        post({frame: {light: {x: 0, y: 0}, room: box ?? new DOMRect(), brightness: 0, bar: 0}})
      litAt.current = null
      return
    }
    const now = performance.now()
    litAt.current ??= now
    const home = lightAt({width: ref.current?.clientWidth ?? 0, height: ref.current?.clientHeight ?? 0})
    const {source} = stage.current
    const t = Math.min(1, (now - litAt.current) / 1000 / SETTLE_SECONDS)
    const settle = 1 - (1 - t) ** 3
    const light = {x: source.x + (home.x - source.x) * settle, y: source.y + (home.y - source.y) * settle}
    // 棒の光は、部屋の床が画面の下端の半画面下まで来たところから光り始め、下端に着くと最大になる
    const height = ref.current?.clientHeight ?? 0
    const near = Math.min(1, Math.max(0, 1 - (box.bottom - height) / (height / 2)))
    const bar = near * near * (3 - 2 * near)
    post({frame: {light, room: {left: box.left, top: box.top, right: box.right, bottom: box.bottom}, brightness, bar}})
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

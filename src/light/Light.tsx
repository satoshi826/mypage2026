import {useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {SCENE_SCREENS, lightAt, lightOf, type Stage} from '../app/stage'
import {useAnimationFrame, useCanvas, useCanvasResize} from '../hero/useCanvas'
import {LOGO_HEIGHT} from './logo'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'
import Worker from './worker?worker'

/** 光が集まった点でついてから、光の位置へ着くまでの秒数（集まった点が光の位置と違うときだけ動く） */
const SETTLE_SECONDS = 0.9

/** ついた直後の光の明るさ。最大に対する割合。スクロールでロゴが近づくと最大になる */
const DIM = 0.5

/** 光が最大の明るさになるまでのスクロールの長さ。ロゴの上端が画面の下端に届く手前の、画面の高さ単位 */
const BRIGHTEN_SCREENS = 0.8

/** 光がついてから、下向きに絞り始めるまでのスクロールの長さ。画面の高さ単位。それまでは全周に均一な丸い光 */
const FOCUS_AFTER_SCREENS = 0.5

/**
 * トップの舞台で、光が mu のロゴを照らす層（試し）。hero の後ろに画面いっぱいに重ねる。描くのは worker（worker.ts）。
 *
 * 光は画面の上の位置（lightAt）にあり、粒子が集まった点（stage の source）でつく。そこからページの一番下までスクロールする
 * あいだに、少しずつ下がる（lightDrop）。少しスクロールしてからは、全周に広がる光から下向きの光に絞られていく（cone）。ついた直後は暗く、スクロールでロゴが
 * 近づくにつれて明るくなり、ロゴが画面に入る前に最大になる。部屋の床の上には上向きの棒の光があり、
 * 部屋が画面の下端に近づくと光り始める。ロゴを置く部屋はページの中の要素
 * （room）で、その要素と一緒に、ページの中身としてスクロールで上がってきて光の下に入る
 *
 * @param room ロゴを置く部屋の要素。中央（から logoShift ずらした位置）にロゴを描き、その真下の床の上に下の光を置く
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
    const arrived = lightOf(stage.current)
    const box = room.current?.getBoundingClientRect()
    if (arrived <= 0 || !box) {
      if (litAt.current !== null)
        post({frame: {light: {x: 0, y: 0}, room: box ?? new DOMRect(), brightness: 0, bar: 0, focus: 0}})
      litAt.current = null
      return
    }
    const now = performance.now()
    litAt.current ??= now
    const height = ref.current?.clientHeight ?? 0
    const {source, progress, rise} = stage.current
    const top = lightAt({width: ref.current?.clientWidth ?? 0, height})
    // 光がついてからページの一番下までスクロールした割合。光はこれに合わせて下がる。下向きに絞るのは少しあとから
    const scrolled = ease((progress - rise) / (SCENE_SCREENS - rise))
    const focus = ease((progress - rise - FOCUS_AFTER_SCREENS) / (SCENE_SCREENS - rise - FOCUS_AFTER_SCREENS))
    const home = {x: top.x, y: top.y + ((height * tuning.lightDrop) / 100) * scrolled}
    const t = Math.min(1, (now - litAt.current) / 1000 / SETTLE_SECONDS)
    const settle = 1 - (1 - t) ** 3
    const light = {x: source.x + (home.x - source.x) * settle, y: source.y + (home.y - source.y) * settle}
    // 光は、ロゴの上端（部屋の中央からロゴの高さの半分上）が画面の下端に届くところで最大になる
    const logoTop = (box.top + box.bottom) / 2 - (LOGO_HEIGHT * tuning.cell) / 4
    const brightness = arrived * (DIM + (1 - DIM) * ease(1 - (logoTop - height) / (height * BRIGHTEN_SCREENS)))
    // 棒の光は、部屋の床が画面の下端の半画面下まで来たところから光り始め、下端に着くと最大になる
    const bar = ease(1 - (box.bottom - height) / (height / 2))
    post({
      frame: {
        light,
        room: {left: box.left, top: box.top, right: box.right, bottom: box.bottom},
        brightness,
        bar,
        focus
      }
    })
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

/** 0〜1 に収めて、両端をなめらかにする */
function ease(v: number) {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}

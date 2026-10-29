import {useCallback, useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {SCENE_SCREENS, lightAt, lightOf, type Stage} from '../app/stage'
import {useAnimationFrame} from '../hero/useCanvas'
import type {SceneCommand} from '../scene/worker'
import type {LightCommand} from './scene'
import {setArrange} from './arrange'
import {LOGO_HEIGHT, LOGO_WIDTH} from './logo'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'

/** 光が集まった点でついてから、光の位置へ着くまでの秒数（集まった点が光の位置と違うときだけ動く） */
const SETTLE_SECONDS = 0.9

/** 動かしたロゴを、フッターの操作でもとの位置へ戻すのにかける秒数 */
const RESET_SECONDS = 0.8

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
 * 近づくにつれて明るくなり、ロゴが画面に入る前に最大になる。部屋の床の上には上向きの下の光があり、
 * 部屋が画面の下端に近づくと光り始める。ロゴを置く部屋はページの中の要素
 * （room）で、その要素と一緒に、ページの中身としてスクロールで上がってきて光の下に入る
 *
 * ロゴはドラッグで動かせる（マウスでも指でも）。ロゴの上に見えないつかみ場所を重ねて受ける。照明はロゴのもとの位置に
 * 合わせて固定したまま動かないので、光の外へ動かすと暗くなる。離した位置にとどまり、部屋の外へは出ない。
 * 動かしたあとは、フッターの操作（LogoReset.tsx）でもとの位置へ戻せる。
 *
 * @param room ロゴを置く部屋の要素。中央（から logoShift ずらした位置）がロゴのもとの位置で、その下の床の上に下の光を置く
 * @param screen 舞台の canvas の入れ物。光の位置と明るさは、この大きさから決める
 * @param post 舞台の canvas（src/scene/worker.ts）へ指示を送る
 */
export function Light({
  stage,
  room,
  screen,
  post
}: {
  stage: {readonly current: Stage}
  room: {readonly current: HTMLElement | null}
  screen: {readonly current: HTMLElement | null}
  post: (command: SceneCommand) => void
}) {
  const send = useCallback((command: LightCommand) => post({light: command}), [post])
  const [tuning, setTuning] = useState(DEFAULT_LIGHT)

  // スマホは光線を半分にする
  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    send({tuning: {...tuning, rays: coarse ? Math.max(256, tuning.rays / 2) : tuning.rays}})
  }, [send, tuning])

  // ロゴをもとの位置から動かした量 px と、ドラッグ中なら押した位置と押したときの量
  const offset = useRef({x: 0, y: 0})
  const drag = useRef<{id: number; x: number; y: number; from: {x: number; y: number}} | null>(null)
  const handle = useRef<HTMLDivElement>(null)
  // もとの位置へ戻している途中なら、戻し始めた時刻と、そのときの量
  const returning = useRef<{at: number; from: {x: number; y: number}} | null>(null)
  // フッターに出している「動いている」かどうか。変わったときだけ出し直す
  const moved = useRef(false)
  const reset = useCallback(() => {
    returning.current = {at: performance.now(), from: {...offset.current}}
  }, [])
  useEffect(() => {
    setArrange({moved: false, reset})
    return () => setArrange(null)
  }, [reset])
  const onPointerDown = (event: PointerEvent) => {
    returning.current = null
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, from: {...offset.current}}
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    offset.current = {x: d.from.x + event.clientX - d.x, y: d.from.y + event.clientY - d.y}
  }
  const onPointerUp = (event: PointerEvent) => {
    if (drag.current?.id === event.pointerId) drag.current = null
  }

  // 光がついた時刻。消えているあいだは null。消えたフレームも 1 回は送り、画面から光を消させる
  const litAt = useRef<number | null>(null)
  useAnimationFrame(() => {
    const arrived = lightOf(stage.current)
    const box = room.current?.getBoundingClientRect()
    const grip = handle.current
    // フッターの戻す操作は、ロゴが動いていて、光がつききっている（hero の再生操作が隠れている）あいだだけ出す
    const nowMoved = arrived >= 1 && (offset.current.x !== 0 || offset.current.y !== 0)
    if (nowMoved !== moved.current) {
      moved.current = nowMoved
      setArrange({moved: nowMoved, reset})
    }
    // 粒子が光へ向けて飛び始めたら、光の層を描き始める（飛ぶ粒子も光の層に描くため）。光が明るくなるのは粒子が着いてから
    if (stage.current.gather <= 0 || !box) {
      if (litAt.current !== null)
        send({
          frame: {
            on: false,
            light: {x: 0, y: 0},
            logo: {x: 0, y: 0},
            home: {x: 0, y: 0},
            floor: 0,
            brightness: 0,
            under: 0,
            focus: 0
          }
        })
      litAt.current = null
      grip?.style.setProperty('display', 'none')
      return
    }
    const now = performance.now()
    litAt.current ??= now
    const height = screen.current?.clientHeight ?? 0
    const {source, progress, rise} = stage.current
    const top = lightAt({width: screen.current?.clientWidth ?? 0, height})
    // 光がついてからページの一番下までスクロールした割合。光はこれに合わせて下がる。下向きに絞るのは少しあとから
    const scrolled = ease((progress - rise) / (SCENE_SCREENS - rise))
    const focus = ease((progress - rise - FOCUS_AFTER_SCREENS) / (SCENE_SCREENS - rise - FOCUS_AFTER_SCREENS))
    const lightHome = {x: top.x, y: top.y + ((height * tuning.lightDrop) / 100) * scrolled}
    const t = Math.min(1, (now - litAt.current) / 1000 / SETTLE_SECONDS)
    const settle = 1 - (1 - t) ** 3
    const light = {
      x: source.x + (lightHome.x - source.x) * settle,
      y: source.y + (lightHome.y - source.y) * settle
    }
    // もとの位置へ戻している途中なら、減速しながら量を 0 へ寄せる
    const back = returning.current
    if (back) {
      const r = Math.min(1, (now - back.at) / 1000 / RESET_SECONDS)
      const left = (1 - r) ** 3
      offset.current = r < 1 ? {x: back.from.x * left, y: back.from.y * left} : {x: 0, y: 0}
      if (r >= 1) returning.current = null
    }
    // ロゴのもとの位置は部屋の中央から logoShift ずらしたところ。動かした量は、ロゴが部屋からはみ出さない範囲に収める
    const home = {x: (box.left + box.right) / 2 + tuning.logoShift, y: (box.top + box.bottom) / 2}
    const logoWidth = (LOGO_WIDTH * tuning.cell) / 2
    const logoHeight = (LOGO_HEIGHT * tuning.cell) / 2
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
    offset.current = {
      x: clamp(offset.current.x, box.left + logoWidth / 2 - home.x, box.right - logoWidth / 2 - home.x),
      y: clamp(offset.current.y, box.top + logoHeight / 2 - home.y, box.bottom - logoHeight / 2 - home.y)
    }
    const logo = {x: home.x + offset.current.x, y: home.y + offset.current.y}
    if (grip) {
      grip.style.setProperty('display', 'block')
      grip.style.setProperty('width', `${logoWidth}px`)
      grip.style.setProperty('height', `${logoHeight}px`)
      grip.style.setProperty('transform', `translate(${logo.x - logoWidth / 2}px, ${logo.y - logoHeight / 2}px)`)
    }
    // 光は、ロゴの上端（部屋の中央からロゴの高さの半分上）が画面の下端に届くところで最大になる
    const logoTop = (box.top + box.bottom) / 2 - (LOGO_HEIGHT * tuning.cell) / 4
    const brightness = arrived * (DIM + (1 - DIM) * ease(1 - (logoTop - height) / (height * BRIGHTEN_SCREENS)))
    // 下の光は、部屋の床が画面の下端の半画面下まで来たところから光り始め、下端に着くと最大になる
    const under = ease(1 - (box.bottom - height) / (height / 2))
    send({frame: {on: true, light, logo, home, floor: box.bottom, brightness, under, focus}})
  })

  return (
    // ロゴのつかみ場所を置く層。舞台の canvas と同じ範囲に重ねる
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[100lvh]" aria-hidden>
      {/* ロゴのつかみ場所。位置と大きさは毎フレーム書く。光が消えているあいだは出さない */}
      <div
        ref={handle}
        data-grab
        className="pointer-events-auto absolute top-0 left-0 hidden cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
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

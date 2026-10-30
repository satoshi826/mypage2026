import {useCallback, useEffect, useRef, useState} from 'preact/hooks'
import {DevPanel} from '../app/DevPanel'
import {GATHER_AT, SCENE_SCREENS, ease, lightAt, lightOf, type Stage} from '../app/stage'
import {useAnimationFrame} from '../scene/useCanvas'
import type {SceneCommand} from '../scene/worker'
import type {LightCommand} from './scene'
import {
  DEFAULT_ARRANGEMENT,
  MAX_SCALE,
  MAX_TILT,
  MIN_SCALE,
  angleOf,
  isDefault,
  shrink,
  tiltOf,
  wrapAngle,
  type Arrangement,
  type LampKey,
  type LampSetting
} from './arrangement'
import {setLogoControls, type LampControl, type Material} from './controls'
import {LOGO_HEIGHT, LOGO_WIDTH} from './logo'
import {DEFAULT_LIGHT, LIGHT_PARAMS, type LightTuning} from './tuning'

/** 動かしたロゴと回した光を、フッターの操作で既定へ戻すのにかける秒数 */
const RESET_SECONDS = 0.8

/** ロゴの素材を切り替えるのにかける秒数 */
const MATERIAL_SECONDS = 0.8

/** 光の向きが、設定やロゴの位置の変化に追いつくまでの目安の秒数（指数的に寄せる時定数） */
const TURN_SECONDS = 0.2

/** ついた直後の光の明るさ。最大に対する割合。スクロールでロゴが近づくと最大になる */
const DIM = 0.5

/** 光が最大の明るさになるまでのスクロールの長さ。ロゴの上端が画面の下端に届く手前の、画面の高さ単位 */
const BRIGHTEN_SCREENS = 0.8

/** 光がついてから、下向きに絞り始めるまでのスクロールの長さ。画面の高さ単位。それまでは全周に均一な丸い光 */
const FOCUS_AFTER_SCREENS = 0.5

/**
 * トップの舞台で、光が mu のロゴを照らす層。舞台の canvas の、hero の粒子の後ろに描く。ここは毎フレーム光とロゴの位置と
 * 明るさを決めて送るだけで、描くのは舞台の worker（src/scene/worker.ts が light/scene.ts で描く）。
 *
 * 粒子は画面の中央に集まって光になり、光はスクロールに合わせてゆっくり上がって、画面の上で止まる（lightAt）。
 * 少しスクロールしてからは、全周に広がる光から下向きの光に絞られていく（cone）。ついた直後は暗く、スクロールでロゴが
 * 近づくにつれて明るくなり、ロゴが画面に入る前に最大になる。部屋の床の上には上向きの下の光があり、
 * 部屋が画面の下端に近づくと光り始める。ロゴを置く部屋はページの中の要素
 * （room）で、その要素と一緒に、ページの中身としてスクロールで上がってきて光の下に入る
 *
 * 訪問者はロゴと光を変えられる（arrangement.ts）。
 * - ロゴはドラッグで動かせ（マウスでも指でも。ロゴの上に見えないつかみ場所を重ねて受ける）、ピンチで大きさを変えられる
 *   （指は 2 本で、トラックパッドはそのままピンチ。ブラウザには ctrl を押したホイールとして届く）。離した位置と大きさに
 *   とどまり、部屋の外へは出ない。大きさと素材（白い面・和紙・つや）は、フッターのロゴの設定でも変えられる
 * - 光はフッターのライトの設定で、向きと明るさを変えられる。光源の位置は変わらない。向きはふだんロゴの今の位置を向き
 *   （Auto）、ロゴを動かすとついてくる。向きは設定が変わっても跳ばさず、滑らかに追う
 * 変えたあとは、フッターの操作（LogoControls.tsx）で既定へ戻せる。
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

  // 訪問者が変えたロゴと光の置き方
  const arrangement = useRef(DEFAULT_ARRANGEMENT)
  // 既定へ戻している途中なら、戻し始めた時刻と、そのときの置き方
  const returning = useRef<{at: number; from: Arrangement} | null>(null)
  // フッターに出している状態。変わったときだけ出し直す
  const shown = useRef<Shown>({lit: false, changed: false, scale: 1, lamps: {upper: STILL, under: STILL}})
  const reset = useCallback(() => {
    returning.current = {at: performance.now(), from: arrangement.current}
  }, [])
  const setScale = useCallback((scale: number) => {
    returning.current = null
    arrangement.current = {...arrangement.current, scale}
  }, [])
  const setLamp = useCallback((key: LampKey, {tilt, power}: LampSetting) => {
    returning.current = null
    arrangement.current = {...arrangement.current, lamps: {...arrangement.current.lamps, [key]: {tilt, power}}}
  }, [])
  // ロゴの素材。切り替えたら、切り替えた時刻から素材の割合を滑らかに移す
  const [material, setMaterialState] = useState<Material>('matte')
  const mix = useRef({paper: 0, gloss: 0})
  const switched = useRef({at: 0, from: mix.current})
  const setMaterial = useCallback((next: Material) => {
    switched.current = {at: performance.now(), from: {...mix.current}}
    setMaterialState(next)
  }, [])
  const publish = (next: Shown) => {
    shown.current = next
    setLogoControls({...next, reset, material, setMaterial, setScale, setLamp})
  }
  useEffect(() => {
    setLogoControls({...shown.current, reset, material, setMaterial, setScale, setLamp})
  }, [reset, material, setMaterial, setScale, setLamp])
  useEffect(() => () => setLogoControls(null), [])

  // ロゴのつかみ場所。位置は毎フレーム書く
  const grip = useRef<HTMLDivElement>(null)
  // 今照らしている向き（画面の上の角度）と、それを書いた時刻。光が消えているあいだは null
  const facing = useRef<Record<LampKey, number> | null>(null)
  const lastFrame = useRef(0)

  // ロゴをつかんでいる指（マウスは 1 つ）。指が増えたり減ったりしたら、そのときの置き方と指の位置から測り直す。
  // 1 本ならその動きだけロゴを動かし、2 本なら指のあいだの距離の比で大きさを変え、2 本の中点の動きだけ動かす
  const touching = useRef(new Map<number, {x: number; y: number}>())
  const gesture = useRef<{from: Arrangement; points: {x: number; y: number}[]} | null>(null)
  const regrip = () => {
    const points = [...touching.current.values()].slice(0, 2)
    gesture.current = points.length > 0 ? {from: arrangement.current, points} : null
  }
  const onLogoDown = (event: PointerEvent) => {
    returning.current = null
    touching.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
    regrip()
  }
  const onLogoMove = (event: PointerEvent) => {
    if (!touching.current.has(event.pointerId)) return
    touching.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
    const g = gesture.current
    if (!g) return
    const now = [...touching.current.values()].slice(0, g.points.length)
    const center = (points: {x: number; y: number}[]) => ({
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length
    })
    const from = center(g.points)
    const to = center(now)
    const spread = (points: {x: number; y: number}[]) =>
      points.length > 1 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0
    const ratio = g.points.length > 1 && spread(g.points) > 0 ? spread(now) / spread(g.points) : 1
    arrangement.current = {
      ...arrangement.current,
      offset: {x: g.from.offset.x + to.x - from.x, y: g.from.offset.y + to.y - from.y},
      scale: g.from.scale * ratio
    }
  }
  const onLogoUp = (event: PointerEvent) => {
    if (!touching.current.delete(event.pointerId)) return
    regrip()
  }
  // トラックパッドのピンチ（ctrl を押したホイールとして届く）で大きさを変える。ふつうのホイールはページのスクロールに渡す
  const onLogoWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    returning.current = null
    arrangement.current = {...arrangement.current, scale: arrangement.current.scale * Math.exp(-event.deltaY * 0.01)}
  }

  // 光の層を描いているか。消えたフレームも 1 回は送り、画面から光を消させる
  const lit = useRef(false)
  useAnimationFrame(() => {
    const arrived = lightOf(stage.current)
    const box = room.current?.getBoundingClientRect()
    // フッターのロゴとライトの操作は、光がつききっている（hero の再生操作が隠れている）あいだだけ出す。戻す操作は置き方を
    // 変えたときだけ
    const nowLit = arrived >= 1
    // 粒子が光へ向けて飛び始めたら、光の層を描き始める（飛ぶ粒子も光の層に描くため）。光が明るくなるのは粒子が着いてから
    if (stage.current.gather <= 0 || !box) {
      if (lit.current) send({frame: null})
      lit.current = false
      facing.current = null
      grip.current?.style.setProperty('display', 'none')
      if (shown.current.lit) publish({...shown.current, lit: false})
      return
    }
    lit.current = true
    const now = performance.now()
    const height = screen.current?.clientHeight ?? 0
    const {progress} = stage.current
    // 下向きに絞るのは、光がついてから少しスクロールしたあと
    const focus = ease((progress - GATHER_AT - FOCUS_AFTER_SCREENS) / (SCENE_SCREENS - GATHER_AT - FOCUS_AFTER_SCREENS))
    // 既定へ戻している途中なら、減速しながらずれを 0 へ寄せる
    const back = returning.current
    if (back) {
      const r = Math.min(1, (now - back.at) / 1000 / RESET_SECONDS)
      arrangement.current = r < 1 ? shrink(back.from, (1 - r) ** 3) : DEFAULT_ARRANGEMENT
      if (r >= 1) returning.current = null
    }
    // ロゴのもとの位置は部屋の中央から logoShift ずらしたところ。大きさと動かした量は、ロゴが部屋からはみ出さない範囲に収める
    const home = {x: (box.left + box.right) / 2 + tuning.logoShift, y: (box.top + box.bottom) / 2}
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
    const homeWidth = (LOGO_WIDTH * tuning.cell) / 2
    const homeHeight = (LOGO_HEIGHT * tuning.cell) / 2
    const {offset, lamps} = arrangement.current
    const scale = clamp(
      arrangement.current.scale,
      MIN_SCALE,
      Math.min(MAX_SCALE, box.width / homeWidth, box.height / homeHeight)
    )
    const logoWidth = homeWidth * scale
    const logoHeight = homeHeight * scale
    arrangement.current = {
      offset: {
        x: clamp(offset.x, box.left + logoWidth / 2 - home.x, box.right - logoWidth / 2 - home.x),
        y: clamp(offset.y, box.top + logoHeight / 2 - home.y, box.bottom - logoHeight / 2 - home.y)
      },
      scale,
      lamps
    }
    const logo = {x: home.x + arrangement.current.offset.x, y: home.y + arrangement.current.offset.y, scale}
    const change = switched.current
    const r = ease((now - change.at) / 1000 / MATERIAL_SECONDS)
    const to = {paper: material === 'paper' ? 1 : 0, gloss: material === 'gloss' ? 1 : 0}
    const from = change.from
    mix.current = {paper: from.paper + (to.paper - from.paper) * r, gloss: from.gloss + (to.gloss - from.gloss) * r}
    place(grip.current, logo.x - logoWidth / 2, logo.y - logoHeight / 2, logoWidth, logoHeight)
    // 光は、ロゴの上端（部屋の中央からロゴの高さの半分上）が画面の下端に届くところで最大になる
    const logoTop = (box.top + box.bottom) / 2 - (LOGO_HEIGHT * tuning.cell) / 4
    const brightness =
      arrived * (DIM + (1 - DIM) * ease(1 - (logoTop - height) / (height * BRIGHTEN_SCREENS))) * lamps.upper.power
    // 下の光は、部屋の床が画面の下端の半画面下まで来たところから光り始め、下端に着くと最大になる
    const underBrightness = ease(1 - (box.bottom - height) / (height / 2)) * lamps.under.power
    // 光源の位置。上の光は画面の上、下の光はロゴのもとの位置の真下から underShift ずらした床の上
    const at = {
      upper: lightAt(stage.current, {width: screen.current?.clientWidth ?? 0, height}),
      under: {x: home.x + tuning.underShift, y: box.bottom - tuning.underHeight}
    }
    // 向きは、Auto ならロゴの今の位置へ、傾けてあればその向きへ。今の向きからそこへ滑らかに寄せる
    const follow = 1 - Math.exp(-Math.min(0.1, (now - lastFrame.current) / 1000) / TURN_SECONDS)
    lastFrame.current = now
    const turned = (key: LampKey) => {
      const {tilt} = lamps[key]
      const target = tilt === null ? Math.atan2(logo.y - at[key].y, logo.x - at[key].x) : angleOf(key, tilt)
      const was = facing.current?.[key]
      if (was === undefined) return target
      const gap = wrapAngle(target - was)
      return Math.abs(gap) < 0.001 ? target : was + gap * follow
    }
    facing.current = {upper: turned('upper'), under: turned('under')}
    send({
      frame: {
        upper: {...at.upper, angle: facing.current.upper, brightness, focus},
        under: {...at.under, angle: facing.current.under, brightness: underBrightness},
        logo,
        material: mix.current
      }
    })

    // フッターに出す状態。向きは傾きにして 1 度に丸め、ロゴを動かすあいだ毎フレーム出し直さないようにする
    const degree = Math.PI / 180
    const control = (key: LampKey): LampControl => {
      const tilt = Math.min(MAX_TILT, Math.max(-MAX_TILT, tiltOf(key, facing.current![key])))
      return {...lamps[key], facing: Math.round(tilt / degree) * degree}
    }
    const next: Shown = {
      lit: nowLit,
      changed: !isDefault(arrangement.current),
      scale: Math.round(scale * 100) / 100,
      lamps: {upper: control('upper'), under: control('under')}
    }
    if (JSON.stringify(next) !== JSON.stringify(shown.current)) publish(next)
  })

  return (
    // ロゴのつかみ場所を置く層。舞台の canvas と同じ範囲に重ねる
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[100lvh]" aria-hidden>
      {/* ロゴのつかみ場所。位置と大きさは毎フレーム書く。光が消えているあいだは出さない */}
      <div
        ref={grip}
        data-grab
        className="pointer-events-auto absolute top-0 left-0 hidden cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onLogoDown}
        onPointerMove={onLogoMove}
        onPointerUp={onLogoUp}
        onPointerCancel={onLogoUp}
        onWheel={onLogoWheel}
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

/** フッターに出している状態 */
type Shown = {lit: boolean; changed: boolean; scale: number; lamps: Record<LampKey, LampControl>}

/** 光の設定の既定（フッターに出す前の値） */
const STILL: LampControl = {...DEFAULT_ARRANGEMENT.lamps.upper, facing: 0}

/** つかみ場所を、舞台の左上からの位置と大きさに置いて出す */
function place(el: HTMLElement | null, x: number, y: number, width: number, height: number) {
  if (!el) return
  el.style.setProperty('display', 'block')
  el.style.setProperty('width', `${width}px`)
  el.style.setProperty('height', `${height}px`)
  el.style.setProperty('transform', `translate(${x}px, ${y}px)`)
}

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useCanvas, useCanvasResize, useAnimationFrame} from './useCanvas'
import {
  advance,
  cycleProgress,
  frameOf,
  goBack,
  goNext,
  initialState,
  jumpTo,
  morphRatio,
  settle,
  type Frame,
  type Order,
  type SequenceState,
  type Timing
} from './sequence'
import {PHOTOS} from './photos'
import {ControlPanel} from './ControlPanel'
import {DevPanel} from './DevPanel'
import {LAYOUT_PARAMS, LAYOUT_PRESETS, chooseDirection, type Layout} from './layout'
import {SOURCE_H, SOURCE_W} from './table'
import {
  DEFAULT_INTERACTION,
  DEFAULT_TUNING,
  INTERACTION_PARAMS,
  TUNING_PARAMS,
  type Interaction,
  type Tuning
} from './tuning'
import {usePointer} from './pointer'
import {bandOf, barHeights} from './equalizer'
import type {Analysis, Command} from './worker'
import Worker from './worker?worker'

const timingOf = ({cycleSeconds, dwellRatio}: Tuning): Timing => ({cycleSeconds, dwellRatio})

export function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const equalizerRef = useRef<HTMLDivElement>(null)
  // 写真の要約は画素を持っている worker 側でしか作れないので、起動時に受け取る
  const analysis = useRef<Analysis | null>(null)
  const heights = useRef(new Float32Array(128))
  const speeds = useRef(new Float32Array(128))
  // 棒グラフを描き直す必要があるか。静止帯では phase が動かず結果も変わらない
  const eqPending = useRef(true)
  // スペクトラムでホバーしている棒。粒子と棒の両方で、そこから離れたものを暗くする
  const hovered = useRef<number | null>(null)
  const stateRef = useRef<SequenceState>(initialState({count: PHOTOS.length, shuffle: true}))
  const timingRef = useRef<Timing>(timingOf(DEFAULT_TUNING))
  const tuningRef = useRef<Tuning>(DEFAULT_TUNING)
  const interactionRef = useRef<Interaction>(DEFAULT_INTERACTION)
  const lastFrame = useRef<Frame>({from: -1, to: -1, phase: -1})
  const lastTime = useRef(0)
  const visibleRef = useRef(true)
  const velocity = useRef({x: 0, y: 0})
  const settling = useRef(0)
  const jumped = useRef(false)

  const [index, setIndex] = useState(0)
  const [shuffle, setShuffle] = useState(true)
  const order = useMemo<Order>(() => ({count: PHOTOS.length, shuffle}), [shuffle])
  // 並べ方は画面の形で決める。写真が大きくなるほうを選ぶ
  const viewport = useViewport()
  const direction = chooseDirection(viewport.width, viewport.height, PHOTOS.length)
  // 開発用パネルで触っているあいだだけ上書きする
  const [override, setOverride] = useState<Layout | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const preset = LAYOUT_PRESETS[direction]
  const layout = override ?? preset
  const content = useContentRect(sectionRef)
  const panelSize = useContentRect(panelRef)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // 動きを減らす設定の人には自動では動かさない。初期値だけで判断し、
  // あとはトグルに委ねる（押せば動かせる）
  const [autoplay, setAutoplay] = useState(!reduced)

  const {canvas, post, ref} = useCanvas<Analysis>(Worker, (reply) => {
    analysis.current = reply
    eqPending.current = true
  })
  useCanvasResize(post, ref)
  const takePointer = usePointer(ref)

  useEffect(() => {
    // canvas の余白をページ背景に合わせる。worker から CSS は読めないので値を渡す
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--color-ground')
    post({photos: PHOTOS.map(({src}) => src), ground})
  }, [post])

  // 画面外では時計を止める。下のセクションを読んでいる間 GPU を回す意味がない
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const applyTuning = useCallback(
    (tuning: Tuning) => {
      timingRef.current = timingOf(tuning)
      tuningRef.current = tuning
      post({tuning})
    },
    [post]
  )

  // 棒グラフのつまみを動かしたときは、静止帯でも描き直す
  useEffect(() => {
    eqPending.current = true
  }, [layout.eqAxis, layout.eqBars, layout.eqCurve, layout.eqMotion])

  const applyInteraction = useCallback(
    (interaction: Interaction) => {
      interactionRef.current = interaction
      post({interaction})
    },
    [post]
  )

  useAnimationFrame(
    useCallback(() => {
      const now = performance.now()
      const delta = Math.min((now - (lastTime.current || now)) / 1000, 0.1) // タブ復帰時の巨大な差分は捨てる
      lastTime.current = now

      const timing = timingRef.current
      if (visibleRef.current) {
        if (autoplay) {
          stateRef.current = advance(stateRef.current, delta, order, timing)
        } else {
          // 自動再生を切っても進行中の遷移は完走させる
          stateRef.current = settle(stateRef.current, delta, timing)
        }
      }

      const command: Command = {}
      const {attack, release, returnSeconds, stopBelow} = interactionRef.current

      const {from, to, phase: linear} = frameOf(stateRef.current, timing)
      // 動きを減らす設定では中点で切り替えるだけにして、粒子の移動を見せない
      const phase = reduced ? (linear < 0.5 ? 0 : 1) : linear

      const previous = lastFrame.current
      if (from !== previous.from || to !== previous.to || phase !== previous.phase) {
        lastFrame.current = {from, to, phase}
        command.render = {from, to, phase}
        // 丸は遷移の開始で動かす。粒子が飛んでいるあいだに次の番号へ移る
        setIndex(phase > 0 ? to : from)
      }

      // 行き先が変わったフレームは、基準位置の飛びを worker 側でズレに振り替える。
      // そのズレが戻りきるまで更新を回す必要があるので、残り時間も入れ直す
      if (jumped.current) {
        jumped.current = false
        command.catchUp = true
        settling.current = (release + returnSeconds) * 4
      }

      // ポインタ速度は瞬間値をそのまま使わず、時定数で均した値にする。
      // 速くなるときと遅くなるときで時定数を変えることで、力がゆっくり乗り、
      // 止めたあともしばらく尾を引く。exp を使うのはフレームレートに依存させないため
      const p = takePointer()
      const step = Math.max(delta, 1 / 240)
      const targetX = p.active ? p.dx / step : 0
      const targetY = p.active ? p.dy / step : 0
      const current = velocity.current
      const rising = Math.hypot(targetX, targetY) > Math.hypot(current.x, current.y)
      const rate = 1 - Math.exp(-delta / Math.max(rising ? attack : release, 0.01))
      current.x += (targetX - current.x) * rate
      current.y += (targetY - current.y) * rate

      // 力が消えてもズレはバネで戻り続けるので、戻りきるまでは更新を回す。
      // ここで打ち切ると写真が歪んだまま固まる
      // 画面外では更新しない。stopBelow が 0 のときは止まらない設定なので、
      // ここで切らないと下のセクションを読んでいるあいだも GPU が回り続ける。
      // 残り時間は減らさずに保つので、戻ってきたときに続きから戻りきる
      const speed = Math.abs(current.x) + Math.abs(current.y)
      const forced = visibleRef.current && (stopBelow <= 0 || speed > stopBelow)
      if (visibleRef.current) {
        settling.current = forced ? (release + returnSeconds) * 4 : Math.max(0, settling.current - delta)
      }
      if (forced || (visibleRef.current && settling.current > 0)) {
        command.pointer = {x: p.x, y: p.y, vx: current.x, vy: current.y}
        command.step = delta
      }

      if (command.render || command.pointer || command.catchUp) post(command)
      // 進み具合も帯の境目も、バーの一番外側に CSS 変数として書く。
      // 中の3枚（遷移帯・静止帯・通過ぶん）はそれを継承して描き分ける
      // 棒グラフ。静止帯では phase が止まっていて結果も変わらないので計算ごと飛ばす
      const equalizer = equalizerRef.current
      if (equalizer && analysis.current && (command.render || eqPending.current)) {
        eqPending.current = false
        const bars = Math.min(layout.eqBars, equalizer.children.length)
        // ホバー中の棒からの距離で、その棒を明るくする。他は落とさない
        const lift = layout.hoverLift / 100
        const near = (i: number) =>
          hovered.current === null
            ? 0
            : lift * Math.exp(-((Math.abs(i - hovered.current) / layout.hoverSpread) ** layout.hoverCurve))
        barHeights(
          analysis.current,
          {from, to, phase},
          tuningRef.current,
          {bars, curve: layout.eqCurve, axis: layout.eqAxis},
          heights.current,
          speeds.current
        )
        // 高さは分布、濃さは速度。次元が違うので別のチャンネルに出す
        for (let i = 0; i < bars; i++) {
          const bar = equalizer.children[i] as HTMLElement
          bar.style.transform = `scaleY(${heights.current[i]})`
          const lit = REST_OPACITY + (1 - REST_OPACITY) * Math.min(1, speeds.current[i] * layout.eqMotion)
          bar.style.opacity = String(lit + (1 - lit) * near(i))
        }
      }

      const bar = progressRef.current
      if (bar) {
        bar.style.setProperty('--progress', String(cycleProgress(stateRef.current, timing)))
        bar.style.setProperty('--morph', `${morphRatio(timing) * 100}%`)
      }
    }, [
      autoplay,
      layout.eqAxis,
      layout.eqBars,
      layout.eqCurve,
      layout.eqMotion,
      layout.hoverCurve,
      layout.hoverLift,
      layout.hoverSpread,
      order,
      post,
      reduced,
      takePointer
    ])
  )

  // 行き先が変わったフレームは worker 側で位置の飛びを打ち消す。
  // 番号のクリックも前後送りも同じ扱い
  const go = (next: SequenceState) => {
    if (next === stateRef.current) return
    stateRef.current = next
    jumped.current = true
  }

  // 写真の枠は JS で寸法を決める。canvas を写真ぴったりにすると、
  // 中でレターボックスされず、写真の端＝canvas の端になって配置が読める
  const photo = fitPhoto(
    content,
    direction === 'side' ? panelSize.width + GAP : 0,
    direction === 'side' ? 0 : panelSize.height
  )

  return (
    <section
      ref={sectionRef}
      className={`flex h-[100svh] items-center justify-center gap-10 px-8 pt-[calc(var(--spacing-nav)+1.5rem)] pb-8 ${
        direction === 'side' ? 'flex-row' : 'flex-col'
      }`}
    >
      <div className="relative flex shrink-0" style={{width: photo.width, height: photo.height}}>
        {canvas}
      </div>
      <ControlPanel
        ref={panelRef}
        index={index}
        autoplay={autoplay}
        shuffle={shuffle}
        layout={layout}
        direction={direction}
        onToggle={() => setAutoplay(!autoplay)}
        onShuffle={() => setShuffle(!shuffle)}
        onPrev={() => go(goBack(stateRef.current, order, timingRef.current))}
        onNext={() => go(goNext(stateRef.current, order, timingRef.current))}
        onSelect={(target) => go(jumpTo(stateRef.current, target, timingRef.current))}
        onHover={(index) => {
          hovered.current = index
          eqPending.current = true
          post({
            band:
              index === null
                ? {center: 0, width: 0, curve: layout.hoverCurve, near: layout.hoverNear, far: layout.hoverFar}
                : {
                    ...bandOf(index, {bars: layout.eqBars, axis: layout.eqAxis}, layout.hoverSpread),
                    curve: layout.hoverCurve,
                    near: layout.hoverNear,
                    far: layout.hoverFar
                  }
          })
        }}
        progressRef={progressRef}
        equalizerRef={equalizerRef}
      />
      {import.meta.env.DEV && (
        <div className="pointer-events-none fixed top-16 left-4 z-10 flex flex-col gap-2">
          <DevPanel
            title="粒子パラメータ"
            typeName="Tuning"
            constName="DEFAULT_TUNING"
            params={TUNING_PARAMS}
            defaults={DEFAULT_TUNING}
            storageKey="mypage2026.tuning"
            onChange={applyTuning}
          />
          <DevPanel
            title="マウス・指の干渉"
            typeName="Interaction"
            constName="DEFAULT_INTERACTION"
            params={INTERACTION_PARAMS}
            defaults={DEFAULT_INTERACTION}
            storageKey="mypage2026.interaction"
            onChange={applyInteraction}
          />
          {/* 並べ方が変わったら key で作り直し、その並べ方用の値を読み込ませる */}
          <DevPanel
            key={direction}
            title={direction === 'side' ? 'パネルの寸法（横並び）' : 'パネルの寸法（縦並び）'}
            typeName="Layout"
            constName={direction === 'side' ? 'SIDE_LAYOUT' : 'STACKED_LAYOUT'}
            params={LAYOUT_PARAMS}
            defaults={preset}
            storageKey={`mypage2026.layout.${direction}`}
            onChange={setOverride}
          />
        </div>
      )}
    </section>
  )
}

/** 棒グラフの、飛んでいないときの濃さ */
const REST_OPACITY = 0.35

/** 写真とパネルのあいだ、および外周の余白 px。section の gap / px-8 と合わせる */
const GAP = 32

/** 使える領域から、3:2 を保った最大の枠を出す */
function fitPhoto({width, height}: {width: number; height: number}, takenX: number, takenY: number) {
  const aspect = SOURCE_W / SOURCE_H
  const w = Math.max(0, width - takenX)
  const h = Math.max(0, height - takenY)
  const fitted = Math.min(w, h * aspect)
  return {width: Math.round(fitted), height: Math.round(fitted / aspect)}
}

/** 要素のコンテンツ領域（padding を除いた大きさ）を測る */
function useContentRect(ref: {current: HTMLElement | null}) {
  const [size, setSize] = useState({width: 0, height: 0})
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect
      setSize({width, height})
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function useViewport() {
  const [size, setSize] = useState(() => ({width: innerWidth, height: innerHeight}))
  useEffect(() => {
    const onResize = () => setSize({width: innerWidth, height: innerHeight})
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  return size
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

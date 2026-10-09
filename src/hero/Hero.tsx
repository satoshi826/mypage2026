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
  pause,
  settle,
  type Frame,
  type Order,
  type SequenceState,
  type Timing
} from './sequence'
import {ControlPanel} from './ControlPanel'
import {progressLine, setPlayer} from './playback'
import {DevPanel} from '../app/DevPanel'
import {
  LAYOUT_PARAMS,
  LAYOUT_PRESETS,
  TONE,
  TONE_PARAMS,
  chooseDirection,
  fitStacked,
  panelWidth,
  type Layout
} from './layout'
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
import type {Command, Loaded} from './worker'
import Worker from './worker?worker'

const timingOf = ({cycleSeconds, dwellRatio}: Tuning): Timing => ({cycleSeconds, dwellRatio})

/** @param photos hero 用の派生画像の URL。空では呼ばない */
export function Hero({photos: PHOTOS}: {photos: string[]}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SequenceState>(initialState())
  const timingRef = useRef<Timing>(timingOf(DEFAULT_TUNING))
  const interactionRef = useRef<Interaction>(DEFAULT_INTERACTION)
  const lastFrame = useRef<Frame>({from: -1, to: -1, phase: -1})
  const lastTime = useRef(0)
  const visibleRef = useRef(true)
  // フッターの再生操作を出すか。写真がある程度見えているあいだだけ出す
  const [visible, setVisible] = useState(true)
  const velocity = useRef({x: 0, y: 0})
  const settling = useRef(0)
  const jumped = useRef(false)

  const [index, setIndex] = useState(0)
  const [shuffle, setShuffle] = useState(true)
  // 読み込みが済んだ写真の番号。worker が1枚上げるごとに増える。抽選はこの中から
  const [available, setAvailable] = useState<number[]>([])
  const order = useMemo<Order>(() => ({shuffle, available}), [shuffle, available])
  // 並べ方は画面の形で決める。写真が大きくなるほうを選ぶ
  const viewport = useViewport()
  const direction = chooseDirection(viewport.width, viewport.height, PHOTOS.length)
  // 開発用パネルで触っているあいだだけ上書きする
  const [override, setOverride] = useState<Layout | null>(null)
  // 濃さは並べ方によらず共通。開発用パネルで触っているあいだだけ上書きする
  const [tone, setTone] = useState(TONE)
  const preset = LAYOUT_PRESETS[direction]
  const layout = override ?? preset
  const content = useContentRect(sectionRef)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // 動きを減らす設定の人には自動では動かさない。初期値だけで判断し、
  // あとはトグルに委ねる（押せば動かせる）
  const [autoplay, setAutoplay] = useState(!reduced)

  const {canvas, post, ref} = useCanvas<Loaded>(Worker, ({layer}) => {
    setAvailable((prev) => [...prev, layer].sort((a, b) => a - b))
  })
  useCanvasResize(post, ref)
  const takePointer = usePointer(ref)

  useEffect(() => {
    // canvas の余白をページ背景に合わせる。worker から CSS は読めないので値を渡す
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--color-ground')
    post({photos: PHOTOS, ground})
  }, [post, PHOTOS])

  // 固定のナビとフッターに隠れているだけの範囲は、どちらの判定でも画面外とみなす。トップの一番下まで
  // スクロールすると hero の下端がちょうど画面の上端に接し、接しているだけでも交差と判定されるため
  useEffect(() => {
    const section = sectionRef.current
    const frame = frameRef.current
    if (!section || !frame) return
    const bar = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0
    const rootMargin = `-${bar('nav')}px 0px -${bar('footer')}px 0px`
    // 画面外では時計を止める。下のセクションを読んでいる間 GPU を回す意味がない
    const clock = new IntersectionObserver(([entry]) => (visibleRef.current = entry.isIntersecting), {rootMargin})
    // 再生操作は、写真の 6 割が隠れたところで下げる。読み進めている人の視界に操作を残さない
    const controls = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= CONTROLS_SHOWN), {
      rootMargin,
      threshold: CONTROLS_SHOWN
    })
    clock.observe(section)
    controls.observe(frame)
    return () => {
      clock.disconnect()
      controls.disconnect()
    }
  }, [])

  const applyTuning = useCallback(
    (tuning: Tuning) => {
      timingRef.current = timingOf(tuning)
      post({tuning})
    },
    [post]
  )

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
      // 進み具合も帯の境目も、プログレスの一番外側に CSS 変数として書く。
      // 中の3枚（遷移帯・静止帯・通過ぶん）はそれを継承して描き分ける
      const bar = progressLine.current
      if (bar) {
        // 停止中は遷移が終わった地点で止める。バーは次の遷移までの待ち時間なので、
        // 待っていないあいだ中途半端な位置に居座らせない。粒子のほうは着地まで動く
        const progress = autoplay ? cycleProgress(stateRef.current, timing) : morphRatio(timing)
        bar.style.setProperty('--progress', String(progress))
        bar.style.setProperty('--morph', `${morphRatio(timing) * 100}%`)
      }
    }, [autoplay, order, post, reduced, takePointer])
  )

  // 行き先が変わったフレームは worker 側で位置の飛びを打ち消す。
  // 番号のクリックも前後送りも同じ扱い
  const go = useCallback((next: SequenceState) => {
    if (next === stateRef.current) return
    stateRef.current = next
    jumped.current = true
  }, [])

  // 再生操作はフッターに置く（HeroPlayer.tsx）。状態と操作をそこへ出す
  useEffect(() => {
    setPlayer({
      autoplay,
      shuffle,
      visible,
      toggle: () => {
        // 停止するときは静止帯の頭へ戻す。バーは停止と同時に遷移の終了地点へ
        // 飛ぶので、内部を途中に残すと再生でバーが飛ぶ
        if (autoplay) stateRef.current = pause(stateRef.current, timingRef.current)
        setAutoplay(!autoplay)
      },
      toggleShuffle: () => setShuffle(!shuffle),
      prev: () => go(goBack(stateRef.current, order, timingRef.current)),
      next: () => go(goNext(stateRef.current, order, timingRef.current))
    })
  }, [autoplay, shuffle, visible, order, go])
  useEffect(() => () => setPlayer(null), [])

  // 写真の枠は JS で寸法を決める。canvas を写真ぴったりにすると、
  // 中でレターボックスされず、写真の端＝canvas の端になって配置が読める。
  // 縦並びではパネルを写真と同じ幅に広げるので、両方まとめて解く
  const photo =
    direction === 'side'
      ? fitPhoto(content, panelWidth(layout) + layout.photoGap)
      : fitStacked(content, layout, PHOTOS.length)
  // 縦並びのパネルは写真と同じ幅に広げる。マスが上限に達したらそこで止める
  const panel = direction === 'side' ? panelWidth(layout) : Math.min(photo.width, panelWidth(layout))

  return (
    <section
      ref={sectionRef}
      className={`flex h-[100svh] items-center justify-center ${direction === 'side' ? 'flex-row' : 'flex-col'}`}
      style={{
        gap: layout.photoGap,
        padding: layout.padding,
        paddingTop: `calc(var(--spacing-nav) + ${layout.padding}px)`,
        paddingBottom: `calc(var(--spacing-footer) + env(safe-area-inset-bottom) + ${layout.padding}px)`
      }}
    >
      {/* touch-none で写真の上の指をブラウザに渡さない。指がスクロールに移ると
          pointercancel で干渉が切れてしまうため */}
      <div
        ref={frameRef}
        className="relative flex shrink-0 touch-none"
        style={{width: photo.width, height: photo.height}}
      >
        {canvas}
      </div>
      <ControlPanel
        count={PHOTOS.length}
        available={available}
        index={index}
        layout={layout}
        tone={tone}
        width={panel}
        onSelect={(target) => go(jumpTo(stateRef.current, target, order, timingRef.current))}
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
          <DevPanel
            title="カレンダーの濃さ（共通）"
            typeName="Tone"
            constName="TONE"
            params={TONE_PARAMS}
            defaults={TONE}
            storageKey="mypage2026.tone"
            onChange={setTone}
          />
        </div>
      )}
    </section>
  )
}

/** フッターの再生操作を出しておく、写真の見えている割合の下限 */
const CONTROLS_SHOWN = 0.4

/** 使える領域から、パネルに取られるぶんを引いて、3:2 を保った最大の枠を出す */
function fitPhoto({width, height}: {width: number; height: number}, takenX: number) {
  const aspect = SOURCE_W / SOURCE_H
  const fitted = Math.round(Math.min(Math.max(0, width - takenX), height * aspect))
  return {width: fitted, height: Math.round(fitted / aspect)}
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

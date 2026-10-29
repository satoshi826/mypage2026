import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks'
import {useCanvas, useCanvasResize, useAnimationFrame} from './useCanvas'
import {
  advance,
  cycleProgress,
  frameOf,
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
import {progressLines, setPlayer} from './playback'
import {DevPanel} from '../app/DevPanel'
import {RISE_RATIO, lightAt, riseOf, type Stage} from '../app/stage'
import {
  LAYOUT_PARAMS,
  LAYOUT_PRESETS,
  MAX_PHOTO_WIDTH,
  TONE,
  TONE_PARAMS,
  chooseDirection,
  fitStacked,
  panelWidth,
  type Layout
} from './layout'
import {ASPECT} from './table'
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

/**
 * @param photos hero 用の派生画像の URL。空では呼ばない
 * @param stage トップの舞台。スクロールに合わせて写真を上げ、上がりきったら粒子を写真の中央へ集める。上がる距離と集まる点を書き込む
 */
export function Hero({photos: PHOTOS, stage}: {photos: string[]; stage: {current: Stage}}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SequenceState>(initialState())
  const timingRef = useRef<Timing>(timingOf(DEFAULT_TUNING))
  const interactionRef = useRef<Interaction>(DEFAULT_INTERACTION)
  const lastFrame = useRef<Frame>({from: -1, to: -1, phase: -1})
  const lastTime = useRef(0)
  const lastRise = useRef(0)
  const lastScrolled = useRef(0)
  const calendarRef = useRef<HTMLDivElement>(null)
  // 上がる前の写真の枠（画面の上の位置）。粒子が出入りする点を、写真の上がり具合によらず画面の上の同じ位置に保つのに使う
  const frameBox = useRef<{left: number; top: number; width: number; height: number} | null>(null)
  const lastGather = useRef(0)
  // フッターの再生操作を出し、写真を触れるようにするか。粒子が集まり始めて写真が崩れたら下げる
  const [visible, setVisible] = useState(true)
  const velocity = useRef({x: 0, y: 0})
  const settling = useRef(0)
  const jumped = useRef(false)
  // 停止したあと、バーを静止帯の頭より前へ戻さない。停止中も進行中の遷移は完走させる（settle）ので、走り終わる前に
  // 再生すると、中の進み具合に合わせてバーが静止帯より前へ戻り、そこから流れ出してしまう。走り終わるまでバーは
  // 静止帯の頭で待たせる（中の状態とは少しずれるが、バーは次の遷移までの待ち時間として読めればよい）
  const barHeld = useRef(false)

  const [index, setIndex] = useState(0)
  // 読み込みが済んだ写真の番号。worker が1枚上げるごとに増える。抽選はこの中から
  const [available, setAvailable] = useState<number[]>([])
  // この巡で表示した写真の番号。丸がその番号へ移った時点で数える。全部を表示し終えたら、今の1枚から数え直す
  const [seen, setSeen] = useState<number[]>([0])
  useEffect(
    () =>
      setSeen((prev) => {
        if (prev.includes(index)) return prev
        const next = [...prev, index]
        return next.length >= PHOTOS.length ? [index] : next
      }),
    [index, PHOTOS.length]
  )
  const order = useMemo<Order>(() => ({available, seen}), [available, seen])
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
    // 計測の印（bench/）。canvas は LCP の対象にならないので、写真が届いた時刻をここで残す
    performance.mark('hero:photo')
    setAvailable((prev) => [...prev, layer].sort((a, b) => a - b))
  })
  useCanvasResize(post, ref)
  const takePointer = usePointer(ref)

  useEffect(() => {
    post({photos: PHOTOS})
  }, [post, PHOTOS])

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

  // 粒子が出入りする点（stage の source。画面の上の位置）を、写真の枠が rise px 上がったときの canvas の NDC に直す。
  // 写真が上がり具合を変えても（集まっている途中でスクロールを戻したときなど）、粒子は画面の上の同じ点、つまり光から出入りする
  const gatherAtFor = useCallback(
    (rise: number): [number, number] => {
      const box = frameBox.current
      if (!box) return [0, 0]
      const {x, y} = stage.current.source
      return [((x - box.left) / box.width) * 2 - 1, 1 - ((y - (box.top - rise)) / box.height) * 2]
    },
    [stage]
  )

  useAnimationFrame(
    useCallback(() => {
      const now = performance.now()
      const delta = Math.min((now - (lastTime.current || now)) / 1000, 0.1) // タブ復帰時の巨大な差分は捨てる
      lastTime.current = now

      const command: Command = {}

      // 写真はまずスクロールと一緒に上がり、上がりきったところで止まる。そこから粒子が光へ飛び込み（時間で進む）。
      // カレンダーは止まらず、ふつうのページの中身としてスクロールで上へ流れていきながら薄れる。
      // 粒子がすべて光に吸い込まれたら写真は見えないので、時計も干渉も止める
      const rise = riseOf(stage.current) * innerHeight
      const scrolled = stage.current.progress * innerHeight
      const {gather} = stage.current
      const shown = gather < 1
      if (rise !== lastRise.current) {
        lastRise.current = rise
        frameRef.current?.style.setProperty('translate', `0 ${-rise}px`)
        command.gatherAt = gatherAtFor(rise)
      }
      if (scrolled !== lastScrolled.current) {
        lastScrolled.current = scrolled
        calendarRef.current?.style.setProperty('translate', `0 ${-scrolled}px`)
      }
      if (gather !== lastGather.current) {
        lastGather.current = gather
        command.gather = gather
        sectionRef.current?.style.setProperty('--gather', String(gather))
        setVisible(gather < CONTROLS_SHOWN)
      }

      const timing = timingRef.current
      if (shown) {
        // 集まり始めたら次の写真へは進めない。自動再生を切ったときと同じく、進行中の遷移は完走させる
        if (autoplay && gather === 0) {
          stateRef.current = advance(stateRef.current, delta, order, timing)
        } else {
          stateRef.current = settle(stateRef.current, delta, timing)
        }
      }

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
      // 集まりきっているあいだは更新しない。stopBelow が 0 のときは止まらない設定なので、
      // ここで切らないと光の段を見ているあいだも GPU が回り続ける。
      // 残り時間は減らさずに保つので、戻ってきたときに続きから戻りきる
      const speed = Math.abs(current.x) + Math.abs(current.y)
      const forced = shown && (stopBelow <= 0 || speed > stopBelow)
      if (shown) {
        settling.current = forced ? (release + returnSeconds) * 4 : Math.max(0, settling.current - delta)
      }
      if (forced || (shown && settling.current > 0)) {
        command.pointer = {x: p.x, y: p.y, vx: current.x, vy: current.y}
        command.step = delta
      }

      if (command.render || command.pointer || command.catchUp || command.gather !== undefined) post(command)
      // 進み具合も帯の境目も、プログレスの一番外側に CSS 変数として書く。
      // 中の3枚（遷移帯・静止帯・通過ぶん）はそれを継承して描き分ける
      // 停止中は遷移が終わった地点で止める。バーは次の遷移までの待ち時間なので、
      // 待っていないあいだ中途半端な位置に居座らせない。粒子のほうは着地まで動く
      const morph = morphRatio(timing)
      let progress = autoplay ? cycleProgress(stateRef.current, timing) : morph
      if (autoplay && barHeld.current) {
        if (progress < morph) progress = morph
        else barHeld.current = false
      }
      for (const bar of progressLines) {
        bar.style.setProperty('--progress', String(progress))
        bar.style.setProperty('--morph', `${morph * 100}%`)
      }
    }, [autoplay, gatherAtFor, order, post, reduced, stage, takePointer])
  )

  // 行き先が変わったフレームは worker 側で位置の飛びを打ち消す（番号のクリック）
  const go = useCallback((next: SequenceState) => {
    if (next === stateRef.current) return
    stateRef.current = next
    jumped.current = true
    // 番号を選ぶのは新しい遷移を始める操作なので、バーは先頭から進める
    barHeld.current = false
  }, [])

  const toggle = useCallback(() => {
    // 停止するときは静止帯の頭へ戻す。バーは停止と同時に遷移の終了地点へ
    // 飛ぶので、内部を途中に残すと再生でバーが飛ぶ
    if (autoplay) {
      stateRef.current = pause(stateRef.current, timingRef.current)
      barHeld.current = true
    }
    setAutoplay(!autoplay)
  }, [autoplay])

  // 再生操作はフッターに置く（HeroPlayer.tsx）。状態と操作をそこへ出す
  useEffect(() => {
    setPlayer({autoplay, visible, toggle})
  }, [autoplay, visible, toggle])

  // 写真をマウスで押しても再生と停止を切り替える（動画のプレイヤーと同じ）。写真の上は粒子を押して遊ぶ場所でもあるので、
  // ほとんど動かさず（TAP_MOVE 未満）短く（TAP_MS 未満）押して離したときだけにする。指では切り替えない。軽く触るのが
  // 指のふつうの操作で、粒子を試しに触っただけで止まってしまうため（フッターの再生ボタンで切り替える）。切り替えたら、写真を
  // 一瞬暗くして、中央に切り替えた先の記号を出す（flash。数を増やして描き直し、出る動きを最初からやり直す）
  const press = useRef<{x: number; y: number; time: number} | null>(null)
  const [flash, setFlash] = useState<{count: number; playing: boolean} | null>(null)
  const onPointerDown = (event: PointerEvent) => {
    press.current =
      event.pointerType === 'mouse' && event.button === 0
        ? {x: event.clientX, y: event.clientY, time: event.timeStamp}
        : null
  }
  const onPointerUp = (event: PointerEvent) => {
    const down = press.current
    press.current = null
    if (!down) return
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    if (moved >= TAP_MOVE || event.timeStamp - down.time >= TAP_MS) return
    toggle()
    setFlash((prev) => ({count: (prev?.count ?? 0) + 1, playing: !autoplay}))
  }
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

  // 写真が上がる距離と、粒子が集まる点を舞台へ書き、集まる点を worker へ渡す。集まる点は光の位置で、それが上がりきった
  // 写真の外なら写真の中で一番近い点。舞台は画面に貼りついているので、画面の上の位置がそのまま舞台の上の位置。
  // 測った位置には今上がっているぶんが入っているので、戻してから数える
  useLayoutEffect(() => {
    const section = sectionRef.current
    const rect = frameRef.current?.getBoundingClientRect()
    if (!section || !rect || rect.width <= 0) return
    const box = {left: rect.left, top: rect.top + lastRise.current, width: rect.width, height: rect.height}
    frameBox.current = box
    const rise = photo.height * RISE_RATIO
    const top = box.top - rise
    const light = lightAt({width: section.clientWidth, height: section.clientHeight})
    stage.current.rise = rise / innerHeight
    stage.current.source = {
      x: Math.min(Math.max(light.x, box.left), box.left + box.width),
      y: Math.min(Math.max(light.y, top), top + box.height)
    }
    post({gatherAt: gatherAtFor(lastRise.current)})
  }, [stage, post, gatherAtFor, photo.width, photo.height, panel, direction, content])

  return (
    <section
      ref={sectionRef}
      className={`flex h-[100svh] items-center justify-center ${direction === 'side' ? 'flex-row' : 'flex-col'}`}
      style={{
        gap: `${layout.photoGap}px`,
        padding: `${layout.padding}px`,
        paddingTop: `calc(var(--spacing-nav) + ${layout.padding}px)`,
        paddingBottom: `calc(var(--spacing-footer) + env(safe-area-inset-bottom) + ${layout.padding}px)`
      }}
    >
      {/* touch-none で写真の上の指をブラウザに渡さない。指がスクロールに移ると
          pointercancel で干渉が切れてしまうため */}
      <div
        ref={frameRef}
        className={`relative flex shrink-0 touch-none ${visible ? '' : 'pointer-events-none'}`}
        style={{width: `${photo.width}px`, height: `${photo.height}px`}}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {canvas}
        {flash && (
          <div
            key={flash.count}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center [animation:hero-dim_1s_ease-out_both]"
          >
            <svg
              viewBox="0 0 24 24"
              className="glow-mark size-32 fill-ink [--glow:var(--glow-hover)] [animation:hero-flash_1s_ease-out_both]"
            >
              {flash.playing ? <path d="M8 5 19 12 8 19z" /> : <path d="M8 5h3v14H8zM14 5h3v14h-3z" />}
            </svg>
          </div>
        )}
      </div>
      {/* カレンダーはスクロールで上へ流れ、粒子が集まるあいだ（集まりきるまで）をかけてゆっくり薄れて消える。
          位置と --gather（粒子が集まった割合）は毎フレーム書く */}
      <div
        ref={calendarRef}
        className={`shrink-0 opacity-[calc(1-var(--gather,0))] ${visible ? '' : 'pointer-events-none'}`}
      >
        <ControlPanel
          count={PHOTOS.length}
          available={available}
          seen={seen}
          index={index}
          layout={layout}
          tone={tone}
          width={panel}
          onSelect={(target) => go(jumpTo(stateRef.current, target, order, timingRef.current))}
        />
      </div>
      {import.meta.env.DEV && (
        <>
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
        </>
      )}
    </section>
  )
}

/** 写真を押して再生と停止を切り替えるとみなす、押してから離すまでの移動の上限 px と時間の上限 ms */
const TAP_MOVE = 5
const TAP_MS = 300

/** フッターの再生操作を出しておく、粒子が集まった割合の上限 */
const CONTROLS_SHOWN = 0.4

/** 使える領域から、パネルに取られるぶんを引いて、3:2 を保った最大の枠を出す。幅は MAX_PHOTO_WIDTH まで */
function fitPhoto({width, height}: {width: number; height: number}, takenX: number) {
  const fitted = Math.round(Math.min(Math.max(0, width - takenX), height * ASPECT, MAX_PHOTO_WIDTH))
  return {width: fitted, height: Math.round(fitted / ASPECT)}
}

/**
 * 要素のコンテンツ領域（padding を除いた大きさ）を測る。最初の 1 回は描く前に測る。描いたあとに測ると、
 * 最初の 1 枚だけ写真の枠が大きさ 0 で描かれ、縦並びではカレンダーが中央から写真の下へずれる（レイアウトのずれ）
 */
function useContentRect(ref: {current: HTMLElement | null}) {
  const [size, setSize] = useState({width: 0, height: 0})
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const style = getComputedStyle(el)
    setSize({
      width: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    })
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

import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks'
import {createPortal, type ComponentChildren} from 'preact'
import {GLOW_HOVER} from '../app/glow'
import {useExternal} from '../app/useExternal'
import {MAX_POWER, MAX_SCALE, MAX_TILT, MIN_SCALE, type LampKey} from './arrangement'
import {MATERIALS, useLogoControls, type LampControl, type LogoControls as Controls, type Material} from './controls'

const MATERIAL_LABELS: Record<Material, string> = {matte: 'Matte', glass: 'Glass', metal: 'Metal'}
const LAMP_LABELS: Record<LampKey, string> = {upper: 'Top', under: 'Bottom'}

// before は指の当たり判定。配置を変えずに 44px を確保する
const ICON_BUTTON = `glow-mark relative flex cursor-pointer opacity-55 transition-[opacity,filter] duration-700 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:opacity-100 aria-expanded:opacity-100 ${GLOW_HOVER}`

/** 開いた入れ物の中で選ぶ文字。見た目はフッターのタブ（Tabs.tsx）と同じで、選んでいるものの文字を光らせる */
const OPTION = `flex cursor-pointer items-center opacity-75 transition-opacity duration-300 hover:opacity-100! focus-visible:opacity-100! ${GLOW_HOVER} aria-pressed:opacity-90 aria-pressed:[--glow:var(--glow-selected)]`

/** 欄の名前。添える文字なので 55% */
const LABEL = 'opacity-55'

/** input[type=range] のつまみの幅（styles.css の [data-slider]）。溝の両端はこの半分ずつ内側になる */
const THUMB = 16

const subscribe = () => () => {}

/**
 * フッターの左に置くロゴとライトの操作。hero の再生操作と同じ場所に重ね、光がついて hero の再生操作が隠れているあいだだけ
 * 出す。ロゴの設定（素材と大きさ）とライトの設定（上の光と下の光の向きと明るさ）は、それぞれアイコンを押すと上に開く
 * （おまけの操作なので普段は畳んでおく）。変えたロゴと光の置き方と素材を既定へ戻す操作は、変えたあとだけ出す。
 * 状態と操作は Light が controls.ts に出したものを使う
 */
export function LogoControls() {
  const controls = useLogoControls()
  if (!controls) return null
  const {lit, changed, reset} = controls
  const showReset = lit && changed
  return (
    <div
      aria-hidden={!lit}
      className={`flex items-center gap-6 transition-opacity duration-700 max-sm:gap-4 ${lit ? '' : 'pointer-events-none opacity-0'}`}
    >
      <Menu lit={lit} label="Logo" icon={LOGO_ICON}>
        {(focusable) => <LogoSettings controls={controls} focusable={focusable} />}
      </Menu>
      <Menu lit={lit} label="Light" icon={LIGHT_ICON}>
        {(focusable) => <LightSettings controls={controls} focusable={focusable} />}
      </Menu>
      <button
        type="button"
        onClick={reset}
        aria-label="Reset"
        aria-hidden={!showReset}
        tabIndex={showReset ? 0 : -1}
        className={`${ICON_BUTTON} ${showReset ? '' : 'pointer-events-none opacity-0!'}`}
      >
        {/* 反時計回りの矢印。線の太さはフッターの SNS のアイコンと同じ */}
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" stroke-width={1.5}>
          <path d="M5 12a7 7 0 1 0 2.05-4.95" />
          <path d="M4.5 3.5v4h4" />
        </svg>
      </button>
    </div>
  )
}

/** ロゴの設定のアイコン。光の当たった面として、円の半分を塗る */
const LOGO_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" stroke-width={1.5}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
  </svg>
)

/** ライトの設定のアイコン。上から下へ広がる光 */
const LIGHT_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" stroke-width={1.5}>
    <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
    <path d="M10.5 8.5 6 19.5M13.5 8.5 18 19.5" />
  </svg>
)

/** ロゴの設定。素材と大きさ */
function LogoSettings({controls, focusable}: {controls: Controls; focusable: boolean}) {
  const {material, setMaterial, scale, setScale} = controls
  return (
    <>
      <span className={LABEL}>Material</span>
      <div className="col-span-3 flex gap-6 max-sm:gap-4">
        {MATERIALS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMaterial(m)}
            aria-pressed={material === m}
            tabIndex={focusable ? 0 : -1}
            className={OPTION}
          >
            <span className="glow-text transition-[text-shadow] duration-800">{MATERIAL_LABELS[m]}</span>
          </button>
        ))}
      </div>
      <span className={LABEL}>Size</span>
      <Slider
        label="Size"
        value={scale}
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.01}
        mark={1}
        format={(value) => value.toFixed(2)}
        focusable={focusable}
        onInput={setScale}
        className="col-span-3"
      />
    </>
  )
}

/** ライトの設定。上の光と下の光それぞれの向き（Auto でロゴを向く）と明るさ */
function LightSettings({controls, focusable}: {controls: Controls; focusable: boolean}) {
  const {lamps, setLamp} = controls
  return (
    <>
      {(['upper', 'under'] as const).map((key) => {
        const lamp: LampControl = lamps[key]
        const {tilt, power, standard, facing} = lamp
        const auto = tilt === null
        const degrees = Math.round((facing * 180) / Math.PI)
        return (
          <div key={key} className="contents">
            <span className={`${LABEL} row-span-2`}>{LAMP_LABELS[key]}</span>
            <span className={LABEL}>Angle</span>
            {/* 外すと今照らしている向きのまま止める。向きが跳ばないように */}
            <button
              type="button"
              onClick={() => setLamp(key, {tilt: auto ? facing : null})}
              aria-pressed={auto}
              tabIndex={focusable ? 0 : -1}
              className={OPTION}
            >
              <span className="glow-text transition-[text-shadow] duration-800">Auto</span>
            </button>
            {/* Auto のあいだは、ロゴを向いている向きを薄く示す。動かすと Auto が外れる */}
            <Slider
              label={`${LAMP_LABELS[key]} angle`}
              value={degrees}
              min={-(MAX_TILT * 180) / Math.PI}
              max={(MAX_TILT * 180) / Math.PI}
              step={1}
              mark={0}
              faint={auto}
              format={(value) => `${value}°`}
              focusable={focusable}
              onInput={(value) => setLamp(key, {tilt: (value * Math.PI) / 180})}
            />
            <span className={LABEL}>Power</span>
            <Slider
              label={`${LAMP_LABELS[key]} power`}
              value={power}
              min={0}
              max={MAX_POWER}
              step={0.5}
              mark={standard}
              format={(value) => value.toFixed(1)}
              focusable={focusable}
              onInput={(value) => setLamp(key, {power: value})}
              className="col-start-4"
            />
          </div>
        )
      })}
    </>
  )
}

/**
 * 設定の入れ物を開くアイコン。押すと、アイコンの上に欄を並べた入れ物が開く。中で選んでも閉じない（見比べられるように）。
 * 外を押すか Esc、光が消えると閉じる。開く入れ物は Photos の列数（GalleryTools.tsx）と同じく、フッターの外（body の直下）に
 * 描く。中身は 4 列の格子（欄の名前、項目の名前、切り替え、スライダー）に並べる
 */
function Menu({
  lit,
  label,
  icon,
  children
}: {
  lit: boolean
  label: string
  icon: ComponentChildren
  /** 中身。閉じているあいだはキーボードで辿れないようにする */
  children: (focusable: boolean) => ComponentChildren
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const body = useExternal(subscribe, () => document.body, null)
  // 開く位置。ボタンの上に、左端をそろえて右へ開く（フッターの左に置くので）。狭い画面で右へはみ出すぶんは左へ寄せる
  const [at, setAt] = useState({left: 0, bottom: 0})
  useLayoutEffect(() => {
    const place = () => {
      const r = button.current?.getBoundingClientRect()
      const width = menu.current?.offsetWidth ?? 0
      if (r) setAt({left: Math.max(0, Math.min(r.left, innerWidth - width - 8)), bottom: innerHeight - r.top + 8})
    }
    place()
    addEventListener('resize', place)
    return () => removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!lit) setOpen(false)
  }, [lit])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!button.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', close)
    addEventListener('keydown', escape)
    return () => {
      removeEventListener('pointerdown', close)
      removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        tabIndex={lit ? 0 : -1}
        onClick={() => setOpen(!open)}
        className={ICON_BUTTON}
      >
        {icon}
      </button>
      {body &&
        createPortal(
          <div
            ref={menu}
            role="group"
            aria-label={label}
            aria-hidden={!open}
            style={{left: `${at.left}px`, bottom: `${at.bottom}px`}}
            className={`fixed z-20 grid auto-rows-[2.5rem] grid-cols-[repeat(4,auto)] items-center gap-x-6 border border-white/10 bg-black/70 px-4 py-1 text-sm tracking-[0.12em] backdrop-blur-[20px] transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] max-sm:gap-x-4 max-sm:text-xs ${open ? '' : 'pointer-events-none translate-y-1 opacity-0'}`}
          >
            {children(open)}
          </div>,
          body
        )}
    </>
  )
}

/**
 * 設定のスライダー。0.5px の溝に、既定の値の位置へ点を置き、今の値に丸いつまみを置き、右に値を添える。マウスを載せると
 * つまみが大きくなる。見た目は Photos の列数のスライダー（GalleryTools.tsx）にそろえる。見た目は自前で描き、操作は透明な
 * input[type=range] が受ける（ドラッグ、タップ、矢印キー、読み上げ）
 */
function Slider({
  label,
  value,
  min,
  max,
  step,
  mark,
  faint = false,
  format,
  focusable,
  onInput,
  className = ''
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** 既定の値。溝の上に点で示す */
  mark: number
  /** 値を自動で決めているあいだは、つまみを薄くする */
  faint?: boolean
  /** 右に添える値の書き方 */
  format: (value: number) => string
  focusable: boolean
  onInput: (value: number) => void
  className?: string
}) {
  const position = (v: number) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${(v - min) / (max - min)})`
  return (
    <div className={`group flex h-full items-center gap-2 justify-self-start ${className}`}>
      <div className="relative h-full w-32 max-sm:w-24" style={{'--thumb': `${THUMB}px`}}>
        <div aria-hidden className="absolute inset-x-[calc(var(--thumb)/2)] top-1/2 h-[0.5px] bg-ink/35" />
        <div
          aria-hidden
          className="absolute top-1/2 size-0.5 -translate-1/2 rounded-full bg-ink/70 transition-colors duration-300 group-hover:bg-ink/90"
          style={{left: position(mark)}}
        />
        <div
          aria-hidden
          className={`glow-line absolute top-1/2 size-2 -translate-1/2 rounded-full bg-ink transition-[scale,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-140 group-hover:opacity-100 group-hover:[--glow:var(--glow-hover)] group-has-[input:focus-visible]:scale-150 group-has-[input:focus-visible]:[--glow:var(--glow-hover)] ${faint ? 'opacity-55' : ''}`}
          style={{left: position(value)}}
        />
        <input
          type="range"
          data-slider
          min={min}
          max={max}
          step={step}
          value={value}
          tabIndex={focusable ? 0 : -1}
          aria-label={label}
          onInput={(event) => onInput(Number(event.currentTarget.value))}
          className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
      {/* 値で幅が変わらないよう、最も長い値（-90°、100.0）の幅を取って右にそろえる */}
      <span aria-hidden className={`${LABEL} w-[5ch] text-right tabular-nums`}>
        {format(value)}
      </span>
    </div>
  )
}

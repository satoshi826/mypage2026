import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks'
import {createPortal} from 'preact'
import {GLOW_HOVER} from '../app/glow'
import {useExternal} from '../app/useExternal'
import {MATERIALS, useLogoControls, type Material} from './controls'

const MATERIAL_LABELS: Record<Material, string> = {matte: 'Matte', paper: 'Paper', gloss: 'Gloss'}

// before は指の当たり判定。配置を変えずに 44px を確保する
const ICON_BUTTON = `glow-mark relative flex cursor-pointer transition-[opacity,filter] duration-700 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] ${GLOW_HOVER}`

const subscribe = () => () => {}

/**
 * フッターの左に置くロゴの操作。hero の再生操作と同じ場所に重ね、光がついて hero の再生操作が隠れているあいだだけ出す。
 * ロゴの素材の切り替え（アイコンを押すと上に開く。おまけの操作なので普段は畳んでおく）と、変えたロゴと光の置き方を既定へ
 * 戻す操作（ロゴを動かしたり光を回したりしたあとだけ）。状態と操作は Light が controls.ts に出したものを使う
 */
export function LogoControls() {
  const controls = useLogoControls()
  if (!controls) return null
  const {lit, changed, reset, material, setMaterial} = controls
  const showReset = lit && changed
  return (
    <div
      aria-hidden={!lit}
      className={`flex items-center gap-6 transition-opacity duration-700 max-sm:gap-4 ${lit ? '' : 'pointer-events-none opacity-0'}`}
    >
      <MaterialMenu lit={lit} material={material} setMaterial={setMaterial} />
      <button
        type="button"
        onClick={reset}
        aria-label="Reset"
        aria-hidden={!showReset}
        tabIndex={showReset ? 0 : -1}
        className={`${ICON_BUTTON} ${showReset ? '' : 'pointer-events-none opacity-0'}`}
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

/**
 * ロゴの素材を選ぶ操作。アイコンを押すと、上に素材の名前の列が開く。選んでも閉じない（見比べられるように）。
 * 外を押すか Esc、光が消えると閉じる。開く入れ物は Photos の列数（GalleryTools.tsx）と同じく、フッターの外（body の直下）に描く
 */
function MaterialMenu({
  lit,
  material,
  setMaterial
}: {
  lit: boolean
  material: Material
  setMaterial: (material: Material) => void
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const body = useExternal(subscribe, () => document.body, null)
  // 開く位置。ボタンの上に、左端をそろえて右へ開く（フッターの左に置くので）
  const [at, setAt] = useState({left: 0, bottom: 0})
  useLayoutEffect(() => {
    const place = () => {
      const r = button.current?.getBoundingClientRect()
      if (r) setAt({left: r.left, bottom: innerHeight - r.top + 8})
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
        aria-label="Material"
        aria-expanded={open}
        tabIndex={lit ? 0 : -1}
        onClick={() => setOpen(!open)}
        className={`${ICON_BUTTON} opacity-55 hover:opacity-100 aria-expanded:opacity-100`}
      >
        {/* 光の当たった面。円の半分を塗る */}
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" stroke-width={1.5}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {body &&
        createPortal(
          <div
            ref={menu}
            role="group"
            aria-label="Material"
            aria-hidden={!open}
            style={{left: `${at.left}px`, bottom: `${at.bottom}px`}}
            className={`fixed z-20 flex h-12 gap-6 border border-white/10 bg-black/70 px-4 text-sm tracking-[0.12em] backdrop-blur-[20px] transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] max-sm:gap-4 max-sm:text-xs ${open ? '' : 'pointer-events-none translate-y-1 opacity-0'}`}
          >
            {/* 見た目はフッターのタブ（Tabs.tsx）と同じで、選んでいる素材の文字を光らせる */}
            {MATERIALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMaterial(m)}
                aria-pressed={material === m}
                tabIndex={open ? 0 : -1}
                className={`flex cursor-pointer items-center opacity-75 transition-opacity duration-300 hover:opacity-100! focus-visible:opacity-100! ${GLOW_HOVER} aria-pressed:opacity-90 aria-pressed:[--glow:var(--glow-selected)]`}
              >
                <span className="glow-text transition-[text-shadow] duration-800">{MATERIAL_LABELS[m]}</span>
              </button>
            ))}
          </div>,
          body
        )}
    </>
  )
}

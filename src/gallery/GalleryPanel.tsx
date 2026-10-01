import {LAYOUTS, REVEAL_VARIANTS, type Layout, type RevealVariant} from './options'

const BUTTON = 'cursor-pointer border border-white/25 px-2 py-1 text-inherit'

/** 現れ方と見せ方の候補を切り替える開発用パネル。`import.meta.env.DEV` の中でのみ描画する */
export function GalleryPanel({
  variant,
  onVariant,
  layout,
  onLayout
}: {
  variant: RevealVariant
  onVariant: (v: RevealVariant) => void
  layout: Layout
  onLayout: (l: Layout) => void
}) {
  return (
    <div className="fixed bottom-4 left-4 z-20 flex flex-col gap-2 border border-white/20 bg-black/75 p-2 font-mono text-[11px] leading-tight text-ink">
      <Row label="現れ方" options={REVEAL_VARIANTS} value={variant} onChange={onVariant} />
      <Row label="見せ方" options={LAYOUTS} value={layout} onChange={onLayout} />
    </div>
  )
}

function Row<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 opacity-55">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`${BUTTON} ${o === value ? 'bg-white/25' : 'bg-white/5'}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

import {useEffect, useState} from 'react'

export type SliderParam<T> = {
  key: keyof T & string
  label: string
  min: number
  max: number
  step: number
  hint: string
}

const BUTTON = 'flex-1 cursor-pointer border border-white/25 bg-white/10 p-1 text-inherit'

/**
 * 数値パラメータをスライダーで詰めるための開発用パネル。
 * `import.meta.env.DEV` の中でのみ描画されるので、本番バンドルには入らない。
 *
 * 決まった値は「コードをコピー」で定義の形にして、既定値へ貼り戻す。
 */
export function DevPanel<T extends Record<string, number>>({
  title,
  typeName,
  constName,
  params,
  defaults,
  storageKey,
  onChange
}: {
  title: string
  /** コピーする定義の型注釈と定数名 */
  typeName: string
  constName: string
  params: SliderParam<T>[]
  defaults: T
  storageKey: string
  onChange: (values: T) => void
}) {
  const [values, setValues] = useState<T>(() => load(storageKey, defaults))
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    onChange(values)
    try {
      localStorage.setItem(storageKey, JSON.stringify(values))
    } catch {
      // プライベートウィンドウなどで保存できなくても動作には影響しない
    }
  }, [values, onChange, storageKey])

  const copy = () => {
    const body = params.map(({key}) => `  ${key}: ${values[key]}`).join(',\n')
    navigator.clipboard.writeText(`export const ${constName}: ${typeName} = {\n${body}\n}\n`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="pointer-events-auto flex w-60 flex-col gap-2 border border-white/20 bg-black/75 p-3 font-mono text-[11px] leading-tight text-ink">
      <button type="button" onClick={() => setOpen(!open)} className={`${BUTTON} w-full`}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open && (
        <>
          {params.map(({key, label, min, max, step, hint}) => (
            <label key={key} className="flex flex-col gap-0.5" title={hint}>
              <span className="flex justify-between">
                <span>{label}</span>
                <span className="opacity-60">{values[key]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={values[key]}
                onChange={(e) => setValues({...values, [key]: Number(e.target.value)})}
                className="w-full"
              />
            </label>
          ))}
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => setValues(defaults)} className={BUTTON}>
              既定値
            </button>
            <button type="button" onClick={copy} className={BUTTON}>
              {copied ? 'コピーした' : 'コードをコピー'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function load<T>(storageKey: string, defaults: T): T {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return defaults
    // 保存済みの値にキーが欠けていても既定値で埋める
    return {...defaults, ...(JSON.parse(saved) as Partial<T>)}
  } catch {
    return defaults
  }
}

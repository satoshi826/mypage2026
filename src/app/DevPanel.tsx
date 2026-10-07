import {useEffect, useState} from 'react'

export type Param<T> = {
  key: keyof T & string
  /** 同じ名前が続くぶんを1つの折りたたみにまとめる。省くと常に開いたまま */
  group?: string
  label: string
  hint: string
} & (
  | {min: number; max: number; step: number}
  /** 名前から選ぶ。値は文字列 */
  | {options: readonly string[]}
)

const BUTTON = 'flex-1 cursor-pointer border border-white/25 bg-white/10 p-1 text-inherit'

/**
 * 数値パラメータをスライダーで詰めるための開発用パネル。
 * `import.meta.env.DEV` の中でのみ描画されるので、本番バンドルには入らない。
 *
 * 決まった値は「コードをコピー」で定義の形にして、既定値へ貼り戻す。
 */
export function DevPanel<T extends Record<string, number | string>>({
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
  params: Param<T>[]
  defaults: T
  storageKey: string
  onChange: (values: T) => void
}) {
  const [values, setValues] = useState<T>(() => load(storageKey, defaults))
  const [open, setOpen] = useState(true)
  // グループは畳んだ状態から始める。触るものだけ開いて使う
  const [closed, setClosed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(params.flatMap(({group}) => (group ? [[group, true]] : [])))
  )
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
    const literal = (value: number | string) => (typeof value === 'string' ? `'${value}'` : value)
    const body = params.map(({key}) => `  ${key}: ${literal(values[key])}`).join(',\n')
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
          {groupOf(params).map(({name, items}) => (
            <div key={name ?? ''} className="flex flex-col gap-2">
              {name && (
                <button
                  type="button"
                  onClick={() => setClosed({...closed, [name]: !closed[name]})}
                  className={`${BUTTON} w-full`}
                >
                  {closed[name] ? '▸' : '▾'} {name}
                </button>
              )}
              {(!name || !closed[name]) &&
                items.map((param) => (
                  <label key={param.key} className="flex flex-col gap-0.5" title={param.hint}>
                    <span className="flex justify-between">
                      <span>{param.label}</span>
                      {'options' in param || <span className="opacity-60">{values[param.key]}</span>}
                    </span>
                    {'options' in param ? (
                      <select
                        value={values[param.key]}
                        onChange={(e) => setValues({...values, [param.key]: e.target.value})}
                        className="w-full border border-white/25 bg-black/75 p-0.5 text-inherit"
                      >
                        {param.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={values[param.key]}
                        onChange={(e) => setValues({...values, [param.key]: Number(e.target.value)})}
                        className="w-full"
                      />
                    )}
                  </label>
                ))}
            </div>
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

/** 同じ group が続くぶんをまとめる。並び順はそのまま */
function groupOf<T>(params: Param<T>[]) {
  const groups: {name?: string; items: Param<T>[]}[] = []
  for (const param of params) {
    const last = groups[groups.length - 1]
    if (last && last.name === param.group) last.items.push(param)
    else groups.push({name: param.group, items: [param]})
  }
  return groups
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

import {useEffect, useRef, useState, useSyncExternalStore, type PointerEvent} from 'react'
import {createPortal} from 'react-dom'

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

/** パネルを集めるドックの中の置き場。DevDock が持ち、各 DevPanel がここへ描く */
const DOCK = 'dev-dock-panels'
const noop = () => () => {}

/**
 * 数値パラメータをスライダーで詰めるための開発用パネル。
 * `import.meta.env.DEV` の中でのみ描画されるので、本番バンドルには入らない。
 *
 * どこで描いても、画面に 1 つの DevDock の中に集まる（ページのあちこちに散らばって重ならないように）。
 * 最初は畳んだ状態で、開閉はブラウザに覚える。
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
  const [open, setOpen] = useState(() => load(`${storageKey}.open`, false))
  // ドックはこのパネルより後に描かれることがある。描き終わった時点で読み直されるので、そこで見つかる
  const dock = useSyncExternalStore(
    noop,
    () => document.getElementById(DOCK),
    () => null
  )
  useEffect(() => save(`${storageKey}.open`, open), [open, storageKey])
  // グループは畳んだ状態から始める。触るものだけ開いて使う
  const [closed, setClosed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(params.flatMap(({group}) => (group ? [[group, true]] : [])))
  )
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    onChange(values)
    save(storageKey, values)
  }, [values, onChange, storageKey])

  const copy = () => {
    const literal = (value: number | string) => (typeof value === 'string' ? `'${value}'` : value)
    const body = params.map(({key}) => `  ${key}: ${literal(values[key])}`).join(',\n')
    navigator.clipboard.writeText(`export const ${constName}: ${typeName} = {\n${body}\n}\n`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!dock) return null
  return createPortal(
    <div className="flex flex-col gap-2 border border-white/20 bg-black/75 p-3 font-mono text-[11px] leading-tight text-ink">
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
    </div>,
    dock
  )
}

/**
 * 開発用パネルを集めるドック。見出しをつかんで動かせ、見出しのボタンで全体を畳める。位置と畳み具合は
 * ブラウザに覚える。App が import.meta.env.DEV の中でだけ描く
 */
export function DevDock() {
  const [dock, setDock] = useState(() => load('mypage2026.devDock', {x: 16, y: 64, folded: false}))
  const drag = useRef<{dx: number; dy: number} | null>(null)
  useEffect(() => save('mypage2026.devDock', dock), [dock])

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {dx: event.clientX - dock.x, dy: event.clientY - dock.y}
  }
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    // 横はドック全体、縦は見出しが画面に収まる範囲で動かす
    const width = event.currentTarget.parentElement!.offsetWidth
    const x = Math.min(Math.max(0, event.clientX - drag.current.dx), Math.max(0, innerWidth - width))
    const y = Math.min(Math.max(0, event.clientY - drag.current.dy), innerHeight - event.currentTarget.offsetHeight)
    setDock({...dock, x, y})
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <div
      style={{left: dock.x, top: dock.y}}
      className="fixed z-50 flex w-64 flex-col border border-white/25 bg-black/80 font-mono text-[11px] leading-tight text-ink"
    >
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="flex cursor-move touch-none items-center justify-between bg-white/10 px-2 py-1 select-none"
      >
        <span>開発用</span>
        <button
          type="button"
          onClick={() => setDock({...dock, folded: !dock.folded})}
          className="cursor-pointer px-1 text-inherit"
        >
          {dock.folded ? '▸ 開く' : '▾ 畳む'}
        </button>
      </div>
      <div
        id={DOCK}
        className={`flex max-h-[calc(100svh-8rem)] flex-col gap-2 overflow-y-auto p-2 ${dock.folded ? 'hidden' : ''}`}
      />
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
    const value = JSON.parse(saved) as T
    // 保存済みの値にキーが欠けていても既定値で埋める
    return typeof defaults === 'object' && defaults ? {...defaults, ...value} : value
  } catch {
    return defaults
  }
}

function save(storageKey: string, value: unknown) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで保存できなくても動作には影響しない
  }
}

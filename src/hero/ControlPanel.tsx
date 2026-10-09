import {useLayoutEffect, useRef} from 'react'
import {layoutVars, type Layout} from './layout'

const label = (index: number) => String(index + 1).padStart(2, '0')

/**
 * 写真に添える操作面。カレンダー状に並べた番号。
 * 再生操作と次までのプログレスはフッターにある（HeroPlayer.tsx）。
 * 選択中の1枚は丸で囲み、その丸が数字から数字へ移動する。
 *
 * 幅は呼び出し側が決める。マスは列数で等分するので、横並びでも縦並びでも
 * 同じ作りで、並べ方をこのコンポーネントは知らない。
 */
export function ControlPanel({
  count,
  available,
  index,
  layout,
  width,
  onSelect
}: {
  /** 写真の枚数。カレンダーの番号はこの数だけ並ぶ */
  count: number
  /** 読み込みが済んだ番号。それ以外は薄く出し、押せない */
  available: readonly number[]
  index: number
  layout: Layout
  /** パネルの幅 px。カレンダーはこの幅を列数で等分する */
  width: number
  onSelect: (index: number) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const loaded = new Set(available)

  // 丸を選択中のマスへ移動させる。マスは幅で決まるので、大きさも位置も実測する
  useLayoutEffect(() => {
    const move = () => {
      const item = listRef.current?.children[index] as HTMLElement | undefined
      const marker = markerRef.current
      if (!item || !marker) return
      // 丸はマスより大きいので、はみ出すぶんの半分だけ戻して中心を合わせる
      const inset = layout.markerGrow / 2
      marker.style.width = marker.style.height = `${item.offsetWidth + layout.markerGrow}px`
      marker.style.transform = `translate(${item.offsetLeft - inset}px, ${item.offsetTop - inset}px)`
    }
    move()
    const observer = new ResizeObserver(move)
    if (listRef.current) observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [index, layout.markerGrow])

  return (
    <div className="shrink-0" style={{...layoutVars(layout), width}}>
      <div className="relative">
        <div
          ref={markerRef}
          aria-hidden
          className="pointer-events-none absolute rounded-full transition-transform ease-out [border-color:var(--marker-line)] [border-width:var(--marker-border)] [transition-duration:var(--marker-duration)]"
        />
        <ol
          ref={listRef}
          className="m-0 grid p-0 [column-gap:var(--gap-x)] [row-gap:var(--gap-y)] [grid-template-columns:repeat(var(--cols),1fr)]"
        >
          {Array.from({length: count}, (_, i) => (
            <li key={i} className="aspect-square list-none">
              {/* translate は数字の見た目の中心をマスの中心に合わせるためのもの。
                  縦は F1.8 の ascent 0.94em / descent 0.26em に対して数字の高さが
                  0.84em しかないぶん（(0.94-0.26)/2 - 0.84/2 = -0.08em）、横は
                  字間 0.1em が最後の数字のうしろにも入るぶん（0.05em）を戻す */}
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={i === index}
                disabled={!loaded.has(i)}
                className={`flex size-full items-center justify-center font-number tracking-[0.1em] lining-nums transition-opacity duration-300 text-(length:--number-size) [translate:0.05em_0.08em] enabled:cursor-pointer enabled:hover:opacity-70 ${
                  i === index
                    ? 'opacity-100'
                    : loaded.has(i)
                      ? '[opacity:var(--idle-opacity)]'
                      : '[opacity:calc(var(--idle-opacity)*0.3)]'
                }`}
              >
                {label(i)}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

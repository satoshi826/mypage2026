import type {Photo} from '../photos'

/** 写真のあいだ px */
export const GAP = 16

export type Placed = {x: number; y: number; w: number; h: number}
export type Layout = {items: Map<string, Placed>; height: number}

/** 広げている写真。幅は px で、列の幅から容器の全幅まで連続に取れる */
export type Expansion = {file: string; width: number}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * 段組を計算する。各写真を順に、いちばん上が空いている列（同じなら左）へ置く。
 * 位置は純粋に (写真, 幅, 列数, 広げている写真) から決まり、DOM を見ない。
 *
 * 広げる写真は幅を自由に取れる。元の列の中心を保ったまま広げ、容器に収める。
 * 覆う列すべての下に置き、覆った列の上端を揃えて進めるので、覆わなかった列には
 * 後ろの写真が入る。幅をどこで止めても、残りはその下と横へ自然に詰まる。
 *
 * 広げている写真は何枚でもよく、広げた順に 1 枚ずつ足していく。足すたびに、その時点の段組で
 * 広げる写真より上にあった写真（y が小さいもの）は先に置いて動かさず、同じ高さと下の写真は
 * あとに回す（docs/design.md の連続性: 影響は下へだけ伝える）。
 */
export function layout(photos: Photo[], width: number, cols: number, expansions: Expansion[] = []): Layout {
  const colW = (width - GAP * (cols - 1)) / cols
  const colX = (c: number) => c * (colW + GAP)

  /** 置く順と、広げている写真の位置（x と幅）から段組を作る */
  const arrange = (order: Photo[], spans: Map<string, {x: number; w: number}>): Layout => {
    const tops = Array.from({length: cols}, () => 0)
    const items = new Map<string, Placed>()
    const lowest = () => {
      let c = 0
      for (let i = 1; i < cols; i++) if (tops[i] < tops[c] - 0.5) c = i
      return c
    }
    for (const photo of order) {
      const span = spans.get(photo.file)
      // 広げている写真は覆う列すべての下、ほかはいちばん上が空いている列へ
      const covered = span
        ? tops.map((_, c) => c).filter((c) => colX(c) < span.x + span.w - 0.5 && colX(c) + colW > span.x + 0.5)
        : [lowest()]
      const {x, w} = span ?? {x: colX(covered[0]), w: colW}
      const y = Math.max(...covered.map((c) => tops[c]))
      const h = (w * photo.h) / photo.w
      items.set(photo.file, {x, y, w, h})
      for (const c of covered) tops[c] = y + h + GAP
    }
    return {items, height: Math.max(0, ...tops) - GAP}
  }

  let order = photos
  const spans = new Map<string, {x: number; w: number}>()
  for (const expansion of expansions) {
    const target = order.find((p) => p.file === expansion.file)
    if (!target) continue
    const before = arrange(order, spans)
    const origin = before.items.get(target.file)!
    const above: Photo[] = []
    const rest: Photo[] = []
    let passed = false
    for (const photo of order) {
      if (photo === target) passed = true
      else if (!passed && before.items.get(photo.file)!.y < origin.y - 0.5) above.push(photo)
      else rest.push(photo)
    }
    order = [...above, target, ...rest]
    const w = clamp(expansion.width, colW, width)
    spans.set(target.file, {x: clamp(origin.x + origin.w / 2 - w / 2, 0, width - w), w})
  }
  return arrange(order, spans)
}

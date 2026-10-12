import type {Photo} from '../photos'
import type {Spacing} from './tuning'

export type Placed = {x: number; y: number; w: number; h: number}
export type Layout = {items: Map<string, Placed>; height: number}

/** 広げている写真。幅は px で、列の幅から容器の全幅まで連続に取れる */
export type Expansion = {file: string; width: number}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * 写真のあいだ px。写真 1 枚の幅に比例させ、列が増えて写真が小さくなるほど狭くする。固定にすると、
 * 列の多いときに隙間が写真に対して太く見えるため。
 * 写真の幅は隙間で決まるので、gap = ratio × (width − gap × (cols − 1)) / cols を gap について解いてから範囲に収める
 */
export function gapFor(width: number, cols: number, {gapRatio, gapMin, gapMax}: Spacing) {
  return clamp((gapRatio * width) / (cols + gapRatio * (cols - 1)), gapMin, gapMax)
}

/**
 * 段組を計算する。各写真を順に、いちばん上が空いている列（同じなら左）へ置く。
 * 位置は純粋に (写真, 幅, 列数, 広げている写真) から決まり、DOM を見ない。
 *
 * 広げる写真は 1 枚だけで、幅を自由に取れる。元の列の中心を保ったまま広げ、容器に収める。
 * 覆う列すべての下に置き、覆った列の上端を揃えて進めるので、覆わなかった列には
 * 後ろの写真が入る。幅をどこで止めても、残りはその下と横へ自然に詰まる。
 * 広げない段組で広げる写真より上にあった写真（y が小さいもの）は先に置いて動かさず、同じ高さと
 * 下の写真はあとに回す（docs/design.md の連続性: 影響は下へだけ伝える）。
 */
export function layout(
  photos: Photo[],
  width: number,
  cols: number,
  gap: number,
  expansion: Expansion | null = null
): Layout {
  const colW = (width - gap * (cols - 1)) / cols
  const colX = (c: number) => c * (colW + gap)

  /** 置く順と、広げている写真の位置（x と幅）から段組を作る */
  const arrange = (order: Photo[], span: {file: string; x: number; w: number} | null): Layout => {
    const tops = Array.from({length: cols}, () => 0)
    const items = new Map<string, Placed>()
    const lowest = () => {
      let c = 0
      for (let i = 1; i < cols; i++) if (tops[i] < tops[c] - 0.5) c = i
      return c
    }
    for (const photo of order) {
      const wide = span?.file === photo.file ? span : null
      // 広げている写真は覆う列すべての下、ほかはいちばん上が空いている列へ
      const covered = wide
        ? tops.map((_, c) => c).filter((c) => colX(c) < wide.x + wide.w - 0.5 && colX(c) + colW > wide.x + 0.5)
        : [lowest()]
      const {x, w} = wide ?? {x: colX(covered[0]), w: colW}
      const y = Math.max(...covered.map((c) => tops[c]))
      const h = (w * photo.h) / photo.w
      items.set(photo.file, {x, y, w, h})
      for (const c of covered) tops[c] = y + h + gap
    }
    return {items, height: Math.max(0, ...tops) - gap}
  }

  const target = expansion && photos.find((p) => p.file === expansion.file)
  if (!expansion || !target) return arrange(photos, null)
  const before = arrange(photos, null)
  const origin = before.items.get(target.file)!
  const above: Photo[] = []
  const rest: Photo[] = []
  let passed = false
  for (const photo of photos) {
    if (photo === target) passed = true
    else if (!passed && before.items.get(photo.file)!.y < origin.y - 0.5) above.push(photo)
    else rest.push(photo)
  }
  const w = clamp(expansion.width, colW, width)
  const x = clamp(origin.x + origin.w / 2 - w / 2, 0, width - w)
  return arrange([...above, target, ...rest], {file: target.file, x, w})
}

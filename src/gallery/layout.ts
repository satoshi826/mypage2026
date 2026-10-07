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
 * 広げる写真より上にあった写真（素の段組で y が小さいもの）は先に置いて動かさず、
 * 同じ高さと下の写真はあとに回す（docs/design.md の連続性: 影響は下へだけ伝える）。
 */
export function layout(photos: Photo[], width: number, cols: number, expansion: Expansion | null = null): Layout {
  const colW = (width - GAP * (cols - 1)) / cols
  const colX = (c: number) => c * (colW + GAP)
  const tops = Array.from({length: cols}, () => 0)
  const items = new Map<string, Placed>()

  const place = (photo: Photo, x: number, w: number, covered: number[]) => {
    const y = Math.max(...covered.map((c) => tops[c]))
    const h = (w * photo.h) / photo.w
    items.set(photo.file, {x, y, w, h})
    for (const c of covered) tops[c] = y + h + GAP
  }
  const placeInColumn = (photo: Photo) => {
    let c = 0
    for (let i = 1; i < cols; i++) if (tops[i] < tops[c] - 0.5) c = i
    place(photo, colX(c), colW, [c])
  }
  const done = () => ({items, height: Math.max(0, ...tops) - GAP})

  const target = expansion && photos.find((p) => p.file === expansion.file)
  if (!expansion || !target) {
    for (const photo of photos) placeInColumn(photo)
    return done()
  }

  // 素の段組で「上にあった写真」を決める
  const base = layout(photos, width, cols)
  const origin = base.items.get(target.file)!
  const above = new Set<string>()
  for (const photo of photos) {
    if (photo === target) break
    if (base.items.get(photo.file)!.y < origin.y - 0.5) above.add(photo.file)
  }

  for (const photo of photos) if (above.has(photo.file)) placeInColumn(photo)

  const w = clamp(expansion.width, colW, width)
  const x = clamp(origin.x + origin.w / 2 - w / 2, 0, width - w)
  const covered = Array.from({length: cols}, (_, c) => c).filter(
    (c) => colX(c) < x + w - 0.5 && colX(c) + colW > x + 0.5
  )
  place(target, x, w, covered)

  for (const photo of photos) if (photo !== target && !above.has(photo.file)) placeInColumn(photo)
  return done()
}

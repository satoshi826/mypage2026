import {ease} from '../app/stage'
import {LOGO_HEIGHT, LOGO_RECTS} from './logo'

// ロゴの形を動かす遊び（Logo の入れ物の Motion）。どの動きもループし、ロゴの長方形 7 つの位置と大きさだけを動かす。
// 長方形のままなので、光線との当たりは今までどおり式で求まる（scene.ts）。長方形の並びは左から、柱 4 本（0, 2, 4, 6 番）と、
// そのあいだで切り込みの上や下に残る部分 3 つ（1, 3, 5 番。1 と 3 は下から、5 は上からの切り込み）。値は格子の単位

/** 長方形 1 つ。[左, 上, 右, 下] */
export type Rect = readonly [number, number, number, number]
export type Shape = readonly Rect[]

export const LOGO_SHAPE: Shape = LOGO_RECTS

/** ループする動き */
export const LOOPS = ['cut', 'open', 'wave', 'line'] as const
export type Loop = (typeof LOOPS)[number]

/** 選べる動き。still は動かさず、random はループする動きを 1 周ずつ、ランダムな順に次々流す */
export const MOTIONS = ['still', ...LOOPS, 'random'] as const
export type Motion = (typeof MOTIONS)[number]

/** 動きの 1 周の秒数 */
export const PERIOD: Record<Loop, number> = {cut: 3.6, open: 3.2, wave: 2.4, line: 3.4}

/** random で、今の動きの次に流す動き。続けて同じ動きにしない */
export function nextLoop(current: Loop | null): Loop {
  const candidates = LOOPS.filter((loop) => loop !== current)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 入り始めが速く、奥でゆっくり止まる */
const settle = (v: number) => 1 - (1 - clamp01(v)) ** 4

/**
 * 1 周のうち、ロゴから形が変わって戻る山。0.1〜0.4 で 0 → 1 へ移り、0.6〜0.9 で 1 → 0 へ戻る。あいだは止まる。
 * 周の始めと終わりはロゴなので、ループしても、次の動きへ移っても形が跳ばない
 */
const pulse = (phase: number) => (phase < 0.5 ? ease((phase - 0.1) / 0.3) : 1 - ease((phase - 0.6) / 0.3))

const CUT_BANDS = [1, 3, 5]

/** 切り込みの入り具合（3 本それぞれ 0〜1。0 で白い面、1 でロゴ）の形。切り込みのある列の長方形を、面の高さいっぱいから縮める */
function cutShape(cuts: readonly number[]): Shape {
  return LOGO_SHAPE.map(([left, top, right, bottom], i) => {
    const k = CUT_BANDS.indexOf(i)
    if (k < 0) return [left, top, right, bottom]
    const p = cuts[k]
    return [left, top * p, right, LOGO_HEIGHT + (bottom - LOGO_HEIGHT) * p]
  })
}

const shifted = ([left, top, right, bottom]: Rect, x: number, y: number): Rect => [
  left + x,
  top + y,
  right + x,
  bottom + y
]
const centerOf = ([left, top, right, bottom]: Rect) => ({x: (left + right) / 2, y: (top + bottom) / 2})

/** 動き始めてから seconds 秒の形 */
export function shapeAt(motion: Loop | 'still', seconds: number): Shape {
  if (motion === 'still') return LOGO_SHAPE
  const period = PERIOD[motion]
  const time = seconds % period
  const phase = time / period
  switch (motion) {
    // 切り込みを閉じて白い面にし、左から順に、刃が入るように切り込みを入れ直す
    case 'cut': {
      const closed = ease(time / 0.5)
      const cuts = CUT_BANDS.map((_, k) => (time < 0.5 ? 1 - closed : settle((time - 0.8 - k * 0.25) / 0.7)))
      return cutShape(cuts)
    }
    // 絞りのように、切り込みが奥まで開いて 5 本の柱に分かれ、柱のあいだが広がってから閉じる
    case 'open': {
      const a = pulse(phase)
      // 切り込みの深さ 18 を、面の高さ 22 まで伸ばすと、あいだの部分がなくなる
      const open = cutShape(CUT_BANDS.map(() => 1 + (a * 4) / 18))
      // 柱 j（0〜3）は中央から外へ。あいだの部分は両隣の柱の真ん中に付いていく
      const spread = (i: number) => (i / 2 - 1.5) * 2.5 * a
      return open.map((rect, i) => shifted(rect, spread(i), 0))
    }
    // 柱とあいだの部分が、左から右へ流れる波に乗って上下する
    case 'wave': {
      return LOGO_SHAPE.map((rect) => shifted(rect, 0, Math.sin(phase * Math.PI * 2 - centerOf(rect).x * 0.35) * 2.5))
    }
    // 面が左から順に細い線へ痩せ、また面に戻る。ずらす量は、最後の面が周の終わり（0.9 + ずれ < 1）までに戻りきる大きさ
    case 'line': {
      return LOGO_SHAPE.map(([left, top, right, bottom], i) => {
        const thin = pulse(phase - i * 0.015)
        const {x} = centerOf([left, top, right, bottom])
        const half = ((right - left) / 2) * (1 - thin) + 0.25 * thin
        return [x - half, top, x + half, bottom]
      })
    }
  }
}

/** 2 つの形のあいだ。w が 0 で a、1 で b */
export function between(a: Shape, b: Shape, w: number): Shape {
  return a.map((rect, i) => rect.map((v, k) => v + (b[i][k] - v) * w) as unknown as Rect)
}

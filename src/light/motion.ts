import {ease} from '../app/stage'
import {LOGO_HEIGHT, LOGO_RECTS, LOGO_WIDTH} from './logo'

// ロゴの形を動かす遊び（Logo の入れ物の Motion）。どの動きもループする。
// 形は、ロゴの長方形 7 つ（位置と大きさと傾き）と、円 DOTS 個（中心と半径。ふだんは半径 0 で見えない）でできている。
// どちらも光線との当たりを式で一発で求められる（scene.ts）。長方形の並びは左から、柱 4 本（0, 2, 4, 6 番）と、
// そのあいだで切り込みの上や下に残る部分 3 つ（1, 3, 5 番。1 と 3 は下から、5 は上からの切り込み）。値は格子の単位

/** 長方形 1 つ。傾けていない形の [左, 上, 右, 下] と、中心のまわりの傾き（ラジアン、時計回りが正） */
export type Rect = readonly [number, number, number, number, number]
/** 円 1 つ。[中心の x, 中心の y, 半径]。半径 0 なら光線は当たらない */
export type Dot = readonly [number, number, number]
export type Shape = {readonly rects: readonly Rect[]; readonly dots: readonly Dot[]}

const centerOf = ([left, top, right, bottom]: readonly number[]) => ({x: (left + right) / 2, y: (top + bottom) / 2})

/** 円の数。長方形 1 つにつき 2 つ（上下に 1/4 ずつ寄せた位置）を、ふだんの置き場所にする */
const DOT_ANCHORS: readonly Dot[] = LOGO_RECTS.flatMap(([left, top, right, bottom]) => {
  const {x} = centerOf([left, top, right, bottom])
  return [
    [x, top + (bottom - top) * 0.25, 0],
    [x, top + (bottom - top) * 0.75, 0]
  ] as const
})
export const DOTS = DOT_ANCHORS.length

export const LOGO_SHAPE: Shape = {
  rects: LOGO_RECTS.map(([left, top, right, bottom]) => [left, top, right, bottom, 0]),
  dots: DOT_ANCHORS
}

/** ループする動き。入れ物にはこの順に、似た動きをまとめて並べる */
export const LOOPS = [
  'cut',
  'open',
  'wave',
  'line',
  'swap',
  'bars',
  'spin',
  'twist',
  'swing',
  'orbit',
  'fan',
  'tumble',
  'star',
  'dots',
  'ring',
  'flower',
  'cradle',
  'orb',
  'spiral',
  'atom'
] as const
export type Loop = (typeof LOOPS)[number]

/** 選べる動き。still は動かさず、cycle はループする動きを 1 周ずつ、CYCLE の順に次々流す */
export const MOTIONS = ['still', ...LOOPS, 'cycle'] as const
export type Motion = (typeof MOTIONS)[number]

/** 動きの 1 周の秒数 */
export const PERIOD: Record<Loop, number> = {
  cut: 3.6,
  open: 3.2,
  wave: 2.4,
  line: 3.4,
  swap: 3.2,
  spin: 3.2,
  twist: 3.4,
  swing: 2.8,
  orbit: 3.6,
  fan: 3.2,
  dots: 3.4,
  ring: 5,
  flower: 5,
  cradle: 4.4,
  orb: 3.6,
  bars: 4,
  tumble: 3.6,
  star: 4.4,
  spiral: 5,
  atom: 5
}

/**
 * cycle で流す順。似た動きが続かないよう、長方形のまま形を変える動き・円になる動き・回る動きを順に混ぜる
 */
const CYCLE: readonly Loop[] = [
  'cut',
  'ring',
  'spin',
  'open',
  'dots',
  'twist',
  'wave',
  'flower',
  'swing',
  'line',
  'cradle',
  'orbit',
  'swap',
  'orb',
  'fan',
  'bars',
  'spiral',
  'tumble',
  'atom',
  'star'
]

/** cycle で、今の動きの次に流す動き。最初は CYCLE の先頭 */
export const nextLoop = (current: Loop | null): Loop =>
  current === null ? CYCLE[0] : CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 入り始めが速く、奥でゆっくり止まる */
const settle = (v: number) => 1 - (1 - clamp01(v)) ** 4

/**
 * 1 周のうち、ロゴから形が変わって戻る山。0.1〜0.4 で 0 → 1 へ移り、0.6〜0.9 で 1 → 0 へ戻る。あいだは止まる。
 * 周の始めと終わりはロゴなので、ループしても、次の動きへ移っても形が跳ばない
 */
const pulse = (phase: number) => (phase < 0.5 ? ease((phase - 0.1) / 0.3) : 1 - ease((phase - 0.6) / 0.3))

/** ロゴの中心 */
const CENTER = {x: LOGO_WIDTH / 2, y: LOGO_HEIGHT / 2}

const CUT_BANDS = [1, 3, 5]

/** 長方形だけを動かす形。円は置き場所で半径 0 のまま */
const rectsOnly = (rects: readonly Rect[]): Shape => ({rects, dots: DOT_ANCHORS})

/** 切り込みの入り具合（3 本それぞれ 0〜1。0 で白い面、1 でロゴ）の長方形。切り込みのある列の長方形を、面の高さいっぱいから縮める */
function cutRects(cuts: readonly number[]): readonly Rect[] {
  return LOGO_SHAPE.rects.map((rect, i) => {
    const k = CUT_BANDS.indexOf(i)
    if (k < 0) return rect
    const [left, top, right, bottom, angle] = rect
    const p = cuts[k]
    return [left, top * p, right, LOGO_HEIGHT + (bottom - LOGO_HEIGHT) * p, angle]
  })
}

const shifted = ([left, top, right, bottom, angle]: Rect, x: number, y: number): Rect => [
  left + x,
  top + y,
  right + x,
  bottom + y,
  angle
]

/** 長方形を、点 pivot のまわりに s 倍に縮める（位置も大きさも） */
const shrunkToward = (rect: Rect, s: number, pivot: {x: number; y: number}): Rect => {
  const [left, top, right, bottom, angle] = rect
  const x = (v: number) => pivot.x + (v - pivot.x) * s
  const y = (v: number) => pivot.y + (v - pivot.y) * s
  return [x(left), y(top), x(right), y(bottom), angle]
}

/** 長方形を、点 pivot のまわりに angle だけ回す。中心が弧を描いて動き、長方形も同じだけ傾く */
const turnedAbout = (rect: Rect, angle: number, pivot: {x: number; y: number}): Rect => {
  const {x, y} = centerOf(rect)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = x - pivot.x
  const dy = y - pivot.y
  const moved = shifted(rect, pivot.x + dx * cos - dy * sin - x, pivot.y + dx * sin + dy * cos - y)
  return [moved[0], moved[1], moved[2], moved[3], rect[4] + angle]
}

/** 長方形を、自分の中心のまわりに angle だけ傾ける */
const tilted = (rect: Rect, angle: number): Rect => [rect[0], rect[1], rect[2], rect[3], rect[4] + angle]

/** 円の置き場所。中心と直径 */
type Spot = {x: number; y: number; size: number}

/**
 * 長方形 i を、w（0〜1）だけ spot の円へ変える。前半で spot の大きさの正方形へ寄り、後半でその角が取れて円になる。
 * 円は正方形に内接する大きさで中に隠しておき、正方形を円に内接する大きさまで縮めると、角だけが丸く削れていく
 */
function morphed(i: number, spot: Spot, w: number): {rect: Rect; dot: Dot} {
  const rect = LOGO_SHAPE.rects[i]
  const [left, top, right, bottom, angle] = rect
  const move = ease(w / 0.5)
  const round = ease((w - 0.5) / 0.5)
  const from = centerOf(rect)
  const x = from.x + (spot.x - from.x) * move
  const y = from.y + (spot.y - from.y) * move
  const reach = spot.size / 2
  const width = (right - left) / 2 + (reach - (right - left) / 2) * move
  const height = (bottom - top) / 2 + (reach - (bottom - top) / 2) * move
  const corner = 1 - (1 - Math.SQRT1_2) * round
  return {
    rect: [x - width * corner, y - height * corner, x + width * corner, y + height * corner, angle * (1 - move)],
    dot: [x, y, Math.min(width, height) * clamp01(w * 10)]
  }
}

/**
 * 7 つの面を円に変えて spotOf(i) に並べ、ロゴに戻す 1 周。0.05〜0.3 で円になって並び、0.7〜0.95 でロゴに戻る。
 * 円は面 1 つにつき 1 つ（その面の置き場所の 1 つ目）を使う。並んでいるあいだの動きは spotOf が phase で決める
 */
function formation(phase: number, spotOf: (i: number) => Spot): Shape {
  const w = phase < 0.5 ? ease((phase - 0.05) / 0.25) : 1 - ease((phase - 0.7) / 0.25)
  const pieces = LOGO_SHAPE.rects.map((_, i) => morphed(i, spotOf(i), w))
  return {
    rects: pieces.map(({rect}) => rect),
    dots: DOT_ANCHORS.map((anchor, k) => (k % 2 === 0 ? pieces[k / 2].dot : anchor))
  }
}

/** 長方形の置き場所。中心と幅と高さと傾き */
type Slot = {x: number; y: number; width: number; height: number; angle: number}

/**
 * 7 つの面を、形を保ったまま（円にせず）slotOf(i) の長方形に変えて並べ、ロゴに戻す 1 周。並び方と戻り方は formation と同じ
 */
function rectFormation(phase: number, slotOf: (i: number) => Slot): Shape {
  const w = ease(phase < 0.5 ? (phase - 0.05) / 0.25 : 1 - (phase - 0.7) / 0.25)
  return rectsOnly(
    LOGO_SHAPE.rects.map((rect, i) => {
      const [left, top, right, bottom] = rect
      const slot = slotOf(i)
      const from = centerOf(rect)
      const mix = (a: number, b: number) => a + (b - a) * w
      const x = mix(from.x, slot.x)
      const y = mix(from.y, slot.y)
      const width = mix(right - left, slot.width) / 2
      const height = mix(bottom - top, slot.height) / 2
      return [x - width, y - height, x + width, y + height, turnBetween(0, slot.angle) * w]
    })
  )
}

/** 動き始めてから seconds 秒の形 */
export function shapeAt(motion: Loop | 'still', seconds: number): Shape {
  if (motion === 'still') return LOGO_SHAPE
  const period = PERIOD[motion]
  const time = seconds % period
  const phase = time / period
  const {rects} = LOGO_SHAPE
  switch (motion) {
    // 切り込みを閉じて白い面にし、左から順に、刃が入るように切り込みを入れ直す
    case 'cut': {
      const closed = ease(time / 0.5)
      return rectsOnly(
        cutRects(CUT_BANDS.map((_, k) => (time < 0.5 ? 1 - closed : settle((time - 0.8 - k * 0.25) / 0.7))))
      )
    }
    // 絞りのように、切り込みが奥まで開いて 5 本の柱に分かれ、柱のあいだが広がってから閉じる
    case 'open': {
      const a = pulse(phase)
      // 切り込みの深さ 18 を、面の高さ 22 まで伸ばすと、あいだの部分がなくなる
      const open = cutRects(CUT_BANDS.map(() => 1 + (a * 4) / 18))
      // 柱 j（0〜3）は中央から外へ。あいだの部分は両隣の柱の真ん中に付いていく
      return rectsOnly(open.map((rect, i) => shifted(rect, (i / 2 - 1.5) * 2.5 * a, 0)))
    }
    // 柱とあいだの部分が、左から右へ流れる波に乗って上下する
    case 'wave':
      return rectsOnly(
        rects.map((rect) => shifted(rect, 0, Math.sin(phase * Math.PI * 2 - centerOf(rect).x * 0.35) * 2.5))
      )
    // 面が左から順に細い線へ痩せ、また面に戻る。ずらす量は、最後の面が周の終わり（0.9 + ずれ < 1）までに戻りきる大きさ
    case 'line':
      return rectsOnly(
        rects.map((rect, i) => {
          const [left, top, right, bottom, angle] = rect
          const thin = pulse(phase - i * 0.015)
          const {x} = centerOf(rect)
          const reach = ((right - left) / 2) * (1 - thin) + 0.25 * thin
          return [x - reach, top, x + reach, bottom, angle]
        })
      )
    // 切り込みの上や下に残る部分が反対の端へ滑り、上下を返した形になってから戻る
    case 'swap': {
      const a = pulse(phase)
      return rectsOnly(
        rects.map((rect, i) => {
          if (i % 2 === 0) return rect
          const travel = LOGO_HEIGHT - (rect[3] - rect[1])
          return shifted(rect, 0, (rect[1] === 0 ? travel : -travel) * a)
        })
      )
    }
    // ロゴ全体が中心のまわりに 1 回転して止まる。走り出しと止まり際がなめらか
    case 'spin': {
      const angle = Math.PI * 2 * ease((phase - 0.1) / 0.75)
      return rectsOnly(rects.map((rect) => turnedAbout(rect, angle, CENTER)))
    }
    // 柱とあいだの部分が、左から順に自分の中心のまわりを半回転する。途中で横倒しになり、元の向きで止まる
    case 'twist':
      return rectsOnly(rects.map((rect, i) => tilted(rect, Math.PI * ease((phase - 0.08 - i * 0.05) / 0.5))))
    // 振り子のように、ロゴの上の点を支点に左右へ揺れる。揺れ幅は周の始めと終わりで 0
    case 'swing': {
      const angle = 0.45 * Math.sin(Math.PI * 2 * phase) * Math.sin(Math.PI * phase)
      return rectsOnly(rects.map((rect) => turnedAbout(rect, angle, {x: CENTER.x, y: -10})))
    }
    // 面がそれぞれ小さな円を描いて回り、元の場所へ戻る。回り始めをずらして渦のように見せる
    case 'orbit': {
      const radius = 3 * Math.sin(Math.PI * phase)
      return rectsOnly(
        rects.map((rect, i) => {
          const start = (i / rects.length) * Math.PI * 2
          const turn = Math.PI * 2 * phase + start
          return shifted(rect, radius * (Math.cos(turn) - Math.cos(start)), radius * (Math.sin(turn) - Math.sin(start)))
        })
      )
    }
    // 下の点を要に、面が扇のように左右へ開いて閉じる
    case 'fan': {
      const a = pulse(phase)
      return rectsOnly(
        rects.map((rect) =>
          turnedAbout(rect, ((centerOf(rect).x - CENTER.x) / CENTER.x) * 0.5 * a, {x: CENTER.x, y: LOGO_HEIGHT + 6})
        )
      )
    }
    // 面が縮んで、1 つにつき 2 つの丸い粒になり、また面に戻る
    case 'dots': {
      const a = pulse(phase)
      return {
        rects: rects.map((rect) => shrunkToward(rect, 1 - a, centerOf(rect))),
        dots: DOT_ANCHORS.map(([x, y], k) => {
          const [left, top, right, bottom] = rects[Math.floor(k / 2)]
          return [x, y, a * Math.min(right - left, (bottom - top) / 2) * 0.65]
        })
      }
    }
    // 7 つの面が同じ大きさの円になって、等しい間隔で輪に並び、輪ごと 1 回転してからロゴに戻る
    case 'ring': {
      const turn = Math.PI * 2 * ease((phase - 0.3) / 0.4)
      return formation(phase, (i) => {
        const angle = -Math.PI / 2 + (i / LOGO_SHAPE.rects.length) * Math.PI * 2 + turn
        return {x: CENTER.x + 8.5 * Math.cos(angle), y: CENTER.y + 8.5 * Math.sin(angle), size: 4.6}
      })
    }
    // 7 つの円が、真ん中の 1 つを 6 つが少し離れて囲む花の形に集まり、1 回転してからロゴに戻る。左の面は左側の花びらへ、右の面は右側へ
    case 'flower': {
      const turn = Math.PI * 2 * ease((phase - 0.3) / 0.4)
      const petals = [150, 210, 270, null, 330, 30, 90]
      return formation(phase, (i) => {
        const degrees = petals[i]
        if (degrees === null) return {x: CENTER.x, y: CENTER.y, size: 5.4}
        const angle = (degrees / 180) * Math.PI + turn
        return {x: CENTER.x + 10 * Math.cos(angle), y: CENTER.y + 10 * Math.sin(angle), size: 5.4}
      })
    }
    // 7 つの円が横一列に並び、左から右へ流れる波に乗って弾んでからロゴに戻る
    case 'cradle': {
      const swing = Math.sin(Math.PI * clamp01((phase - 0.3) / 0.4))
      return formation(phase, (i) => ({
        x: 1.8 + i * 3.4,
        y: CENTER.y - 3 * swing * Math.abs(Math.sin(Math.PI * 4 * phase - i * 0.7)),
        size: 3.2
      }))
    }
    // 7 つの面が円になって中心に重なり、1 つの大きな丸になってからロゴに戻る
    case 'orb':
      return formation(phase, () => ({x: CENTER.x, y: CENTER.y, size: 18}))
    // 7 つの面が同じ太さの横棒になって縦に積み重なり、1 本おきに左右へずれてから戻る
    case 'bars': {
      const slide = Math.sin(Math.PI * clamp01((phase - 0.3) / 0.4))
      return rectFormation(phase, (i) => ({
        x: CENTER.x + (i % 2 === 0 ? -1 : 1) * 3 * slide,
        y: CENTER.y + (i - 3) * 3,
        width: 18,
        height: 1.8,
        angle: 0
      }))
    }
    // 面が左から順に、右下の角を軸にドミノのように右へ倒れ、右から順に起き上がる
    case 'tumble':
      return rectsOnly(
        LOGO_SHAPE.rects.map((rect, i) => {
          const fall =
            phase < 0.5 ? ease((phase - 0.08 - i * 0.04) / 0.18) : 1 - ease((phase - 0.6 - (6 - i) * 0.04) / 0.18)
          return turnedAbout(rect, 0.55 * fall, {x: rect[2], y: rect[3]})
        })
      )
    // 7 つの面が同じ細い棒になって中心から放射状に並び、星の形のまま 1 回転してから戻る
    case 'star': {
      const turn = Math.PI * 2 * ease((phase - 0.3) / 0.4)
      return rectFormation(phase, (i) => {
        const angle = -Math.PI / 2 + (i / LOGO_SHAPE.rects.length) * Math.PI * 2 + turn
        return {
          x: CENTER.x + 6 * Math.cos(angle),
          y: CENTER.y + 6 * Math.sin(angle),
          width: 1.8,
          height: 8,
          angle: angle - Math.PI / 2
        }
      })
    }
    // 7 つの円が中心から外へ渦を巻いて並び、渦ごと 1 回転してから戻る
    case 'spiral': {
      const turn = Math.PI * 2 * ease((phase - 0.3) / 0.4)
      return formation(phase, (i) => {
        const angle = i * 1.1 + turn
        const radius = 1.5 + i * 1.6
        return {x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle), size: 2.4 + i * 0.35}
      })
    }
    // 真ん中の大きな円のまわりを、内と外の 2 つの軌道で 3 つずつの円が逆向きに回る
    case 'atom': {
      const turn = Math.PI * 2 * ease((phase - 0.3) / 0.4)
      return formation(phase, (i) => {
        if (i === 3) return {x: CENTER.x, y: CENTER.y, size: 6}
        const inner = i < 3
        const k = inner ? i : i - 4
        const angle = (k / 3) * Math.PI * 2 + (inner ? turn : -turn) + (inner ? 0 : Math.PI / 3)
        const radius = inner ? 6.5 : 11
        return {x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle), size: 3}
      })
    }
  }
}

/**
 * 傾きの差を、近いほうの向きに -π/2〜π/2 で返す。長方形は半回転すると同じ形になるので、半回転ぶんの差は無いものとする
 * （半回転して止まった twist から次の動きへ移るときに、逆向きに半回転して戻らないように）
 */
export const turnBetween = (from: number, to: number) => {
  const d = (to - from) % Math.PI
  return d > Math.PI / 2 ? d - Math.PI : d < -Math.PI / 2 ? d + Math.PI : d
}

/** 2 つの形のあいだ。w が 0 で a、1 で b。傾きは近いほうの向きに回る */
export function between(a: Shape, b: Shape, w: number): Shape {
  const mix = (from: number, to: number) => from + (to - from) * w
  return {
    rects: a.rects.map(([left, top, right, bottom, angle], i) => {
      const [l, t, r, bt, to] = b.rects[i]
      return [mix(left, l), mix(top, t), mix(right, r), mix(bottom, bt), angle + turnBetween(angle, to) * w]
    }),
    dots: a.dots.map(([x, y, radius], i) => {
      const [bx, by, br] = b.dots[i]
      return [mix(x, bx), mix(y, by), mix(radius, br)]
    })
  }
}

import {EASINGS, type Easing} from '../gallery/tuning'
import type {Param} from './DevPanel'
import {hasNavigated} from './pageMotion'
import {onScrollFrame} from './scrollFrame'

// 文字のまとまり（段落・行・欄）と線（区切りの線・入力欄・ボタン）を、画面に入ったら現す演出（Sweep.tsx）。
// 文字は左から右へ光りながら現れる（sweep）か、光を帯びて全体が薄く現れる（glow）。線は左から右へ引く。
// 見た目は styles.css の [data-sweep]。
// まとまりの上辺が画面の下から start の位置まで入ったら現す。同じときに入ったまとまりは、上から stagger ずつ遅らせて
// 順に流す。一度現れたら戻さない。動くのはまとまり 1 つにつき 1 つなので、文字ごとに動かすより軽い。
//
// 隠すのは JS が動いてからで、HTML の時点では文字を見せておく。最初に開いたページで、すでに見えているまとまりは
// 隠さない（一度消すとちらつく）。ページを移ってきたときは中身が見えないあいだに作り直されるので、画面の中のまとまりも
// 隠して現す

/** 文字が濃くなる曲線。CSS の名前と、広く使う曲線（gallery/tuning.ts） */
const TEXT_EASINGS = {
  'ease-out': 'ease-out',
  linear: 'linear',
  'ease-in-out': 'ease-in-out',
  ...Object.fromEntries(Object.entries(EASINGS).map(([name, {css}]) => [name, css]))
} as Record<'ease-out' | 'linear' | 'ease-in-out' | Easing, string>
type TextEasing = keyof typeof TEXT_EASINGS

export type SweepLook = {
  /** 文字の見せ方。sweep は左から右へ光りながら現れる、glow は光を帯びて全体が薄く現れる（styles.css） */
  mode: 'sweep' | 'glow'
  /**
   * 文字が現れる速さ px / 秒。文字の並んでいる長さ（複数行なら各行の和）をこれで割った時間で現れる。
   * 短いまとまりほど早く現れ終わる。glow の光が落ち着くのはこの時間の 1.6 倍
   */
  textSpeed: number
  /** 文字が現れる曲線（sweep はマスクの動き、glow は濃さ）。ease-out は最初に速く進むので、時間の長さの差が見えにくい */
  textEasing: TextEasing
  /** 文字が現れる最短の秒数 */
  textMin: number
  /** 文字が現れる最長の秒数。長い段落がいつまでも現れ続けないように */
  textMax: number
  /** 線を引く速さ px / 秒。長さで時間が変わり、短い線ほど早く引き終わる */
  drawSpeed: number
  /** 線を引く最短の秒数。短い線が一瞬で終わらないように */
  drawMin: number
  /** 同じときに入ったものを、上から遅らせる ms */
  stagger: number
  /** 同じときに入ったものの遅れの上限 ms。数が多いときは間隔を詰めて、最後のものもこの時間で始める */
  cascade: number
  /** 画面の下端からこの割合まで上辺が入ったら現す */
  start: number
}

export const DEFAULT_SWEEP: SweepLook = {
  // styles.css の既定（:root に data-sweep-mode が無いとき）と同じ
  mode: 'sweep',
  textSpeed: 150,
  // styles.css の --sweep-text-easing の既定と同じ
  textEasing: 'ease-in-out',
  textMin: 0.2,
  textMax: 1,
  drawSpeed: 800,
  drawMin: 0.2,
  stagger: 60,
  cascade: 1200,
  start: 0.1
}

export const SWEEP_PARAMS: Param<SweepLook>[] = [
  {key: 'mode', label: '見せ方', options: ['sweep', 'glow'], hint: 'sweep は左から光りながら、glow は全体が薄く'},
  {key: 'textSpeed', label: '文字の速さ', min: 100, max: 3000, step: 50, hint: 'px / 秒。文字の並んでいる長さで割る'},
  {
    key: 'textEasing',
    label: '文字の曲線',
    options: Object.keys(TEXT_EASINGS),
    hint: '濃くなる曲線。光の曲線は変えない'
  },
  {key: 'textMin', label: '文字の最短', min: 0, max: 2, step: 0.05, hint: '秒'},
  {key: 'textMax', label: '文字の最長', min: 0.2, max: 4, step: 0.05, hint: '秒'},
  {key: 'drawSpeed', label: '線の速さ', min: 200, max: 4000, step: 50, hint: 'px / 秒'},
  {key: 'drawMin', label: '線の最短', min: 0, max: 1.5, step: 0.05, hint: '秒'},
  {key: 'stagger', label: '順に遅らせる間隔', min: 0, max: 300, step: 5, hint: 'ms。同じときに入ったもの'},
  {key: 'cascade', label: '遅れの上限', min: 0, max: 2000, step: 50, hint: 'ms。数が多いときは間隔を詰める'},
  {key: 'start', label: '始まる位置', min: 0, max: 0.6, step: 0.01, hint: '画面の下端からの割合'}
]

let look = DEFAULT_SWEEP

/** 見せ方を変える（開発用パネル）。見せ方と文字の曲線は CSS へ渡す */
export function setSweepLook(next: SweepLook) {
  look = next
  const root = document.documentElement
  root.dataset.sweepMode = next.mode
  root.style.setProperty('--sweep-text-easing', TEXT_EASINGS[next.textEasing])
}

/** 文字が並んでいる長さ px。行ごとの左端から右端までを足す（要素の幅は、文字が短くても行いっぱいのことがある） */
function textLength(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const lines = new Map<number, [number, number]>()
  for (const rect of range.getClientRects()) {
    if (!rect.width) continue
    const line = Math.round(rect.top)
    const [left, right] = lines.get(line) ?? [rect.left, rect.right]
    lines.set(line, [Math.min(left, rect.left), Math.max(right, rect.right)])
  }
  return [...lines.values()].reduce((sum, [left, right]) => sum + right - left, 0)
}

/** 現れる秒数。長さを速さで割り、範囲に収める */
const durationOf = (el: HTMLElement) =>
  el.dataset.sweep === 'draw'
    ? Math.max(look.drawMin, el.offsetWidth / look.drawSpeed)
    : Math.min(look.textMax, Math.max(look.textMin, textLength(el) / look.textSpeed))

/**
 * 隠したものを、並んだ順に遅らせて現す。durations はそれぞれの現れる秒数（先に読んでおく）。同じときに現すものは
 * stagger ずつ遅らせ、遅れは全体で cascade までに詰める。現れ終わったら外す
 */
function show(list: HTMLElement[], durations: number[]) {
  const step = Math.min(look.stagger, look.cascade / Math.max(list.length - 1, 1))
  list.forEach((el, i) => {
    el.style.setProperty('--sweep-delay', `${i * step}ms`)
    el.style.setProperty('--sweep-duration', `${durations[i]}s`)
    el.dataset.shown = ''
    // 一番長い動き（文字は光、線は切り抜き）が終わったら外す。見え方は変わらず、かけ続ける手間がなくなる。
    // 中の要素（文字を包む内側のマスク、リンクの色など）の動きの終わりも上がってくるので、自分の動きだけを見る
    const last = el.dataset.sweep === 'draw' ? 'clip-path' : look.mode === 'glow' ? 'text-shadow' : 'filter'
    const done = (event: TransitionEvent) => {
      if (event.target !== el || !event.propertyName.includes(last)) return
      el.removeEventListener('transitionend', done)
      delete el.dataset.sweep
      delete el.dataset.shown
      el.style.removeProperty('--sweep-delay')
      el.style.removeProperty('--sweep-duration')
    }
    el.addEventListener('transitionend', done)
  })
}

/** 現すのを待っているまとまり */
const pending = new Set<HTMLElement>()
let stop: (() => void) | null = null

/** 上辺が始まる位置まで入ったまとまりを、上から順に現す。位置を読み終えてから書く（scrollFrame.ts） */
const measure = () => {
  const line = innerHeight * (1 - look.start)
  const shown = [...pending]
    .map((el) => ({el, top: el.getBoundingClientRect().top}))
    .filter(({top}) => top < line)
    .sort((a, b) => a.top - b.top)
    .map(({el}) => el)
  if (!shown.length) return
  // 文字も線も、長さを速さで割った時間で現す
  const durations = shown.map(durationOf)
  return () => {
    show(shown, durations)
    for (const el of shown) pending.delete(el)
    if (!pending.size) {
      stop?.()
      stop = null
    }
  }
}

const check = () => measure()?.()

/** 現し方。text は文字のまとまり、draw は線（左から右へ引く） */
export type SweepKind = 'text' | 'draw'

/**
 * まとまりを隠して、入ったら現す。外すときに呼ぶ関数を返す。
 * 最初に開いたページですでに見えているまとまりと、動きを減らす設定では何もしない
 */
export function watchSweep(el: HTMLElement, kind: SweepKind) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  if (!hasNavigated() && el.getBoundingClientRect().top < innerHeight * (1 - look.start)) return () => {}
  el.dataset.sweep = kind
  pending.add(el)
  stop ??= onScrollFrame(measure)
  // 隠した状態を一度描いてから現す。同じフレームで現すと、隠した状態を経ずに動きが付かない。
  // 同じときに描かれたまとまりを 1 回でまとめて見るので、上から順に遅らせられる
  const frame = requestAnimationFrame(() => requestAnimationFrame(check))
  return () => {
    cancelAnimationFrame(frame)
    pending.delete(el)
  }
}

/**
 * 渡した順に、今すぐ隠して現す（画面に入ったかは見ない）。トップのカレンダーの数字のように、ほかの動きに合わせて
 * 現すときに使う。動きを減らす設定では何もしない
 */
export function sweepIn(items: [HTMLElement, SweepKind][]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const [el, kind] of items) el.dataset.sweep = kind
  const list = items.map(([el]) => el)
  // 隠した状態を一度描いてから現す（watchSweep と同じ）
  requestAnimationFrame(() => requestAnimationFrame(() => show(list, list.map(durationOf))))
}

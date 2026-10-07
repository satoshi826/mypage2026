// 自動再生の進行管理。スクロールではなく時計で進める。
// 次の1枚はランダムに選ぶので、進行状態は progress から逆算できず、状態として持つ。

/** 描画1回ぶんの指示 */
export type Frame = {from: number; to: number; phase: number}

/** elapsed は現在の1周のうち経過した秒数 */
export type SequenceState = {
  from: number
  /** 次の1枚。null は未定で、候補が読み込まれたら advance が選ぶ。それまで時計は止まる */
  to: number | null
  elapsed: number
  /** たどってきた写真。シャッフル中の「前へ」で戻るために持つ */
  history: number[]
}

/**
 * 再生の順番。available は読み込みが終わって選べる写真の番号（昇順）。
 * 写真は1枚ずつ届くので、起動直後は少なく、揃うにつれて増える
 */
export type Order = {shuffle: boolean; available: readonly number[]}

/** 履歴の上限。戻れる深さで、これ以上は古いものから捨てる */
const HISTORY_LIMIT = 64

const remember = (history: number[], value: number) => [...history, value].slice(-HISTORY_LIMIT)

export type Timing = {
  /** 写真1枚あたりの周期(秒)。静止と遷移の合計 */
  cycleSeconds: number
  /** 周期のうち静止している割合 */
  dwellRatio: number
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const cycleOf = (timing: Timing) => Math.max(timing.cycleSeconds, 0.1)

/** 次の1枚。シャッフル中は直前と同じものを避けて抽選し、そうでなければ番号順。候補がなければ今のまま */
export function pickNext(current: number, {shuffle, available}: Order) {
  const candidates = available.filter((i) => i !== current)
  if (candidates.length === 0) return current
  if (shuffle) return candidates[Math.floor(Math.random() * candidates.length)]
  return candidates.find((i) => i > current) ?? candidates[0]
}

/** 番号順で1つ前。候補がなければ今のまま */
function pickPrev(current: number, {available}: Order) {
  const candidates = available.filter((i) => i !== current)
  if (candidates.length === 0) return current
  const before = candidates.filter((i) => i < current)
  return before.length > 0 ? before[before.length - 1] : candidates[candidates.length - 1]
}

/** 最初の1枚は 0 番。次は読み込みが進んでから選ぶ */
export const initialState = (): SequenceState => ({from: 0, to: null, elapsed: 0, history: []})

/**
 * 経過時間を進める。1周を終えたら次の1枚へ移る。
 *
 * 次の1枚が未定（起動直後）なら候補から選び、候補がなければ時計を止めたまま返す。
 * 遷移の途中で行き先が決まると粒子が飛ぶので、決まるまで静止帯の頭で待つ。
 *
 * 履歴に積むのは「静止帯が終わって、見ていた1枚を離れる瞬間」の1回だけ。周替わりで
 * 積むと、ボタンで始めた遷移のぶんが二重になる（ボタン側は押した時点で積むため）。
 * ボタンは静止帯の終わりに合わせて時計を進めるので、この判定では二度と拾われない。
 */
export function advance(state: SequenceState, seconds: number, order: Order, timing: Timing): SequenceState {
  let {from, to, history} = state
  if (to === null) {
    const picked = pickNext(from, order)
    if (picked === from) return state
    to = picked
  }

  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  let elapsed = state.elapsed
  let left = seconds

  while (left > 0) {
    const next = elapsed + left
    if (elapsed < dwell && next >= dwell) history = remember(history, from)
    if (next < cycle) {
      elapsed = next
      break
    }
    left = next - cycle
    elapsed = 0
    // 静止帯がないときは離れる瞬間が周の頭に来るので、ここで積む
    if (dwell <= 0) history = remember(history, from)
    from = to
    to = pickNext(from, order)
  }

  return {from, to, elapsed, history}
}

/** 丸が示している1枚。遷移の開始で次へ切り替わる */
const markedOf = ({from, to}: SequenceState, phase: number) => (phase > 0 ? (to ?? from) : from)

/** 粒子が位置として近い1枚。中点で切り替わる */
const originOf = ({from, to}: SequenceState, phase: number) => (phase < 0.5 ? from : (to ?? from))

/**
 * 遷移を始める。静止帯を飛ばして即座に動き出し、今の1枚を履歴に積む。
 *
 * 「今の1枚」の答えが2つある。UI が丸で示しているのは遷移の開始で切り替わる側で、
 * 粒子が位置として近いのは中点で切り替わる側。同じ番号を押しても何も起きない、を
 * 成り立たせるには前者で判定し、出発点としては後者を使う。
 */
function startFrom(state: SequenceState, target: number, timing: Timing, history: number[]): SequenceState {
  const {phase} = frameOf(state, timing)
  return {
    from: originOf(state, phase),
    to: target,
    elapsed: cycleOf(timing) * clamp01(timing.dwellRatio),
    history
  }
}

/** 番号を選ぶ。読み込みが済んでいない番号は無視する */
export function jumpTo(state: SequenceState, target: number, order: Order, timing: Timing): SequenceState {
  if (!order.available.includes(target)) return state
  const {phase} = frameOf(state, timing)
  if (target === markedOf(state, phase)) return state
  return startFrom(state, target, timing, remember(state.history, markedOf(state, phase)))
}

/** 「次へ」。自動再生が選ぶのと同じ1枚へ、静止帯を待たずに進む */
export function goNext(state: SequenceState, order: Order, timing: Timing): SequenceState {
  const {phase} = frameOf(state, timing)
  const marked = markedOf(state, phase)
  const target = pickNext(marked, order)
  if (target === marked) return state
  return startFrom(state, target, timing, remember(state.history, marked))
}

/**
 * 「前へ」。番号順のときは1つ前の番号へ、シャッフル中はたどってきた履歴を1つ戻る。
 * シャッフルでも履歴が空なら番号順に落とす。
 */
export function goBack(state: SequenceState, order: Order, timing: Timing): SequenceState {
  const {phase} = frameOf(state, timing)
  const marked = markedOf(state, phase)
  const previous = order.shuffle ? state.history[state.history.length - 1] : undefined
  const target = previous ?? pickPrev(marked, order)
  if (target === marked) return state
  // 戻るときは積まない。積むと2回目で行き来するだけになる
  return startFrom(state, target, timing, previous === undefined ? state.history : state.history.slice(0, -1))
}

/** 進行状態を描画用の3値にする。phase は線形（イージングは頂点シェーダ側で掛かる）。次が未定なら今の1枚を静止で描く */
export function frameOf({from, to, elapsed}: SequenceState, timing: Timing): Frame {
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  const morph = cycle - dwell
  return {
    from,
    to: to ?? from,
    phase: morph > 0 ? clamp01((elapsed - dwell) / morph) : elapsed >= dwell ? 1 : 0
  }
}

/** 1周のうち遷移が占める割合。cycleProgress のどの地点で静止帯に入るかでもある */
export const morphRatio = (timing: Timing) => 1 - clamp01(timing.dwellRatio)

/**
 * 1周の進み具合。0 = 遷移の開始、1 = 次の遷移の開始。
 * 内部の周期（静止帯 → 遷移）とは始点がずれるので、遷移ぶんだけ前へずらして測る。
 */
export function cycleProgress({elapsed}: SequenceState, timing: Timing) {
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  return ((elapsed - dwell + cycle) % cycle) / cycle
}

/**
 * 停止したときの状態。静止帯なら頭へ戻す。
 *
 * 表示上のバーは停止と同時に遷移の終了地点へ飛ぶので、内部の経過時間を途中に
 * 残したままだと、再生したときにバーが飛び、しかも見た目より早く次の遷移が来る。
 * 遷移中はそのまま返し、settle に完走させる（完走すると経過時間は周の終わり、
 * つまり表示と同じ地点に着く）。
 */
export function pause(state: SequenceState, timing: Timing): SequenceState {
  const dwell = cycleOf(timing) * clamp01(timing.dwellRatio)
  return state.elapsed < dwell ? {...state, elapsed: 0} : state
}

/**
 * 次へ進まずに、進行中の遷移だけを完走させる。自動再生を切ったときに使う。
 *
 * 散ったまま止まると事故に見えるので遷移は走り切らせるが、静止帯では粒子が像を
 * 結んでいるのでその場で止める。周の終わりまで進めると、静止帯で止めたときに
 * 写真が1枚余分に進んでしまう。
 *
 * 前後送りや番号のクリックは静止帯の終わりに時計を合わせるので、止めたままでも
 * その遷移は完走する。
 */
export function settle(state: SequenceState, seconds: number, timing: Timing): SequenceState {
  const cycle = cycleOf(timing)
  if (state.elapsed < cycle * clamp01(timing.dwellRatio) || state.elapsed >= cycle) return state
  return {...state, elapsed: Math.min(state.elapsed + seconds, cycle)}
}

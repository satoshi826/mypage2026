// 自動再生の進行管理。スクロールではなく時計で進める。
// 次の1枚はランダムに選ぶので、進行状態は progress から逆算できず、状態として持つ。
// 写真は要るときに読み込む（library.ts）。行き先とその次の 1 枚を前もって決めておき、遷移が始まるまでに読み終える。
// 読み終わっていない写真へは遷移を始めず、静止帯の終わりで待つ（番号を押した直後に起こりうる）

/** 描画1回ぶんの指示 */
export type Frame = {from: number; to: number; phase: number}

/** elapsed は現在の1周のうち経過した秒数 */
export type SequenceState = {
  from: number
  /** 行き先 */
  to: number
  /** 行き先の次の 1 枚。行き先へ着いたら、次の行き先になる。前もって読み込んでおくために決めておく */
  after: number
  elapsed: number
  /** 行き先を番号で選んだか。選んだ番号には、遷移が始まる前から丸を移す */
  chosen: boolean
}

/**
 * 次の1枚を選ぶ材料。count は写真の枚数。seen はこの巡で表示した写真の番号で、全部を表示し終えるまで、
 * 表示した写真は選ばない。broken は読めなかった写真の番号で、選ばない
 */
export type Order = {count: number; seen: readonly number[]; broken: readonly number[]}

export type Timing = {
  /** 写真1枚あたりの周期(秒)。静止と遷移の合計 */
  cycleSeconds: number
  /** 周期のうち静止している割合 */
  dwellRatio: number
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const cycleOf = (timing: Timing) => Math.max(timing.cycleSeconds, 0.1)

/**
 * current の次の1枚。この巡でまだ表示していない写真から抽選する（すべて表示していれば、current 以外から）。
 * 候補がなければ current のまま
 */
export function pickNext(current: number, {count, seen, broken}: Order) {
  const candidates = Array.from({length: count}, (_, i) => i).filter((i) => i !== current && !broken.includes(i))
  if (candidates.length === 0) return current
  const fresh = candidates.filter((i) => !seen.includes(i))
  const pool = fresh.length > 0 ? fresh : candidates
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 最初の1枚は 0 番。行き先とその次も、ここで決めておく */
export function initialState(order: Order): SequenceState {
  const to = pickNext(0, order)
  return {from: 0, to, after: pickNext(to, {...order, seen: [...order.seen, to]}), elapsed: 0, chosen: false}
}

/**
 * 今の写真が読めなかったとき、読める写真を今の写真にして周の頭からやり直す。行き先が読めればそれを、読めなければ
 * ほかから選ぶ。今の写真が読めているか、ほかに候補が無ければそのまま返す。
 * トップの入りの動き（Hero）は今の写真が読めてから始めるので、読めないまま待ち続けないために使う
 */
export function skipBrokenFrom(state: SequenceState, order: Order): SequenceState {
  if (!order.broken.includes(state.from)) return state
  const from = order.broken.includes(state.to) ? pickNext(state.from, order) : state.to
  if (from === state.from) return state
  const to = pickNext(from, order)
  return {from, to, after: pickNext(to, {...order, seen: [...order.seen, to]}), elapsed: 0, chosen: false}
}

/** 読めなかった写真を、行き先とその次から外す */
function avoidBroken(state: SequenceState, order: Order): SequenceState {
  const to = order.broken.includes(state.to) ? pickNext(state.from, order) : state.to
  const after = order.broken.includes(state.after) || to !== state.to ? pickNext(to, order) : state.after
  return to === state.to && after === state.after ? state : {...state, to, after}
}

/** 遷移を始められない（遷移がまだ始まっておらず、行き先を読み終えていない）か */
const blocked = (to: number, elapsed: number, dwell: number, ready: (photo: number) => boolean) =>
  elapsed <= dwell && !ready(to)

/**
 * 経過時間を進める。1周を終えたら次の1枚へ移り、その次の 1 枚を選ぶ。
 * 行き先を読み終えていなければ、静止帯の終わりで待つ（ready）
 */
export function advance(
  state: SequenceState,
  seconds: number,
  order: Order,
  timing: Timing,
  ready: (photo: number) => boolean
): SequenceState {
  let {from, to, after, chosen} = avoidBroken(state, order)
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  let elapsed = state.elapsed
  let left = seconds

  while (left > 0) {
    const next = elapsed + left
    if (next > dwell && blocked(to, elapsed, dwell, ready)) {
      elapsed = dwell
      break
    }
    if (next < cycle) {
      elapsed = next
      break
    }
    left = next - cycle
    elapsed = 0
    from = to
    to = after
    after = pickNext(to, order)
    chosen = false
  }

  return {from, to, after, elapsed, chosen}
}

/** 丸が示している1枚。遷移の開始で次へ切り替わる。番号で選んだ行き先には、選んだときに切り替わる */
const markedOf = (state: SequenceState, timing: Timing) =>
  state.chosen || frameOf(state, timing).phase > 0 ? state.to : state.from

/**
 * 丸が示している1枚を静止で描くところ（周の頭）からやり直す。行き先とその次は、決めてあったものを使う
 * （読み込み済みのことが多い）。ページを移って戻ってきたときに、遷移の途中から再開しないために使う
 */
export function restart(state: SequenceState, order: Order, timing: Timing): SequenceState {
  if (markedOf(state, timing) === state.from) return {...state, elapsed: 0, chosen: false}
  // 行き先へ移っていたら、そこから始める。次の行き先は決めてあった 1 枚
  return {from: state.to, to: state.after, after: pickNext(state.after, order), elapsed: 0, chosen: false}
}

/** 粒子が位置として近い1枚。中点で切り替わる */
const originOf = ({from, to}: SequenceState, phase: number) => (phase < 0.5 ? from : to)

/**
 * 遷移を始める。静止帯を飛ばして即座に動き出す。
 *
 * 「今の1枚」の答えが2つある。UI が丸で示しているのは遷移の開始で切り替わる側で、
 * 粒子が位置として近いのは中点で切り替わる側。同じ番号を押しても何も起きない、を
 * 成り立たせるには前者で判定し、出発点としては後者を使う。
 */
function startFrom(state: SequenceState, target: number, order: Order, timing: Timing): SequenceState {
  const {phase} = frameOf(state, timing)
  return {
    from: originOf(state, phase),
    to: target,
    after: state.after === target ? pickNext(target, order) : state.after,
    elapsed: cycleOf(timing) * clamp01(timing.dwellRatio),
    chosen: true
  }
}

/** 番号を選ぶ。読めなかった番号は無視する */
export function jumpTo(state: SequenceState, target: number, order: Order, timing: Timing): SequenceState {
  if (order.broken.includes(target)) return state
  const marked = markedOf(state, timing)
  if (target === marked) return state
  return startFrom(state, target, order, timing)
}

/** 進行状態を描画用の3値にする。phase は線形（イージングは頂点シェーダ側で掛かる） */
export function frameOf({from, to, elapsed}: SequenceState, timing: Timing): Frame {
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  const morph = cycle - dwell
  return {
    from,
    to,
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
 * 番号のクリックは静止帯の終わりに時計を合わせるので、止めたままでもその遷移は完走する。
 */
export function settle(
  state: SequenceState,
  seconds: number,
  timing: Timing,
  ready: (photo: number) => boolean
): SequenceState {
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  if (state.elapsed < dwell || state.elapsed >= cycle || blocked(state.to, state.elapsed, dwell, ready)) return state
  return {...state, elapsed: Math.min(state.elapsed + seconds, cycle)}
}

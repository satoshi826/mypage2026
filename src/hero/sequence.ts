// 自動再生の進行管理。スクロールではなく時計で進める。
// 次の1枚はランダムに選ぶので、進行状態は progress から逆算できず、状態として持つ。

/** 描画1回ぶんの指示 */
export type Frame = {from: number; to: number; phase: number}

/** elapsed は現在の1周のうち経過した秒数 */
export type SequenceState = {from: number; to: number; elapsed: number}

export type Timing = {
  /** 写真1枚あたりの周期(秒)。静止と遷移の合計 */
  cycleSeconds: number
  /** 周期のうち静止している割合 */
  dwellRatio: number
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const cycleOf = (timing: Timing) => Math.max(timing.cycleSeconds, 0.1)

/** 直前と同じものを避けて次の1枚を選ぶ */
export function pickNext(current: number, count: number) {
  if (count < 2) return current
  return (current + 1 + Math.floor(Math.random() * (count - 1))) % count
}

export const initialState = (count: number): SequenceState => ({from: 0, to: pickNext(0, count), elapsed: 0})

/** 経過時間を進める。1周を終えたら次の1枚へ移る */
export function advance(state: SequenceState, seconds: number, count: number, timing: Timing): SequenceState {
  const cycle = cycleOf(timing)
  let {from, to} = state
  let elapsed = state.elapsed + seconds
  while (elapsed >= cycle) {
    elapsed -= cycle
    from = to
    to = pickNext(from, count)
  }
  return {from, to, elapsed}
}

/** 遷移を始める。今表示している1枚から target へ、静止帯を飛ばして動き出す */
export function jumpTo(state: SequenceState, target: number, timing: Timing): SequenceState {
  const cycle = cycleOf(timing)
  const shown = frameOf(state, timing).phase < 0.5 ? state.from : state.to
  if (target === shown) return state
  return {from: shown, to: target, elapsed: cycle * timing.dwellRatio}
}

/** 進行状態を描画用の3値にする。phase は線形（イージングは頂点シェーダ側で掛かる） */
export function frameOf({from, to, elapsed}: SequenceState, timing: Timing): Frame {
  const cycle = cycleOf(timing)
  const dwell = cycle * clamp01(timing.dwellRatio)
  const morph = cycle - dwell
  return {from, to, phase: morph > 0 ? clamp01((elapsed - dwell) / morph) : elapsed >= dwell ? 1 : 0}
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
 * 次へ進まずに、進行中の遷移だけを完走させる。
 * 自動再生を切ったときに使う。散ったまま止まると事故に見えるため
 */
export function settle(state: SequenceState, seconds: number, timing: Timing): SequenceState {
  const cycle = cycleOf(timing)
  if (state.elapsed >= cycle) return state
  return {...state, elapsed: Math.min(state.elapsed + seconds, cycle)}
}

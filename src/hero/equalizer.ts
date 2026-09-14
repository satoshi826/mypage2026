import {TONE_STEPS} from './table'
import type {Analysis} from './worker'
import type {Frame} from './sequence'
import type {Tuning} from './tuning'

export type EqualizerOptions = {
  bars: number
  /** 高さのカーブ。1 で素のまま、上げるほど低い棒が持ち上がる */
  curve: number
  /**
   * 横軸の引き伸ばし。1 で sRGB のまま（ガンマがすでにほぼ知覚的なので、
   * CIE L* に直しても差は 0.5 ポイント未満だった）。下げると暗部が広がる。
   * これは知覚的な正しさではなく見た目の判断。
   */
  axis: number
}

/** 頂点シェーダの easeInOut と同じ */
const easeInOut = (t: number, p: number) => (t < 0.5 ? Math.pow(2 * t, p) * 0.5 : 1 - Math.pow(2 * (1 - t), p) * 0.5)

/** easeInOut の傾き。出発と到着で 0、飛行の中間で最大になる */
const easeSlope = (t: number, p: number) => (t <= 0 || t >= 1 ? 0 : p * Math.pow(t < 0.5 ? 2 * t : 2 * (1 - t), p - 1))

/**
 * 棒の高さ（0〜1）を作る。一番高い棒が 1 になるよう毎フレーム正規化する。
 *
 * 高さは輝度の分布。分位点を粒子ごとの進み具合で補間してから数えるので、遷移中の
 * 分布も厳密に出る（ランクどうしが結ばれたまま値が動くため）。
 *
 * speeds には「その明るさの粒子がいまどれだけ速く飛んでいるか」を 0〜1 で返す。
 * 高さとは次元が違うので掛け合わせず、濃さなど別のチャンネルに使う。分位点は
 * 輝度順なので添字がそのまま暗い→明るいに対応し、遷移が始まると明るい側から
 * 順に速くなって波が左へ走る。
 */
export function barHeights(
  {tones}: Analysis,
  {from, to, phase}: Frame,
  tuning: Tuning,
  {bars, curve, axis}: EqualizerOptions,
  out: Float32Array,
  speeds: Float32Array
) {
  out.fill(0)
  speeds.fill(0, 0, bars)

  const a = tones[from]
  const b = tones[to]
  if (!a || !b) return

  const span = Math.max(1 - tuning.staggerTotal, 0.05)
  for (let i = 0; i < TONE_STEPS; i++) {
    const lumFrom = a[i] / 255
    const lumTo = b[i] / 255
    // 頂点シェーダと同じ遅延。暗い粒子ほど遅れて出発する
    const delay = Math.pow(1 - (lumFrom + lumTo) * 0.5, tuning.toneCurve) * tuning.staggerTotal
    const t = Math.min(1, Math.max(0, (phase - delay) / span))
    const shown = lumFrom + (lumTo - lumFrom) * easeInOut(t, tuning.easePower)
    const bar = Math.min(bars - 1, Math.floor(Math.pow(shown, axis) * bars))
    out[bar]++
    speeds[bar] += easeSlope(t, tuning.easePower)
  }

  // 棒ごとの平均速度にして、一番速い棒が 1 になるよう揃える。分母を全体の最大では
  // なくイージングの上限にするので、静止帯では 0 のままになり「無音」を表す
  const ceiling = tuning.easePower
  for (let i = 0; i < bars; i++) {
    speeds[i] = out[i] > 0 ? Math.min(1, speeds[i] / out[i] / ceiling) : 0
  }

  // 絶対値ではなく形を見せたいので、毎フレーム最大値で割る
  let max = 0
  for (let i = 0; i < bars; i++) if (out[i] > max) max = out[i]
  if (max <= 0) return

  const power = 1 / Math.max(curve, 0.05)
  for (let i = 0; i < bars; i++) out[i] = Math.pow(out[i] / max, power)
}

/**
 * 棒 index が受け持つ輝度の中心と、その幅を spread 本ぶんに広げた値。
 * 横軸を引き伸ばしているぶん、暗い側の棒は輝度の幅が狭く明るい側は広いので、
 * 同じ本数ぶん広げるだけで「粒子の少ない明るい側ほど広く拾う」形になる。
 */
export function bandOf(index: number, {bars, axis}: {bars: number; axis: number}, spread: number) {
  const low = Math.pow(index / bars, 1 / axis)
  const high = Math.pow((index + 1) / bars, 1 / axis)
  return {center: (low + high) / 2, width: Math.max((high - low) * spread, 1e-4)}
}

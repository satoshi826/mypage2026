import {PROFILE_BANDS, TONE_STEPS} from './table'
import type {Analysis} from './worker'
import type {Frame} from './sequence'

/** 棒が何を表すか */
export type EqualizerSource = 'tone' | 'profile'

/**
 * 棒の高さ（0〜1）を作る。
 *
 * tone は「輝度の分布」。分位点を要素ごとに混ぜてから明るさの区間ごとに数えるので、
 * 遷移中の分布も厳密に出る（ランクどうしが結ばれたまま値が動くため）。
 *
 * profile は「横方向の最大輝度」。粒子が列をまたいで動くので、遷移中は2枚の
 * プロファイルの補間で近似している。静止帯では厳密。
 */
export function barHeights(
  analysis: Analysis,
  {from, to, phase}: Frame,
  {source, bars, curve}: {source: EqualizerSource; bars: number; curve: number},
  out: Float32Array
) {
  out.fill(0)
  if (source === 'profile') {
    const a = analysis.profiles[from]
    const b = analysis.profiles[to]
    if (a && b) {
      for (let i = 0; i < bars; i++) {
        const band = Math.min(PROFILE_BANDS - 1, Math.floor((i * PROFILE_BANDS) / bars))
        out[i] = a[band] + (b[band] - a[band]) * phase
      }
    }
  } else {
    const a = analysis.tones[from]
    const b = analysis.tones[to]
    if (a && b) {
      for (let i = 0; i < TONE_STEPS; i++) {
        const value = a[i] + (b[i] - a[i]) * phase
        out[Math.min(bars - 1, Math.floor((value * bars) / 256))]++
      }
    }
  }

  // 一番高い棒を 1 にする。絶対値ではなく形を見せたいので、毎フレーム測り直す
  let max = 0
  for (let i = 0; i < bars; i++) if (out[i] > max) max = out[i]
  if (max <= 0) return out

  const power = 1 / Math.max(curve, 0.05)
  for (let i = 0; i < bars; i++) out[i] = Math.pow(out[i] / max, power)
  return out
}

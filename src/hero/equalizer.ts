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
 * profile は「横方向の平均輝度」。粒子が列をまたいで動くので、遷移中は2枚の
 * プロファイルの補間で近似している。静止帯では厳密。
 */
export function barHeights(
  analysis: Analysis,
  {from, to, phase}: Frame,
  {source, bars, gain}: {source: EqualizerSource; bars: number; gain: number},
  out: Float32Array
) {
  out.fill(0)
  if (source === 'profile') {
    const a = analysis.profiles[from]
    const b = analysis.profiles[to]
    if (!a || !b) return out
    for (let i = 0; i < bars; i++) {
      const band = Math.min(PROFILE_BANDS - 1, Math.floor((i * PROFILE_BANDS) / bars))
      out[i] = Math.min(1, ((a[band] + (b[band] - a[band]) * phase) / 255) * gain)
    }
    return out
  }

  const a = analysis.tones[from]
  const b = analysis.tones[to]
  if (!a || !b) return out
  for (let i = 0; i < TONE_STEPS; i++) {
    const value = a[i] + (b[i] - a[i]) * phase
    out[Math.min(bars - 1, Math.floor((value * bars) / 256))]++
  }
  // 一様分布のとき 1 になるよう割る。暗部に偏った写真では暗い側が振り切れる
  const flat = TONE_STEPS / bars
  for (let i = 0; i < bars; i++) out[i] = Math.min(1, (out[i] / flat) * gain)
  return out
}

import {PROFILE_BANDS, TONE_STEPS} from './table'
import type {Analysis} from './worker'
import type {Frame} from './sequence'
import type {Tuning} from './tuning'

/** 棒が何を表すか */
export type EqualizerSource = 'tone' | 'profile'

export type EqualizerOptions = {
  source: EqualizerSource
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
 * 棒の高さ（0〜1）を作る。一番高い棒が 1 になるよう毎フレーム正規化し、
 * その一番高い棒が全画素に占める割合を返す。正規化すると目盛りが消えて
 * 「動いていない棒まで一緒に上下する」ことになるので、基準線を引くのに使う。
 *
 * tone は「輝度の分布」。分位点を粒子ごとの進み具合で補間してから数えるので、
 * 遷移中の分布も厳密に出る（ランクどうしが結ばれたまま値が動くため）。
 *
 * profile は「横方向の最大輝度」。粒子が列をまたいで動くので、遷移中は2枚の
 * プロファイルの補間で近似している。静止帯では厳密。
 *
 * speeds には「その明るさの粒子がいまどれだけ速く飛んでいるか」を 0〜1 で返す。
 * 高さとは次元が違うので掛け合わせず、濃さなど別のチャンネルに使う。分位点は
 * 輝度順なので添字がそのまま暗い→明るいに対応し、遷移が始まると明るい側から
 * 順に速くなって波が左へ走る。
 */
export function barHeights(
  analysis: Analysis,
  {from, to, phase}: Frame,
  tuning: Tuning,
  {source, bars, curve, axis}: EqualizerOptions,
  out: Float32Array,
  speeds: Float32Array
) {
  out.fill(0)
  speeds.fill(0, 0, bars)

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
      const span = Math.max(1 - tuning.staggerTotal, 0.05)
      for (let i = 0; i < TONE_STEPS; i++) {
        const lumFrom = a[i] / 255
        const lumTo = b[i] / 255
        // 頂点シェーダと同じ遅延。暗い粒子ほど遅れて出発する
        const delay = Math.pow(1 - (lumFrom + lumTo) * 0.5, tuning.toneCurve) * tuning.staggerTotal
        const t = Math.min(1, Math.max(0, (phase - delay) / span))
        const local = easeInOut(t, tuning.easePower)
        const shown = lumFrom + (lumTo - lumFrom) * local
        const bar = Math.min(bars - 1, Math.floor(Math.pow(shown, axis) * bars))
        out[bar]++
        speeds[bar] += easeSlope(t, tuning.easePower)
      }

      // 棒ごとの平均速度にして、一番速い棒が 1 になるよう揃える。
      // 分母を全体の最大にすると静止帯で 0 のままになり、ちょうど「無音」を表す
      let fastest = 0
      for (let i = 0; i < bars; i++) {
        speeds[i] = out[i] > 0 ? speeds[i] / out[i] : 0
        if (speeds[i] > fastest) fastest = speeds[i]
      }
      const ceiling = tuning.easePower
      if (ceiling > 0) for (let i = 0; i < bars; i++) speeds[i] = Math.min(1, speeds[i] / ceiling)
    }
  }

  // 絶対値ではなく形を見せたいので、毎フレーム最大値で割る
  let max = 0
  for (let i = 0; i < bars; i++) if (out[i] > max) max = out[i]
  if (max <= 0) return 0

  const power = 1 / Math.max(curve, 0.05)
  for (let i = 0; i < bars; i++) out[i] = Math.pow(out[i] / max, power)
  // 割合が意味を持つのは数を数えている tone だけ
  return source === 'tone' ? max / TONE_STEPS : 0
}

// トップの舞台。hero と光の段を画面に貼りつけて重ね、スクロールで場面を進める。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の段が毎フレーム読む。
//
//   0 → 1      粒子が写真の中央へ集まり、白い点になる
//   0.85 → 1.15  集まった点と入れ替わりに光がつく
//   1 → 1.6    光が写真の中央から、ロゴを照らす位置へ移る
//   1.5 →      導線が下から上がってくる（舞台は貼りついたまま）

export type Stage = {
  /** スクロール量を画面の高さで割った値 */
  progress: number
  /** 粒子が集まる点（写真の中央）。画面の左上からの px。hero が写真の枠から決める */
  source: {x: number; y: number}
}

/** 舞台が貼りついたまま進むスクロールの長さ。画面の高さ単位。導線の 1 画面ぶんは含まない */
export const STAGE_SCREENS = 1.5

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** 粒子が集まった割合 */
export const gatherOf = (progress: number) => clamp01(progress)

/** 光の強さの割合 */
export const lightOf = (progress: number) => smooth(0.85, 1.15, progress)

/** 光が写真の中央から照らす位置へ移った割合 */
export const travelOf = (progress: number) => smooth(1, 1.6, progress)

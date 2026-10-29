// トップの舞台。hero と光の段を画面に貼りつけて重ね、スクロールで場面を進める。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の段が毎フレーム読む。
// 区間はどれも、写真が上がりきった位置（rise）から数える。
//
//   0 → rise            写真がスクロールと一緒に上がる（ふつうにスクロールしたように見せる）
//   rise → +1           粒子が写真の中央へ集まり、白い点になる
//   +0.85 → +1.15       集まった点と入れ替わりに光がつく
//   +1 → +1.6           光が写真の中央から、ロゴを照らす位置へ移る
//   STAGE_SCREENS →     導線が下から上がってくる（舞台は貼りついたまま）

export type Stage = {
  /** スクロール量を画面の高さで割った値 */
  progress: number
  /** 集まる前に写真が上がる距離。画面の高さ単位。hero が写真の高さから決める */
  rise: number
  /** 粒子が集まる点（上がりきった写真の中央）。画面の左上からの px。hero が写真の枠から決める */
  source: {x: number; y: number}
}

/** 写真が上がる距離。写真の高さに対する割合 */
export const RISE_RATIO = 0.4

/** 舞台が貼りついたまま進むスクロールの長さ。画面の高さ単位。導線の 1 画面ぶんは含まない。写真が上がるぶんの余裕を見ている */
export const STAGE_SCREENS = 1.8

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** 写真が上がった距離。画面の高さ単位 */
export const riseOf = ({progress, rise}: Stage) => Math.min(progress, rise)

/** 粒子が集まった割合 */
export const gatherOf = ({progress, rise}: Stage) => clamp01(progress - rise)

/** 光の強さの割合 */
export const lightOf = ({progress, rise}: Stage) => smooth(rise + 0.85, rise + 1.15, progress)

/** 光が写真の中央から照らす位置へ移った割合 */
export const travelOf = ({progress, rise}: Stage) => smooth(rise + 1, rise + 1.6, progress)

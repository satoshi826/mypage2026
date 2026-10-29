// トップの舞台。hero と光の段を画面に貼りつけて重ね、スクロールで場面を進める。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の段が毎フレーム読む。
//
//   0 → rise           写真がスクロールと一緒に上がる（ふつうにスクロールしたように見せる）
//   rise を越えた       粒子が写真の中央へ集まって白い点になり、入れ替わりに同じ点から光がつく。スクロール量によらず時間で進む。
//                      rise より戻ると、時間でほどけて写真に戻る
//   rise → +TRAVEL     光がスクロールに合わせて、ロゴを照らす位置へ下りていく
//   STAGE_SCREENS →    導線が下から上がってくる（舞台は貼りついたまま）

export type Stage = {
  /** スクロール量を画面の高さで割った値 */
  progress: number
  /** 集まる前に写真が上がる距離。画面の高さ単位。hero が写真の高さから決める。決まるまでは無限大（集めない） */
  rise: number
  /** 粒子が集まった割合。advanceGather が時間で進める */
  gather: number
  /** 粒子が集まる点（上がりきった写真の中央）。画面の左上からの px。hero が写真の枠から決める */
  source: {x: number; y: number}
}

/** 写真が上がる距離。写真の高さに対する割合 */
export const RISE_RATIO = 0.4

/** 粒子が集まりきるまで（ほどけきるまで）の秒数 */
const GATHER_SECONDS = 1.6

/** 光がロゴを照らす位置まで下りるスクロールの長さ。画面の高さ単位 */
const TRAVEL_SCREENS = 1

/** 舞台が貼りついたまま進むスクロールの長さ。画面の高さ単位。導線の 1 画面ぶんは含まない */
export const STAGE_SCREENS = 1.2

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** 写真が上がりきっていれば集め、戻っていればほどく。dt 秒ぶん進める */
export function advanceGather(stage: Stage, dt: number) {
  const step = dt / GATHER_SECONDS
  stage.gather = stage.progress >= stage.rise ? Math.min(1, stage.gather + step) : Math.max(0, stage.gather - step)
}

/** 写真が上がった距離。画面の高さ単位 */
export const riseOf = ({progress, rise}: Stage) => Math.min(progress, rise)

/** 光の強さの割合。粒子が集まりきる手前からつく */
export const lightOf = ({gather}: Stage) => smooth(0.8, 1, gather)

/** 光が写真の中央からロゴを照らす位置へ下りた割合（スクロールで決まる行き先。光はここへ追いつく） */
export const travelOf = ({progress, rise}: Stage) => smooth(rise, rise + TRAVEL_SCREENS, progress)

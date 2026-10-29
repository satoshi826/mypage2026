// トップの舞台。hero と光の層を画面に貼りつけて重ね、その上をロゴと導線の段（ふつうのページの中身）がスクロールで流れる。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の層が毎フレーム読む。
//
//   0 → rise        写真がスクロールと一緒に上がる（ふつうにスクロールしたように見せる）
//   rise を越えた    粒子が写真の中央へ集まって白い点になり、入れ替わりに同じ点から光がつく。スクロール量によらず時間で進む。
//                   rise より戻ると、時間でほどけて写真に戻る。光はついたあと、ロゴの段の中の自分の位置へ下りる
//   → SCENE_SCREENS  光・ロゴ・導線が、ページの中身と同じくスクロールで上がってくる。光はスクロールに合わせて明るくなる

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

/**
 * ページの一番下までのスクロールの長さ。画面の高さ単位。ロゴと導線の段は、ここで画面にちょうど収まる。
 * 写真が上がりきったとき（0.1〜0.3）に、段の中の光が画面の下の方にいる長さにしてある
 */
export const SCENE_SCREENS = 0.6

/** 光がついた直後の明るさ。スクロールで 1 まで上がる */
const DIM = 0.15

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

/** 光がついている割合。粒子が集まりきる手前からつく。集まった点はこれと入れ替わりに消える */
export const lightOf = ({gather}: Stage) => smooth(0.8, 1, gather)

/** 光の明るさ。ついた直後は暗く、ページの一番下までスクロールすると 1 */
export const brightnessOf = (stage: Stage) =>
  lightOf(stage) * (DIM + (1 - DIM) * smooth(Math.min(stage.rise, SCENE_SCREENS / 2), SCENE_SCREENS, stage.progress))

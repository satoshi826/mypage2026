// トップの舞台。hero と光の層を画面に貼りつけて重ね、その上をロゴと導線の段（ふつうのページの中身）がスクロールで流れる。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の層が毎フレーム読む。
//
//   0 → rise        写真がスクロールと一緒に上がる（ふつうにスクロールしたように見せる）
//   rise を越えた    粒子が光の位置（lightAt。画面に固定）へ飛び込み、着いた粒子から順に光に吸い込まれて消える。光は着いた
//                   粒子の分だけ明るくなる。スクロール量によらず時間で進む。rise より戻ると、時間で逆にたどって写真に戻る
//   → SCENE_SCREENS  ロゴと導線が、ページの中身と同じくスクロールで上がってきて、光の下に入る

export type Stage = {
  /** スクロール量を画面の高さで割った値 */
  progress: number
  /** 集まる前に写真が上がる距離。画面の高さ単位。hero が写真の高さから決める。決まるまでは無限大（集めない） */
  rise: number
  /** 粒子が集まった割合。advanceGather が時間で進める */
  gather: number
  /**
   * 粒子が集まる点。画面の左上からの px。ふつうは光の位置と同じ。粒子は写真の外へは描けないので、光の位置が
   * 上がりきった写真の外にあるときは、写真の中で一番近い点になる（光はそこでついて、光の位置へ移る）。hero が決める
   */
  source: {x: number; y: number}
}

/** 光の位置。画面に固定する。舞台の大きさ（px）から決める。ロゴは最後に画面の中央に来る */
export const lightAt = ({width, height}: {width: number; height: number}) => ({x: width / 2, y: height * 0.2})

/** 写真が上がる距離。写真の高さに対する割合 */
export const RISE_RATIO = 0.3

/** 粒子が集まりきるまで（ほどけきるまで）の秒数 */
const GATHER_SECONDS = 1.6

/** 写真が上がりきってから、時間によらず粒子が集まりきるスクロールの長さ。画面の高さ単位 */
const GATHER_SCROLL = 0.5

/**
 * 粒子が集まるとき、一番暗い粒子が出発を遅らせる割合（集まりきるまでのうち）。明るい粒子ほど先に出発する。
 * どの粒子も残りの (1 - GATHER_STAGGER) で光の位置に着くので、着くのは集まりきるまでの GATHER_STAGGER 以降
 */
export const GATHER_STAGGER = 0.5

/** ページの一番下までのスクロールの長さ。画面の高さ単位。ロゴと導線の段は、ここで画面にちょうど収まる */
export const SCENE_SCREENS = 1.8

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * 写真が上がりきっていれば集め、戻っていればほどく。dt 秒ぶん進める。上がりきったあとも速くスクロールしたときは、
 * スクロール量に合わせて先へ進める（GATHER_SCROLL 進むと集まりきる）。時間だけで進めると、速く送った人は集まる途中の粒子と
 * 上がってくるロゴを一緒に見ることになる
 */
export function advanceGather(stage: Stage, dt: number) {
  const step = dt / GATHER_SECONDS
  stage.gather =
    stage.progress >= stage.rise
      ? Math.max(Math.min(1, stage.gather + step), clamp01((stage.progress - stage.rise) / GATHER_SCROLL))
      : Math.max(0, stage.gather - step)
}

/** 写真が上がった距離。画面の高さ単位 */
export const riseOf = ({progress, rise}: Stage) => Math.min(progress, rise)

/**
 * 光の明るさの割合。粒子が着いた分だけ明るくなる。明るい粒子ほど先に着くので、着き始めに早く明るくなり、
 * 暗い粒子が着くころにはほぼ最大になる
 */
export const lightOf = ({gather}: Stage) => {
  const arrived = clamp01((gather - (1 - GATHER_STAGGER)) / GATHER_STAGGER)
  return 1 - (1 - arrived) ** 2
}

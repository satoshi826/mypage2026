// トップの舞台。hero と光の層を画面に貼りつけて重ね、その上をロゴと導線の段（ふつうのページの中身）がスクロールで流れる。
// 進み具合はスクロール量を画面の高さで割った値（progress）で、Top が書き、hero と光の層が毎フレーム読む。
//
//   0 → GATHER_AT    写真は動かず、カレンダーだけがスクロールで上へ流れる
//   GATHER_AT を越えた 粒子が画面の中央へ飛び込み、着いた粒子から順に光に吸い込まれて消える。光は着いた粒子の分だけ
//                    明るくなる。スクロール量によらず時間で進む。GATHER_AT より戻ると、時間で逆にたどって写真に戻る。
//                    光はスクロールに合わせてゆっくり上がり、止まる位置で止まる（lightAt）。止まる位置は、最後に
//                    画面に収まるロゴの中心からのずれで、Light が調整値から決める
//   → SCENE_SCREENS  ロゴと導線が、ページの中身と同じくスクロールで上がってきて、光の下に入る

export type Stage = {
  /** スクロール量を画面の高さで割った値 */
  progress: number
  /** 粒子が集まった割合。advanceGather が時間で進める */
  gather: number
  /** 上の光の位置（訪問者が動かしたぶんを除く）。舞台の左上からの px。Light が毎フレーム書き、hero は粒子をここへ飛ばす */
  light: {x: number; y: number}
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** 0〜1 に収めて、両端をなめらかにする */
export function ease(v: number) {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

/** 粒子が集まり始めるスクロールの長さ。画面の高さ単位 */
export const GATHER_AT = 0.2

/** 光が画面の中央から止まる位置まで上がるのにかけるスクロールの長さ。画面の高さ単位 */
const LIGHT_RISE_SCREENS = 1

/**
 * 上の光の位置。舞台の大きさ（px）と、止まる位置 rest から決める。粒子は画面の中央に集まって光になり、光は集まり始めてから
 * LIGHT_RISE_SCREENS スクロールするあいだに、動き出しと止まり際をなめらかにして rest まで上がる
 */
export const lightAt = (
  {progress}: Stage,
  {width, height}: {width: number; height: number},
  rest: {x: number; y: number}
) => {
  const rise = ease((progress - GATHER_AT) / LIGHT_RISE_SCREENS)
  return {x: width / 2 + (rest.x - width / 2) * rise, y: height / 2 + (rest.y - height / 2) * rise}
}

/** 粒子が集まりきるまで（ほどけきるまで）の秒数 */
const GATHER_SECONDS = 1.6

/** 集まり始めてから、時間によらず粒子が集まりきるスクロールの長さ。画面の高さ単位 */
const GATHER_SCROLL = 0.5

/**
 * 粒子が集まるとき、一番暗い粒子が出発を遅らせる割合（集まりきるまでのうち）。明るい粒子ほど先に出発する。
 * どの粒子も残りの (1 - GATHER_STAGGER) で光の位置に着くので、着くのは集まりきるまでの GATHER_STAGGER 以降
 */
export const GATHER_STAGGER = 0.5

/** ページの一番下までのスクロールの長さ。画面の高さ単位。ロゴと導線の段は、ここで画面にちょうど収まる */
export const SCENE_SCREENS = 1.8

/**
 * GATHER_AT を越えていれば集め、戻っていればほどく。dt 秒ぶん進める。越えたあとも速くスクロールしたときは、
 * スクロール量に合わせて先へ進める（GATHER_SCROLL 進むと集まりきる）。時間だけで進めると、速く送った人は集まる途中の粒子と
 * 上がってくるロゴを一緒に見ることになる
 */
export function advanceGather(stage: Stage, dt: number) {
  const step = dt / GATHER_SECONDS
  stage.gather =
    stage.progress >= GATHER_AT
      ? Math.max(Math.min(1, stage.gather + step), clamp01((stage.progress - GATHER_AT) / GATHER_SCROLL))
      : Math.max(0, stage.gather - step)
}

/**
 * 光の明るさの割合。粒子が着いた分だけ明るくなる。明るい粒子ほど先に着くので、着き始めに早く明るくなり、
 * 暗い粒子が着くころにはほぼ最大になる
 */
export const lightOf = ({gather}: Stage) => {
  const arrived = clamp01((gather - (1 - GATHER_STAGGER)) / GATHER_STAGGER)
  return 1 - (1 - arrived) ** 2
}

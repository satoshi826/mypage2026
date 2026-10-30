// 光線の数を、端末が描ける速さに合わせて決める。光のフレームを GPU が描き終えた知らせ（scene/worker.ts の Drawn）の
// 間隔から短い区間ごとにフレームレートを測り、60fps 近く出ていれば増やし、出ていなければ減らす。
// 描き終わりは画面の更新にそろうので、少しでも間に合わないと 30fps に落ちて見える。fps の比では減らさず、一定の本数ずつ減らす。
// 減らしたら、しばらくはその数にとどまる。そのあとはまた増やしてみる（端末の混み具合が変わることがあるので）。

/** フレームレートを測る区間の長さ ms */
const WINDOW_MS = 300
/** 知らせの間隔がこれより空いたら、描いていなかった（光が消えていた、タブが隠れていた）として測り直す ms */
const GAP_MS = 250
/** これ以上出ていれば増やす fps。120Hz の画面でも 60fps 出ていれば足りるとする */
const RAISE_FPS = 58
/** これを下回ったら減らす fps */
const LOWER_FPS = 50
/** 一度に増やす本数と減らす本数は、今の本数のこの割合（STEP 本より少なくはしない）。本数は UNIT の倍数にそろえる */
const STEP_RATIO = 1 / 8
const STEP = 1024
const UNIT = 256
/** 減らしたあと、その数にとどまる長さ ms */
const HOLD_MS = 10000

export type RayBudget = ReturnType<typeof createRayBudget>

/** 下限 min から始めて、min〜max のあいだで光線の数を決める */
export function createRayBudget(min: number, max: number) {
  let rays = min
  // 減らしたときは、減らした数と、その数を超えないでおく期限
  let ceiling = {rays: max, until: 0}
  let start = 0
  let last = 0
  let frames = 0
  return {
    get rays() {
      return rays
    },
    /**
     * 光の 1 フレームを描き終えた知らせが届いた時刻を入れる。1 区間ぶん測れたら、その fps と（変えたなら新しい）
     * 光線の数を返す
     */
    drawn(now: number): {fps: number; rays: number} | null {
      if (now - last > GAP_MS) {
        start = now
        frames = 0
      }
      last = now
      frames++
      if (now - start < WINDOW_MS) return null
      // 区間の始まりの知らせは数えない（その前のフレームの終わりなので）
      const fps = ((frames - 1) * 1000) / (now - start)
      start = now
      frames = 1
      const limit = now < ceiling.until ? ceiling.rays : max
      const step = Math.max(STEP, Math.round((rays * STEP_RATIO) / UNIT) * UNIT)
      if (fps >= RAISE_FPS && rays < limit) rays = Math.min(limit, rays + step)
      else if (fps < LOWER_FPS && rays > min) {
        rays = Math.max(min, rays - step)
        ceiling = {rays, until: now + HOLD_MS}
      }
      return {fps, rays}
    }
  }
}

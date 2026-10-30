// 訪問者が変えたロゴと光の置き方。ロゴはドラッグで動かし、ピンチ（指とトラックパッド）で大きさを変え、光は光源をつまんで回す。
// どれも既定からのずれで持ち、フッターの戻す操作で既定へ戻す（Light.tsx）

export type Arrangement = {
  /** ロゴをもとの位置から動かした量 px */
  offset: {x: number; y: number}
  /** ロゴの大きさの倍率 */
  scale: number
  /** 上の光と下の光の向きを、ロゴのもとの位置を向く向きから回した角度。ラジアン */
  turn: {upper: number; under: number}
}

export const DEFAULT_ARRANGEMENT: Arrangement = {offset: {x: 0, y: 0}, scale: 1, turn: {upper: 0, under: 0}}

/** ロゴの大きさの倍率の範囲 */
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2

export const isDefault = ({offset, scale, turn}: Arrangement) =>
  offset.x === 0 && offset.y === 0 && scale === 1 && turn.upper === 0 && turn.under === 0

/** 既定からのずれを left 倍にする。0 で既定 */
export const shrink = ({offset, scale, turn}: Arrangement, left: number): Arrangement => ({
  offset: {x: offset.x * left, y: offset.y * left},
  scale: 1 + (scale - 1) * left,
  turn: {upper: turn.upper * left, under: turn.under * left}
})

/** 角度を -π〜π に収める。回した量を既定の向きからの近い側で持つため */
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

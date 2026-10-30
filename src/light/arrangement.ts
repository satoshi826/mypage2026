// 訪問者が変えたロゴと光の置き方。ロゴはドラッグで動かし、ピンチ（指とトラックパッド）かフッターのロゴの設定で大きさを変える。
// 光はフッターのライトの設定で、向きと明るさを変える。
// どれも既定からのずれで持ち、フッターの戻す操作で既定へ戻す（Light.tsx）

/** 1 つの光の設定 */
export type LampSetting = {
  /** 照らす向き。上の光は真下、下の光は真上から右へ傾けた角度で、ラジアン。null ならロゴの今の位置を向く */
  tilt: number | null
  /** 明るさの倍率。1 が既定 */
  power: number
}

export type Arrangement = {
  /** ロゴをもとの位置から動かした量 px */
  offset: {x: number; y: number}
  /** ロゴの大きさの倍率 */
  scale: number
  /** 上の光と下の光 */
  lamps: {upper: LampSetting; under: LampSetting}
}

export type LampKey = keyof Arrangement['lamps']

export const DEFAULT_ARRANGEMENT: Arrangement = {
  offset: {x: 0, y: 0},
  scale: 1,
  lamps: {upper: {tilt: null, power: 1}, under: {tilt: null, power: 1}}
}

/** ロゴの大きさの倍率の範囲 */
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2

/** 光の向きを傾けられる範囲。真下（下の光は真上）から左右にこれだけ。ラジアン */
export const MAX_TILT = Math.PI / 2

/** 光の明るさの倍率の上限 */
export const MAX_POWER = 2

const isDefaultLamp = ({tilt, power}: LampSetting) => tilt === null && power === 1

export const isDefault = ({offset, scale, lamps}: Arrangement) =>
  offset.x === 0 && offset.y === 0 && scale === 1 && isDefaultLamp(lamps.upper) && isDefaultLamp(lamps.under)

/**
 * 既定からのずれを left 倍にする。0 で既定。向きは途中の値を持たずに、すぐロゴを向く向きへ戻す
 * （光の向きは Light が滑らかに追うので、跳ばない）
 */
export const shrink = ({offset, scale, lamps}: Arrangement, left: number): Arrangement => {
  const lamp = ({power}: LampSetting): LampSetting => ({tilt: null, power: 1 + (power - 1) * left})
  return {
    offset: {x: offset.x * left, y: offset.y * left},
    scale: 1 + (scale - 1) * left,
    lamps: {upper: lamp(lamps.upper), under: lamp(lamps.under)}
  }
}

/** 角度を -π〜π に収める */
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

/** 傾けていないときの向き（上の光は真下、下の光は真上）と、右へ傾けたときに角度が増える向きか */
const STRAIGHT = {upper: {angle: Math.PI / 2, sign: -1}, under: {angle: -Math.PI / 2, sign: 1}}

/** 傾きから、画面の上の向き（右が 0 で時計回り。画面の y は下向き）にする */
export const angleOf = (key: LampKey, tilt: number) => STRAIGHT[key].angle + STRAIGHT[key].sign * tilt

/** 画面の上の向きから傾きにする */
export const tiltOf = (key: LampKey, angle: number) => STRAIGHT[key].sign * wrapAngle(angle - STRAIGHT[key].angle)

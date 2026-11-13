// 訪問者が変えたロゴと光の置き方。ロゴはドラッグで動かし、ピンチ（指とトラックパッド）かフッターのロゴの設定で大きさを変える。
// 光は光源をドラッグで動かし、フッターのライトの設定で広がりと強さを変える（向きはいつもロゴを向く）。
// どれも既定からのずれで持ち、フッターの戻す操作で既定へ戻す（Light.tsx）

/** 1 つの光の設定 */
export type LampSetting = {
  /** 光源をもとの位置から動かした量 px */
  offset: {x: number; y: number}
  /** 広がり。光の向きから左右に広げる角度で、度。tuning の cone（下の光は underCone）と同じ単位。null なら tuning の値 */
  cone: number | null
  /** 強さ。tuning の power（下の光は underPower）と同じ単位。null なら tuning の値 */
  power: number | null
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
  lamps: {
    upper: {offset: {x: 0, y: 0}, cone: null, power: null},
    under: {offset: {x: 0, y: 0}, cone: null, power: null}
  }
}

/** ロゴの大きさの倍率の範囲 */
export const MIN_SCALE = 0.5
/** 大きさの倍率の上限。狭い画面（スマホ）では部屋が小さいので低くする */
export const MAX_SCALE = {wide: 4, narrow: 3}

/** 光の広がりの範囲。度 */
export const MIN_CONE = 5
export const MAX_CONE = 90

/** 光の強さの上限。tuning の power と同じ単位 */
export const MAX_POWER = 200

const isDefaultLamp = ({offset, cone, power}: LampSetting) =>
  offset.x === 0 && offset.y === 0 && cone === null && power === null

export const isDefault = ({offset, scale, lamps}: Arrangement) =>
  offset.x === 0 && offset.y === 0 && scale === 1 && isDefaultLamp(lamps.upper) && isDefaultLamp(lamps.under)

/** 光の既定の強さと広がり（tuning の値） */
export type LampStandard = {power: number; cone: number}

/** 既定からのずれを left 倍にする。0 で既定。強さと広がりは既定の値 standards へ寄せる */
export const shrink = (
  {offset, scale, lamps}: Arrangement,
  left: number,
  standards: Record<LampKey, LampStandard>
): Arrangement => {
  const lamp = (key: LampKey): LampSetting => {
    const {offset, power, cone} = lamps[key]
    const toward = (value: number | null, standard: number) =>
      value === null ? null : standard + (value - standard) * left
    return {
      offset: {x: offset.x * left, y: offset.y * left},
      cone: toward(cone, standards[key].cone),
      power: toward(power, standards[key].power)
    }
  }
  return {
    offset: {x: offset.x * left, y: offset.y * left},
    scale: 1 + (scale - 1) * left,
    lamps: {upper: lamp('upper'), under: lamp('under')}
  }
}

/** 角度を -π〜π に収める */
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

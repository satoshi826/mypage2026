import {useExternal} from '../app/useExternal'
import type {LampKey, LampSetting} from './arrangement'

// フッターに出すロゴとライトの操作（ロゴの素材と大きさ、光の向きと明るさ、変えた置き方を戻す操作）の受け渡し。状態と操作は Light が持ち、
// マウント中だけここへ出す。フッターはここを読んで描く。光の層のチャンク（worker・シェーダ）は読み込まない。

/** ロゴの素材。白い面（ばらばらの向きに散らして返す）、ガラス（屈折して中を通り抜ける）、金属（鏡の向きの近くに返す） */
export const MATERIALS = ['matte', 'glass', 'metal'] as const
export type Material = (typeof MATERIALS)[number]

/** フッターに出す 1 つの光の設定と、今照らしている向き */
export type LampControl = {
  /** 傾けた向き。null ならロゴの今の位置を向く（Auto） */
  tilt: number | null
  /** 今照らしている向き。傾き（tilt と同じ測り方）で、1 度に丸めたもの。ロゴを向いているときもこの値 */
  facing: number
  /** 強さ。既定のままのときは tuning の値 */
  power: number
  /** 既定の強さ（tuning の値） */
  standard: number
}

export type LogoControls = {
  /** 光がつききっている（hero が隠れている）か。そのあいだだけフッターにロゴとライトの操作を出す */
  lit: boolean
  /** ロゴか光の置き方、ロゴの素材を既定から変えたか。光がついていて、変えてあるあいだだけ戻す操作を出す */
  changed: boolean
  /** ロゴと光の置き方と、ロゴの素材を既定へ戻す */
  reset: () => void
  /** ロゴの素材 */
  material: Material
  /** ロゴの素材を切り替える */
  setMaterial: (material: Material) => void
  /** ロゴの大きさの倍率。0.01 に丸めたもの */
  scale: number
  setScale: (scale: number) => void
  /** 上の光と下の光 */
  lamps: Record<LampKey, LampControl>
  /** 光の設定のうち、渡した項目だけ変える */
  setLamp: (key: LampKey, change: Partial<LampSetting>) => void
}

let current: LogoControls | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Light が状態の変わるたびに呼ぶ。外れるときは null */
export function setLogoControls(controls: LogoControls | null) {
  current = controls
  for (const listener of listeners) listener()
}

/** フッターが読む。光の層がないページとプリレンダでは null */
export function useLogoControls() {
  return useExternal(subscribe, () => current, null)
}

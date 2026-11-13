import {useExternal} from '../app/useExternal'
import type {LampKey, LampSetting, LampStandard} from './arrangement'
import type {Loop, Repeat} from './motion'

// フッターに出すロゴとライトの操作（ロゴの素材と大きさ、光の広がりと明るさ、変えた置き方を戻す操作）の受け渡し。状態と操作は Light が持ち、
// マウント中だけここへ出す。フッターはここを読んで描く。光の層のチャンク（worker・シェーダ）は読み込まない。

/** ロゴの素材。白い面（ばらばらの向きに散らして返す）、ガラス（屈折して中を通り抜ける）、金属（鏡の向きの近くに返す） */
export const MATERIALS = ['matte', 'glass', 'metal'] as const
export type Material = (typeof MATERIALS)[number]

/** フッターに出す 1 つの光の設定。どれも既定のままのときは tuning の値 */
export type LampControl = {
  /** 強さ */
  power: number
  /** 広がり。度 */
  cone: number
  /** 既定の強さと広がり（tuning の値） */
  standard: LampStandard
}

export type LogoControls = {
  /** フッターにロゴとライトの操作を出すか。光がつききって、一番下にいるあいだだけ出す */
  available: boolean
  /** ロゴか光の置き方、ロゴの素材と形の動きを既定から変えたか。操作を出していて、変えてあるあいだだけ戻す操作を出す */
  changed: boolean
  /** ロゴと光の置き方と、ロゴの素材を既定へ戻す */
  reset: () => void
  /** ロゴの素材 */
  material: Material
  /** ロゴの素材を切り替える */
  setMaterial: (material: Material) => void
  /** ロゴの形を動かしているか（motion.ts の動き） */
  animated: boolean
  setAnimated: (animated: boolean) => void
  /** 流している動き。止めているあいだは、最後に流した動き（まだなら最初の動き） */
  loop: Loop
  /** 動きを選ぶ。止めていれば動かし始める */
  setLoop: (loop: Loop) => void
  /** 動きの移り方。cycle は 1 周したら次の動きへ、loop は同じ動きを繰り返す */
  repeat: Repeat
  setRepeat: (repeat: Repeat) => void
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

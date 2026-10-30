import {useExternal} from '../app/useExternal'

// フッターに出すロゴの操作（素材の切り替えと、変えたロゴと光の置き方を戻す操作）の受け渡し。状態と操作は Light が持ち、
// マウント中だけここへ出す。フッターはここを読んで描く。光の層のチャンク（worker・シェーダ）は読み込まない。

/** ロゴの素材。白い面（ばらばらの向きに散らして返す）、和紙（中へ入って散り、内側から光る）、つや（鏡の向きの近くに返す） */
export const MATERIALS = ['matte', 'paper', 'gloss'] as const
export type Material = (typeof MATERIALS)[number]

export type LogoControls = {
  /** 光がつききっている（hero が隠れている）か。そのあいだだけフッターにロゴの操作を出す */
  lit: boolean
  /** ロゴか光の置き方を既定から変えたか。光がついていて、変えてあるあいだだけ戻す操作を出す */
  changed: boolean
  /** ロゴと光の置き方を既定へ戻す */
  reset: () => void
  /** ロゴの素材 */
  material: Material
  /** ロゴの素材を切り替える */
  setMaterial: (material: Material) => void
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

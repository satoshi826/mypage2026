import {useExternal} from '../app/useExternal'

// ロゴを動かしたあと、フッターからもとの位置へ戻すための受け渡し。状態と操作は Light が持ち、マウント中だけここへ
// 出す。フッターはここを読んで描く。光の層のチャンク（worker・シェーダ）は読み込まない。

export type Arrange = {
  /** ロゴがもとの位置から動いていて、光がついている（hero が隠れている）か。そのあいだだけフッターに戻す操作を出す */
  moved: boolean
  /** ロゴをもとの位置へ戻す */
  reset: () => void
}

let current: Arrange | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Light が状態の変わるたびに呼ぶ。外れるときは null */
export function setArrange(arrange: Arrange | null) {
  current = arrange
  for (const listener of listeners) listener()
}

/** フッターが読む。光の層がないページとプリレンダでは null */
export function useArrange() {
  return useExternal(subscribe, () => current, null)
}

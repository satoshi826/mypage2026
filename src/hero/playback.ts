import {useExternal} from '../app/useExternal'

// hero の再生操作をフッターに置くための受け渡し。状態と操作は Hero が持ち、マウント中だけここへ
// 出す。フッターはここを読んで描く。hero のチャンク（worker・シェーダ）は読み込まない。

export type Player = {
  autoplay: boolean
  shuffle: boolean
  /** hero の写真が 4 割以上見えているか。それより隠れたらフッターは操作を隠す */
  visible: boolean
  toggle: () => void
  toggleShuffle: () => void
  prev: () => void
  next: () => void
}

let current: Player | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Hero が状態の変わるたびに呼ぶ。外れるときは null */
export function setPlayer(player: Player | null) {
  current = player
  for (const listener of listeners) listener()
}

/** フッターが読む。hero がないページとプリレンダでは null */
export function usePlayer() {
  return useExternal(subscribe, () => current, null)
}

/**
 * フッターにある次の遷移までのプログレス（PC は再生操作の後ろ、スマホはフッターの上の線）。描かれているものを
 * HeroProgress がここへ入れ、Hero が毎フレーム --progress と --morph を書き込む。進み具合は連続値なので
 * state を通さない
 */
export const progressLines = new Set<HTMLDivElement>()

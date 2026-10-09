import {useSyncExternalStore} from 'react'

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

/** Hero が状態の変わるたびに呼ぶ。外れるときは null */
export function setPlayer(player: Player | null) {
  current = player
  for (const listener of listeners) listener()
}

/** フッターが読む。hero がないページとプリレンダでは null */
export function usePlayer() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => null
  )
}

/**
 * フッターにある次の遷移までのプログレス。フッターが ref として渡し、Hero が毎フレーム
 * --progress と --morph を書き込む。進み具合は連続値なので React の state を通さない
 */
export const progressLine: {current: HTMLDivElement | null} = {current: null}

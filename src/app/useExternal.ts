import {useEffect, useReducer, useRef, useState} from 'preact/hooks'

let hydrating = true

/** main.tsx が最初の描画（hydration）を終えたら呼ぶ。そこから先に描くものは、最初からブラウザの値で描く */
export const hydrated = () => {
  hydrating = false
}

/**
 * 外の値（モジュールのストア、ブラウザの状態）を読み、変わったら描き直す。React の useSyncExternalStore に
 * 当たるもの（Preact の本体には無い）。
 * プリレンダと hydration の最初の描画では server を使い、描いたあとにブラウザの値へ切り替える。サーバと
 * ブラウザの最初の出力をそろえるため。subscribe は描くたびに作り直さないこと（購読し直しになる）
 */
export function useExternal<T>(subscribe: (onChange: () => void) => () => void, get: () => T, server: T): T {
  const [client, setClient] = useState(!hydrating)
  const [, update] = useReducer((n: number) => n + 1, 0)
  const value = client ? get() : server
  // 購読の中からは、最後に描いた値と今の読み方を見る
  const last = useRef({value, get})
  last.current = {value, get}
  useEffect(() => {
    setClient(true)
    // 描いてから購読するまでに変わっていることがある（後から描かれた要素など）ので、一度読み直す
    const check = () => !Object.is(last.current.get(), last.current.value) && update(0)
    check()
    return subscribe(check)
  }, [subscribe])
  return value
}

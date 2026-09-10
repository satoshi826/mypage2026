import {useCallback, useEffect, useRef} from 'react'

/** 要素の上のポインタ。位置は要素の中心を原点とする NDC で、端が ±1 */
export type PointerSample = {
  x: number
  y: number
  /** 前回取り出してからの移動量 */
  dx: number
  dy: number
  active: boolean
}

/**
 * ポインタを要素基準の NDC で追う。pointer イベントなのでマウスも指も同じ扱いになる。
 *
 * 毎フレーム読む前提なので state ではなく ref に溜め、取り出す関数を返す。
 * 持つのは位置と移動量だけで、速度は読む側がフレーム間隔で割って作る
 * （イベントの発火間隔に依存させないため）。
 */
export function usePointer(ref: {current: HTMLElement | null}) {
  const pointer = useRef<PointerSample>({x: 0, y: 0, dx: 0, dy: 0, active: false})

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 矩形はイベントごとに測らずキャッシュする。毎フレーム style を書いているので、
    // ポインタの頻度で測ると強制同期レイアウトになる
    let rect = el.getBoundingClientRect()
    const refresh = () => {
      rect = el.getBoundingClientRect()
    }

    const move = (event: PointerEvent) => {
      if (!rect.width || !rect.height) return // 寸法が決まる前は NaN を作らない
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = 1 - ((event.clientY - rect.top) / rect.height) * 2
      const p = pointer.current
      // 入ってきた1点目は移動量に数えない（画面外からの飛びを力にしないため）
      if (p.active) {
        p.dx += x - p.x
        p.dy += y - p.y
      }
      p.x = x
      p.y = y
      p.active = true
    }

    // スクロールに移った指は pointercancel で切れる。ページのスクロールは妨げない
    const leave = () => {
      pointer.current.active = false
    }

    const observer = new ResizeObserver(refresh)
    observer.observe(el)
    addEventListener('scroll', refresh, {passive: true})
    addEventListener('resize', refresh)
    el.addEventListener('pointerdown', move)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('pointercancel', leave)

    return () => {
      observer.disconnect()
      removeEventListener('scroll', refresh)
      removeEventListener('resize', refresh)
      el.removeEventListener('pointerdown', move)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('pointercancel', leave)
    }
  }, [ref])

  // 移動量つきで現在のポインタを取り出す。取り出した時点で移動量は 0 に戻る
  return useCallback((): PointerSample => {
    const p = pointer.current
    const sample = {x: p.x, y: p.y, dx: p.dx, dy: p.dy, active: p.active}
    p.dx = 0
    p.dy = 0
    return sample
  }, [])
}

import {useCallback, useState} from 'preact/hooks'
import type {Stage} from '../app/stage'
import {Hero} from '../hero/Hero'
import {useCanvas, useCanvasResize} from './useCanvas'
import {Light} from '../light/Light'
import type {Drawn} from './worker'
import Worker from './worker?worker'

/**
 * トップの舞台の canvas と、その上に描く hero（写真の粒子）と光の層。canvas と worker（worker.ts）は 1 つで、
 * hero と光はそれぞれ指示を送る。canvas は画面いっぱいに置き、ツールバーが引っ込んで画面が伸びたときの高さ
 * （100lvh）まで下へ伸ばす（伸ばさないと、Android などで画面の下に光の届かない帯ができる）。
 *
 * @param photos hero 用の派生画像の URL。空なら hero は出さず、光だけを描く。並びが変わったら、呼ぶ側が key で舞台ごと
 *   作り直す（編集で hero を選び直したとき）
 */
export function Scene({
  photos,
  stage,
  room
}: {
  photos: string[]
  stage: {current: Stage}
  room: {readonly current: HTMLElement | null}
}) {
  // 光の 1 フレームを描き終えた知らせを受けるもの（Light）
  const [drawn] = useState(() => new Set<() => void>())
  const listen = useCallback(
    (onDrawn: () => void) => {
      drawn.add(onDrawn)
      return () => void drawn.delete(onDrawn)
    },
    [drawn]
  )
  const {canvas, post, ref} = useCanvas<Drawn>(Worker, () => {
    for (const onDrawn of drawn) onDrawn()
  })
  useCanvasResize(post, ref)

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[100lvh]" aria-hidden>
        {canvas}
      </div>
      <Light stage={stage} room={room} screen={ref} post={post} listen={listen} />
      {photos.length > 0 && <Hero photos={photos} stage={stage} post={post} />}
    </>
  )
}

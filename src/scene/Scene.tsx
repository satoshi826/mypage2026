import {useCallback, useEffect, useState} from 'preact/hooks'
import type {Stage} from '../app/stage'
import {Hero} from '../hero/Hero'
import {useCanvas, useCanvasResize} from './useCanvas'
import {Light} from '../light/Light'
import type {Reply} from './worker'
import Worker from './worker?worker'

/**
 * トップの舞台の canvas と、その上に描く hero（写真の粒子）と光の層。canvas と worker（worker.ts）は 1 つで、
 * hero と光はそれぞれ指示を送る。canvas は画面いっぱいに置き、ツールバーが引っ込んで画面が伸びたときの高さ
 * （100lvh）まで下へ伸ばす（伸ばさないと、Android などで画面の下に光の届かない帯ができる）。
 *
 * @param photos hero 用の派生画像の URL。空なら hero は出さず、光だけを描く
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
  // 読み込みが済んだ写真の番号。worker が1枚上げるごとに増える
  const [available, setAvailable] = useState<number[]>([])
  // 光の 1 フレームを描き終えた知らせを受けるもの（Light）
  const [drawn] = useState(() => new Set<() => void>())
  const listen = useCallback(
    (onDrawn: () => void) => {
      drawn.add(onDrawn)
      return () => void drawn.delete(onDrawn)
    },
    [drawn]
  )
  const {canvas, post, ref} = useCanvas<Reply>(Worker, (reply) => {
    if ('drawn' in reply) {
      for (const onDrawn of drawn) onDrawn()
      return
    }
    // 計測の印（bench/）。canvas は LCP の対象にならないので、写真が届いた時刻をここで残す
    performance.mark('hero:photo')
    setAvailable((prev) => [...prev, reply.layer].sort((a, b) => a - b))
  })
  useCanvasResize(post, ref)

  // 写真は起動時に一度だけ送る。並びが変わったら、呼ぶ側が key で舞台ごと作り直す（編集で hero を選び直したとき）
  const [first] = useState(photos)
  useEffect(() => {
    if (first.length > 0) post({photos: first})
  }, [post, first])

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[100lvh]" aria-hidden>
        {canvas}
      </div>
      <Light stage={stage} room={room} screen={ref} post={post} listen={listen} />
      {photos.length > 0 && <Hero photos={photos} available={available} stage={stage} post={post} />}
    </>
  )
}

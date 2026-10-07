import {useEffect, useRef, useState} from 'react'
import {gallerySrc, thumbSrc, type Photo} from '../photos'

/** 画面からこれだけ離れたら読み込み、これより離れたら外す。画面の高さに対する割合 */
const RANGE = '250% 0px'

/**
 * 一覧の画像。普段は長辺 800 の thumb、広げているあいだは長辺 2000 の gallery を読む。
 *
 * - ブラウザの loading="lazy" は画面に近づくまで読まず、慣性スクロールだと間に合わないので、
 *   自前で 2〜3 画面分手前から読み始める。最初の数枚は即座に読む。
 * - 画面から離れたら src を外す。135 枚ぶんのデコード済み画像（1 枚 1.7MB 前後）を
 *   持ち続けると、メモリの少ない端末ではブラウザが捨てて読み直す往復でカクつく。
 *   枠と寸法は残すのでレイアウトは動かない。広げているあいだは外さない。
 * - 読んだ画像は表示に入れる前にデコードまで済ませる。描画のフレームでデコードが走ると
 *   そのフレームが遅れ、スクロールがカクつくため。差し替えのあいだは前の画像を見せたままにする。
 */
export function Img({
  photo,
  alt,
  index,
  large = false
}: {
  photo: Photo
  alt: string
  index: number
  /** 大きい派生を読む（広げているあいだ） */
  large?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [near, setNear] = useState(index < 6)
  const [shown, setShown] = useState<string | null>(null)
  const src = large ? gallerySrc(photo) : thumbSrc(photo)

  useEffect(() => {
    const img = ref.current
    if (!img) return
    // 監視するのは枠（figure）。src を外した img は箱を持たなくなり、交差を拾えないため
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {rootMargin: RANGE})
    observer.observe(img.closest('figure') ?? img)
    return () => observer.disconnect()
  }, [])

  const active = near || large

  useEffect(() => {
    if (!active) return
    let alive = true
    const loader = new Image()
    loader.src = src
    // decode は失敗しても（対応外の形式など）表示自体は試みる
    loader
      .decode()
      .catch(() => {})
      .then(() => alive && setShown(src))
    return () => {
      alive = false
    }
  }, [active, src])

  return (
    <img
      ref={ref}
      src={active && shown ? shown : undefined}
      alt={alt}
      width={photo.w}
      height={photo.h}
      className="block h-auto w-full"
    />
  )
}

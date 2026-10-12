import {useEffect, useState} from 'react'
import {gallerySrc, thumbSrc, type Photo} from '../photos'

/**
 * 一覧の画像。普段は長辺 800 の thumb、広げているあいだは長辺 2000 の gallery を読む。
 *
 * - 一覧（Gallery）は画面に近い写真だけを描くので、描かれた時点で読み始める。画面から離れた写真は
 *   要素ごと外れ、デコード済みの画像も手放す。135 枚ぶん（1 枚 1.7MB 前後）を持ち続けると、
 *   メモリの少ない端末ではブラウザが捨てて読み直す往復でカクつく。広げた写真も同じで、離れたら
 *   大きい派生（デコード後 1 枚 10MB 前後）を手放す。
 * - 読んだ画像は表示に入れる前にデコードまで済ませる。描画のフレームでデコードが走ると
 *   そのフレームが遅れ、スクロールがカクつくため。差し替えのあいだは前の画像を見せたままにする。
 */
export function Img({
  photo,
  alt,
  large = false,
  zoom = false
}: {
  photo: Photo
  alt: string
  /** 大きい派生を読む（広げているあいだ） */
  large?: boolean
  /**
   * 親の figure（group）にマウスを載せたあいだ、枠の中で少しズームする。倍率・秒数・イージングは
   * Gallery が CSS 変数で渡す。hover の無い端末（タッチだけ）と、動きを減らす設定では動かない
   */
  zoom?: boolean
}) {
  const [shown, setShown] = useState<string | null>(null)
  const src = large ? gallerySrc(photo) : thumbSrc(photo)

  useEffect(() => {
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
  }, [src])

  return (
    <img
      src={shown ?? undefined}
      alt={alt}
      width={photo.w}
      height={photo.h}
      className={`block h-auto w-full ${zoom ? 'transition-[scale] duration-(--hover-seconds) ease-(--hover-ease) motion-safe:group-hover:scale-(--hover-zoom)' : ''}`}
    />
  )
}

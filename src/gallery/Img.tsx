import {useEffect, useState} from 'react'
import {pickSource, type Photo, type Source} from '../photos'

/**
 * 一覧の画像。表示幅 × 画面の密度に足りる一番小さい派生を読む（photos の pickSource）。普段は一覧用、
 * 広げているあいだは拡大用。
 *
 * - 一覧（Gallery）は画面に近い写真だけを描くので、描かれた時点で読み始める。画面から離れた写真は
 *   要素ごと外れ、デコード済みの画像も手放す。全部を持ち続けると、メモリの少ない端末ではブラウザが
 *   捨てて読み直す往復でカクつく。描き直されたときは、そのときの表示幅で選び直す。
 * - 列数を変えてより大きい派生が要るようになったら読み直す。小さくて済むようになったときは、
 *   読み込み済みの大きい画像をそのまま使う（読み直すほうが重い）。一覧用と拡大用を行き来するときは読み直す。
 * - 読んだ画像は表示に入れる前にデコードまで済ませる。描画のフレームでデコードが走ると
 *   そのフレームが遅れ、スクロールがカクつくため。差し替えのあいだは前の画像を見せたままにする。
 */
export function Img({
  photo,
  alt,
  width,
  large = false,
  zoom = false
}: {
  photo: Photo
  alt: string
  /** 表示幅（CSS の px） */
  width: number
  /** 拡大用の派生を読む（広げているあいだ） */
  large?: boolean
  /**
   * 親の figure（group）にマウスを載せたあいだ、枠の中で少しズームする。倍率・秒数・イージングは
   * Gallery が CSS 変数で渡す。hover の無い端末（タッチだけ）と、動きを減らす設定では動かない
   */
  zoom?: boolean
}) {
  const [shown, setShown] = useState<Source | null>(null)
  const needed = pickSource(photo, width * devicePixelRatio, large)
  const wanted = shown && shown.use === needed.use && shown.width >= needed.width ? shown : needed

  useEffect(() => {
    if (shown?.src === wanted.src) return
    let alive = true
    const loader = new Image()
    loader.src = wanted.src
    // decode は失敗しても（対応外の形式など）表示自体は試みる
    loader
      .decode()
      .catch(() => {})
      .then(() => alive && setShown(wanted))
    return () => {
      alive = false
    }
    // 読むかどうかは読む先（src）だけで決まる。shown と wanted はその時点の値を使えばよい
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted.src])

  return (
    <img
      src={shown?.src}
      alt={alt}
      width={photo.w}
      height={photo.h}
      className={`block h-auto w-full ${zoom ? 'transition-[scale] duration-(--hover-seconds) ease-(--hover-ease) motion-safe:group-hover:scale-(--hover-zoom)' : ''}`}
    />
  )
}

import {useEffect, useState} from 'preact/hooks'
import {pickSource, type Photo, type Source} from '../photos'

/** 差し替えを 1 フレームにこの枚数ずつに分ける */
const SWAPS_PER_FRAME = 6
const queue: (() => void)[] = []
let frame = 0

/** 差し替えを順番待ちに入れる。取り消す関数を返す */
function schedule(swap: () => void) {
  queue.push(swap)
  frame ||= requestAnimationFrame(flush)
  return () => {
    const i = queue.indexOf(swap)
    if (i >= 0) queue.splice(i, 1)
  }
}

function flush() {
  frame = 0
  for (const swap of queue.splice(0, SWAPS_PER_FRAME)) swap()
  if (queue.length) frame = requestAnimationFrame(flush)
}

/**
 * 一覧の画像。表示幅 × 画面の密度に足りる一番小さい派生を読む（photos の pickSource）。普段は一覧用、
 * 広げているあいだは拡大用。
 *
 * - 一覧（Gallery）は画面に近い写真だけを描くので、描かれた時点で読み始める。画面から離れた写真は
 *   要素ごと外れ、デコード済みの画像も手放す。全部を持ち続けると、メモリの少ない端末ではブラウザが
 *   捨てて読み直す往復でカクつく。描き直されたときは、そのときの表示幅で選び直す。
 * - 列数を変えてより大きい派生が要るようになったら読み直す。小さくて済むようになったときは、
 *   読み込み済みの大きい画像をそのまま使う（読み直すほうが重い）。一覧用と拡大用を行き来するときは読み直す。
 * - 段組が動いているあいだ（hold）は、読み込みとデコードだけ進めて、差し替えは止まってから行う。
 *   列数を減らすと多くの写真が一斉に大きい段へ替わり、その処理が動きと重なってカクつくため。動いている
 *   あいだは小さい段が引き伸ばされて少しぼやけ、止まった時点でくっきりする。止まったあとも一度に全部を
 *   替えると 1 フレームが重くなるので、1 フレームに SWAPS_PER_FRAME 枚ずつ替える。まだ何も出ていない
 *   写真と、広げる写真（Gallery が hold を渡さない）は待たない
 * - 読んだ画像は表示に入れる前にデコードまで済ませる。描画のフレームでデコードが走ると
 *   そのフレームが遅れ、スクロールがカクつくため。差し替えのあいだは前の画像を見せたままにする。
 * - 最初の画像が出せるまでは img を置かない。src の無い img を、ブラウザは代替テキストや枠で描くため。
 */
export function Img({
  photo,
  alt,
  width,
  large = false,
  hold = false,
  zoom = false
}: {
  photo: Photo
  alt: string
  /** 表示幅（CSS の px） */
  width: number
  /** 拡大用の派生を読む（広げているあいだ） */
  large?: boolean
  /** 段組が動いているあいだ。差し替えを止まるまで待つ */
  hold?: boolean
  /**
   * 親の figure（group）にマウスを載せたあいだ、枠の中で少しズームする。倍率・秒数・イージングは
   * Gallery が CSS 変数で渡す。hover の無い端末（タッチだけ）と、動きを減らす設定では動かない
   */
  zoom?: boolean
}) {
  const [shown, setShown] = useState<Source | null>(null)
  // デコードまで済んで、差し替えを待っている画像
  const [ready, setReady] = useState<Source | null>(null)
  if (ready && !shown) setShown(ready)
  const waiting = !!ready && !!shown && ready !== shown && !hold
  useEffect(() => {
    if (waiting && ready) return schedule(() => setShown(ready))
  }, [waiting, ready])
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
      .then(() => alive && setReady(wanted))
    return () => {
      alive = false
    }
    // 読むかどうかは読む先（src）だけで決まる。shown と wanted はその時点の値を使えばよい
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted.src])

  if (!shown) return null
  return (
    <img
      src={shown.src}
      alt={alt}
      width={photo.w}
      height={photo.h}
      // つかんで引っぱれないようにする（Firefox は CSS の -webkit-user-drag を知らないので属性でも止める）
      draggable={false}
      className={`block h-auto w-full ${zoom ? 'transition-[scale] duration-(--hover-seconds) ease-(--hover-ease) motion-safe:group-hover:scale-(--hover-zoom)' : ''}`}
    />
  )
}

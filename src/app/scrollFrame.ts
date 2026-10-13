/** 位置を読む処理。書き込みがあれば、それを行う関数を返す */
type Measure = () => (() => void) | void

const measures = new Set<Measure>()
let frame = 0

const run = () => {
  frame = 0
  const writes = [...measures].map((measure) => measure())
  for (const write of writes) write?.()
}
const schedule = () => {
  frame ||= requestAnimationFrame(run)
}

/**
 * スクロールのたびの処理を、1 フレームに 1 回まとめて行う。全員が読み終えてから書く。書いた直後に位置や大きさを
 * 読むと、ブラウザはそのたびにスタイルとレイアウトを計算し直すため。
 * scroll イベントはそのフレームの requestAnimationFrame より先に届くので、遅れずに同じフレームで走る。
 * 止める関数を返す
 */
export function onScrollFrame(measure: Measure) {
  if (!measures.size) addEventListener('scroll', schedule, {passive: true})
  measures.add(measure)
  return () => {
    measures.delete(measure)
    if (measures.size) return
    removeEventListener('scroll', schedule)
    cancelAnimationFrame(frame)
    frame = 0
  }
}

import {GRID, buildTable, loadPixels} from './table'

// hero の写真を粒子の表（table.ts の buildTable）にする worker。デコードと並べ替えは 1 枚で数十 ms かかるので、
// 舞台の worker（描画）とも画面のスレッドとも別の worker で行い、描画を止めない。表はコピーせずに渡す

/** 読む写真。photo は番号で、そのまま返す */
export type LoadRequest = {photo: number; url: string}

/** 読めた写真の表。読めなかったときは table の代わりに failed */
export type LoadReply = {photo: number; table: Uint8Array} | {photo: number; failed: true}

onmessage = async ({data: {photo, url}}: MessageEvent<LoadRequest>) => {
  try {
    const table = buildTable(await loadPixels(url, GRID), GRID)
    postMessage({photo, table} satisfies LoadReply, {transfer: [table.buffer]})
  } catch (e) {
    console.error(`hero: ${url} を読めない`, e)
    postMessage({photo, failed: true} satisfies LoadReply)
  }
}

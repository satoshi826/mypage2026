import {SLOTS} from './table'
import type {LoadReply, LoadRequest} from './loader'
import Loader from './loader?worker'

// hero の写真を、舞台の粒子の表（アトラス）の SLOTS 枠に出し入れする。全部の写真を置くと GPU のメモリが写真の枚数に
// 比例して増える（31 枚で約 115MB）ので、要る写真だけを置き、ほかは上書きする。もう一度要るときは読み直す（写真の
// ファイルはブラウザのキャッシュから読む）。
// 要る写真は Hero が毎フレーム、要る順に渡す（want）。置いていない写真を 1 枚ずつ読み込み用の worker（loader.ts）で
// 表にし、空いている枠か、今は要らない枠のうち一番長く使っていない枠へ上げる（upload）

/**
 * @param urls hero の写真の URL。番号はこの並び
 * @param upload 表を枠へ上げる（舞台の worker へ送る）
 * @param onBroken 読めなかった写真の番号が増えたときに、その一覧で呼ぶ
 */
export function createLibrary(
  urls: readonly string[],
  upload: (slot: number, table: Uint8Array) => void,
  onBroken: (broken: readonly number[]) => void
) {
  const loader = new Loader()
  /** 枠ごとの写真の番号と、最後に要るとされた時刻（一番長く使っていない枠を選ぶため） */
  const slots = Array.from({length: SLOTS}, () => ({photo: null as number | null, used: 0}))
  const broken: number[] = []
  let wanted: readonly number[] = []
  let loading: number | null = null
  let clock = 0

  const slotOf = (photo: number) => {
    const slot = slots.findIndex((s) => s.photo === photo)
    return slot < 0 ? null : slot
  }

  const place = (photo: number, table: Uint8Array) => {
    // 要る写真の枠は上書きしない。空いている枠（used 0）が先に選ばれる
    let slot: number | null = null
    for (let i = 0; i < SLOTS; i++) {
      const held = slots[i].photo
      if (held !== null && wanted.includes(held)) continue
      if (slot === null || slots[i].used < slots[slot].used) slot = i
    }
    if (slot === null) return
    slots[slot] = {photo, used: ++clock}
    upload(slot, table)
    // 計測の印（bench/）。canvas は LCP の対象にならないので、写真が上がった時刻をここで残す
    performance.mark('hero:photo')
  }

  // 一度に 1 枚だけ読む。要る順の先頭から、まだ置いていない写真を選ぶ
  const pump = () => {
    if (loading !== null) return
    const next = wanted.find((photo) => slotOf(photo) === null && !broken.includes(photo))
    if (next === undefined) return
    loading = next
    loader.postMessage({photo: next, url: urls[next]} satisfies LoadRequest)
  }

  loader.onmessage = ({data}: MessageEvent<LoadReply>) => {
    loading = null
    if ('table' in data) place(data.photo, data.table)
    else {
      broken.push(data.photo)
      onBroken([...broken])
    }
    pump()
  }

  return {
    /** 要る写真を、要る順に渡す。毎フレーム呼んでよい。渡した写真の枠は上書きしない */
    want(photos: readonly number[]) {
      wanted = photos
      for (const photo of photos) {
        const slot = slotOf(photo)
        if (slot !== null) slots[slot].used = ++clock
      }
      pump()
    },
    /** 写真を置いた枠。まだ置いていなければ null */
    slotOf,
    dispose: () => loader.terminate()
  }
}

export type Library = ReturnType<typeof createLibrary>

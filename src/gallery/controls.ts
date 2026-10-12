import {useSyncExternalStore} from 'react'

// Photos の一覧の操作をフッターに置くための受け渡し（列数の切り替え）。
// 状態と操作は Gallery が持ち、マウント中だけここへ出す。フッターはここを読んで描く。

/** 列数。auto は画面の幅で決める（autoColumns） */
export type Columns = 'auto' | 2 | 3 | 4 | 5 | 6
export const COLUMNS: Columns[] = ['auto', 2, 3, 4, 5, 6]

/**
 * auto のときの列数。狭い画面（640px 未満）は 2 列、一覧が最大幅（1280px）に届く画面は 4 列、ほかは 3 列。
 * 4 列にするのは、写真 1 枚の幅が約 295px より小さくならない広さがあるときだけ
 */
export const autoColumns = (viewport: number) => (viewport < 640 ? 2 : viewport >= 1280 ? 4 : 3)

/** 選べる列数の上限。狭い画面（640px 未満）は 5 列まで。6 列だと写真 1 枚が約 58px になり、小さすぎるため */
export const maxColumns = (viewport: number) => (viewport < 640 ? 5 : 6)

export type GalleryControls = {
  columns: Columns
  setColumns: (columns: Columns) => void
}

let current: GalleryControls | null = null
const listeners = new Set<() => void>()

/** Gallery が描くたびに呼ぶ。外れるときは null */
export function setGalleryControls(controls: GalleryControls | null) {
  current = controls
  for (const listener of listeners) listener()
}

/** フッターが読む。一覧がないときとプリレンダでは null */
export function useGalleryControls() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => null
  )
}

/**
 * 選んだ列数。カテゴリを切り替えると一覧は作り直されるので、ここに置いて引き継ぐ。
 * ブラウザには残さず、ページを開き直すと auto に戻る
 */
let chosen: Columns = 'auto'
export const chosenColumns = () => chosen
export const rememberColumns = (columns: Columns) => {
  chosen = columns
}

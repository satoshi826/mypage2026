import {useExternal} from '../app/useExternal'

// Photos の一覧の操作をフッターに置くための受け渡し（列数の切り替え）。
// 状態と操作は Gallery が持ち、マウント中だけここへ出す。フッターはここを読んで描く。

/** 選べる列数 */
export type Count = 2 | 3 | 4 | 5 | 6
export const COUNTS: Count[] = [2, 3, 4, 5, 6]

/**
 * 列数の状態。auto は画面の幅で決める（autoColumns）。一度列数を選んだら、その列数に固定し、auto には戻らない。
 * スライダーに auto は無く、auto のあいだも実際の列数に点を置く（GalleryTools.tsx）
 */
export type Columns = 'auto' | Count

/** auto のときの列数。狭い画面（640px 未満）は 2 列、ほかは 3 列 */
export const autoColumns = (viewport: number) => (viewport < 640 ? 2 : 3)

/** 選べる列数の上限。狭い画面（640px 未満）は 5 列まで。6 列だと写真 1 枚が約 58px になり、小さすぎるため */
export const MAX_COLUMNS = {narrow: 5, wide: 6} as const satisfies Record<string, Count>
export const maxColumns = (viewport: number): Count => (viewport < 640 ? MAX_COLUMNS.narrow : MAX_COLUMNS.wide)

export type GalleryControls = {
  /** 実際の列数 */
  columns: number
  /** 列数を選んで固定する */
  setColumns: (columns: Count) => void
}

let current: GalleryControls | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Gallery が描くたびに呼ぶ。外れるときは null */
export function setGalleryControls(controls: GalleryControls | null) {
  current = controls
  for (const listener of listeners) listener()
}

/** フッターが読む。一覧がないときとプリレンダでは null */
export function useGalleryControls() {
  return useExternal(subscribe, () => current, null)
}

/**
 * 選んだ列数。カテゴリを切り替えると一覧は作り直されるので、ここに置いて引き継ぐ。
 * ブラウザには残さず、ページを開き直すと auto に戻る
 */
export const chosen: {columns: Columns} = {columns: 'auto'}

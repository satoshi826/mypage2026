import type {ComponentType} from 'preact'
import type {Photo} from '../photos'
import {useExternal} from './useExternal'

// サイトの上での編集（src/editor）の入口。訪問者の JS に入るのはこのファイルだけで、編集用の UI は
// ログインしている人にだけ動的 import で読み込む。
//
// ログインは /admin（Cloudflare Access で保護）で行い、通ったらこのブラウザに目印を残す。目印のある人だけ
// /api/session でログイン中かを確かめ、通れば編集用のコードを読む。目印のない訪問者は何もしない。

const MARK = 'mypage2026.editor'

const store = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // 保存できない環境（プライベートブラウズなど）では、編集の入口が出ないだけ
    }
  }
}

/** /admin を通ったときに呼ぶ */
export const remember = () => store.set(MARK, '1')
/** ログアウトしたときと、ログインが切れていたときに呼ぶ */
export const forget = () => store.set(MARK, null)

/** main.tsx が最初の描画のあとに呼ぶ */
export function startEditing() {
  if (store.get(MARK) !== '1') return
  fetch('/api/session', {cache: 'no-store'})
    .then((res) => {
      if (res.ok) return import('../editor').then(({mount}) => mount())
      if (res.status === 401 || res.status === 403) forget()
    })
    .catch(() => {})
}

// 編集の切り替え。切っているあいだは、下書きを訪問者と同じ見た目で確かめられる
const EDITING = 'mypage2026.editing'
let editing = store.get(EDITING) === '1'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function setEditing(next: boolean) {
  editing = next
  store.set(EDITING, next ? '1' : null)
  for (const listener of listeners) listener()
}

/** Gallery に差し込む編集の部品。編集用のコードが読み込まれたときに渡す */
export type EditorTools = {
  /** 写真の上に重ねる操作（hero、カテゴリ、差し替え、削除） */
  Photo: ComponentType<{photo: Photo}>
  /** 一覧の先頭に置く「＋」の枠の中身。押すと写真を足す */
  Add: ComponentType
}
let tools: EditorTools | null = null

/** 編集用のコードが読み込まれたときに呼ぶ（src/editor） */
export function editorReady(next: EditorTools) {
  tools = next
  for (const listener of listeners) listener()
}

/** 編集中なら差し込む部品、そうでなければ null。編集用のコードを読み込む前とプリレンダでは null */
export const useEditorTools = () => useExternal(subscribe, () => (editing ? tools : null), null)
/** 編集の UI を出しているか */
export const useEditing = () => !!useEditorTools()
/** 編集の UI を出しているか（描画の外から読むとき） */
export const isEditing = () => editing && !!tools

// 並べ替えでつかんでいる写真（src/editor/drag.ts）。Gallery はつかんでいるあいだ描き続け、組み替えの動きから外す
let dragging: string | null = null

export function setDragging(file: string | null) {
  dragging = file
  for (const listener of listeners) listener()
}
export const useDragging = () => useExternal(subscribe, () => dragging, null)

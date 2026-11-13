import {useExternal} from '../app/useExternal'
import {pickSource, type Photo} from '../photos'
import {DEFAULT_LIGHTBOX, type LightboxLook} from './tuning'

// 中央へ重ねて見せる写真（Lightbox.tsx）の状態と大きさ。一覧（Gallery）も、押したとき・隠すときに使う

/** 開いている写真と、矢印キーで替えられる写真（同じ一覧）。label は代替テキストに使う */
export type Opened = {photos: Photo[]; file: string; label: string}

let opened: Opened | null = null
const listeners = new Set<() => void>()
export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export function setOpened(next: Opened | null) {
  opened = next
  for (const listener of listeners) listener()
}

/** 見せ方。開発用パネルで変える。次に開くときから効く */
export let look = DEFAULT_LIGHTBOX
export const setLook = (next: LightboxLook) => {
  look = next
}

/** 狭い画面では幅いっぱい（左右の余白を除く）に収める */
const NARROW = '(max-width: 639px)'
/** 狭い画面の左右の余白 px */
const MARGIN = 16

export type Box = {left: number; top: number; width: number; height: number}

/** 写真を置く場所。画面の中央に、画面の幅と高さの look.size 倍に収まる大きさ */
export function boxOf(photo: Photo): Box {
  const maxWidth = matchMedia(NARROW).matches ? innerWidth - MARGIN * 2 : innerWidth * look.size
  const width = Math.min(maxWidth, (innerHeight * look.size * photo.w) / photo.h)
  const height = (width * photo.h) / photo.w
  return {left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height}
}

/** 拡大用の画像。一覧で押した瞬間にも読み始める（Gallery） */
export const lightboxSource = (photo: Photo) => pickSource(photo, boxOf(photo).width * devicePixelRatio, true).src

/** 写真を開く。photos は矢印キーで替えられる写真 */
export const openLightbox = (photos: Photo[], file: string, label: string) => setOpened({photos, file, label})

/** 開いている写真。閉じていれば null */
export const getOpened = () => opened

/** 一覧から持ち上げている写真。一覧はその写真を隠す。閉じる動きが終わるまで持ち上げたまま */
export const useLifted = () => useExternal(subscribe, () => opened?.file ?? null, null)

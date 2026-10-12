import {imageUrl, VARIANTS} from '../photos/manifest'
import {loadPhotos, toCategory} from '../photos'
import {listSources} from '../gallery/prefetch'

/** 先読みを控える回線の状態。Chrome 系だけが教えてくれる（Safari は分からないので先読みする） */
type Connection = {saveData?: boolean; effectiveType?: string}

/**
 * Service Worker（worker.ts）を登録し、表示に要る読み込みが落ち着いてから画像の先読みを頼む。本番だけで呼ぶ（main.tsx）。
 * 先読みするのは、この端末で列数をどれにしても一覧に要る派生で、今のカテゴリから順に全カテゴリ。
 * データセーバーがオンのときと、回線がごく遅い（slow-2g）と見積もられたときは先読みしない（古い版の掃除だけ頼む）。
 * 3g などで止めないのは、回線の見積もりが揺れる Wi-Fi でも 3g と出ることがあり、先読みがほとんど動かなくなるため
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (document.readyState === 'complete') void start()
  else addEventListener('load', () => void start(), {once: true})
}

async function start() {
  await navigator.serviceWorker.register('/sw.js')
  const [photos, registration] = await Promise.all([loadPhotos(), navigator.serviceWorker.ready, quiet()])
  // 今の一覧にある版だけを残す。差し替えや削除で古くなった版は消える
  const keep = photos.flatMap((photo) => [
    ...VARIANTS.map((variant) => imageUrl(variant.kind, photo)),
    ...(photo.hero ? [imageUrl('hero', photo)] : [])
  ])
  const category = toCategory(location.pathname.match(/^\/photos\/([^/]+)/)?.[1])
  const ordered = [...photos.filter((p) => p.category === category), ...photos.filter((p) => p.category !== category)]
  registration.active?.postMessage({type: 'images', keep, fetch: saving() ? [] : listSources(ordered)})
}

function saving() {
  const connection = (navigator as Navigator & {connection?: Connection}).connection
  return !!connection?.saveData || connection?.effectiveType === 'slow-2g'
}

/** これだけのあいだ新しい読み込みが始まらなければ、表示に要る読み込みは落ち着いたとみなす */
const QUIET = 2000

/**
 * 表示に要る読み込みが落ち着くまで待つ。Photos の画像は JS が一覧を取ってから読み始めるので、load の時点では
 * まだ途中のことが多い。先読みが割り込むと、最初に見える写真が遅れる
 */
const quiet = () =>
  new Promise<void>((resolve) => {
    // 読み込みの記録（Resource Timing）は既定で 250 件までしか溜まらないので、件数ではなく届くたびに数える
    let count = 0
    const observer = new PerformanceObserver((list) => (count += list.getEntries().length))
    observer.observe({type: 'resource'})
    let last = -1
    const check = () => {
      if (count === last) {
        observer.disconnect()
        resolve()
      } else {
        last = count
        setTimeout(check, QUIET)
      }
    }
    check()
  })

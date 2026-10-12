import {COLUMNS} from './controls'
import {gapFor} from './layout'
import {DEFAULT_SPACING} from './tuning'
import {pickSource, type Photo} from '../photos'

/** Photos の一覧の容器の最大幅と左右の余白（src/app/pages/Photos.tsx の max-w-7xl px-8 max-sm:px-4） */
const MAX_WIDTH = 1280
const padding = (viewport: number) => (viewport < 640 ? 16 : 32)

/**
 * この端末（画面の幅と密度）で、列数をどれに切り替えても一覧に要る派生画像の URL。写真の順に並べる。
 * Service Worker が先読みする（src/sw/register.ts）。写真の幅は Gallery と同じ式で出す（隙間は既定値）
 */
export function listSources(photos: Photo[]): string[] {
  const width = Math.min(innerWidth, MAX_WIDTH) - padding(innerWidth) * 2
  const widths = COLUMNS.filter((columns) => columns !== 'auto').map((cols) => {
    const gap = gapFor(width, cols, DEFAULT_SPACING)
    return (width - gap * (cols - 1)) / cols
  })
  const urls = new Set<string>()
  for (const photo of photos) for (const w of widths) urls.add(pickSource(photo, w * devicePixelRatio, false).src)
  return [...urls]
}

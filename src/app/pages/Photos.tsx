import {useParams} from 'wouter-preact'
import {CATEGORIES, toCategory, usePhotos, type Category} from '../../photos'
import {Gallery} from '../../gallery/Gallery'
import {Tabs, Underline} from '../Tabs'

const LABEL: Record<Category, string> = {street: 'Street', abstract: 'Abstract', color: 'Color'}

/**
 * 作品の一覧。カテゴリは URL（/photos/:category）で持つ。/photos は /photos/street へ転送する。
 * カテゴリの切り替えはフッターに置く（PhotoCategories）。
 * モノクロとカラーを同じ流れに混ぜないので「すべて」は置かない（docs/site.md）。
 */
export function Photos() {
  const params = useParams<{category?: string}>()
  const category = toCategory(params.category)
  const all = usePhotos()
  const photos = all?.filter((photo) => photo.category === category) ?? []

  // 一覧のまわりの余白は、上下も左右と同じ幅（PC 32px、狭い画面 16px）。見出しを置かないので、
  // 固定のナビとフッターの内側から同じ幅の額縁で囲む。下はホームインジケータのぶん（safe area）も足す
  return (
    <div className="mx-auto min-h-[100svh] max-w-7xl px-8 pt-[calc(var(--spacing-nav)+2rem)] pb-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+2rem)] max-sm:px-4 max-sm:pt-[calc(var(--spacing-nav)+1rem)] max-sm:pb-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+1rem)]">
      <Gallery key={category} photos={photos} label={LABEL[category]} />
    </div>
  )
}

/**
 * カテゴリの切り替え。フッターの左に置く。見た目と下線の動きはナビのページのリンクと同じ（Tabs.tsx）
 */
export function PhotoCategories({current}: {current: Category}) {
  const items = CATEGORIES.map((c) => ({
    href: `/photos/${c}`,
    label: LABEL[c],
    current: c === current
  }))
  return (
    <nav aria-label="カテゴリ" className="relative h-full">
      <Tabs items={items} />
      <Underline current={current} />
    </nav>
  )
}

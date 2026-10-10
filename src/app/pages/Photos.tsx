import {useParams} from 'wouter'
import {CATEGORIES, toCategory, usePhotos, type Category} from '../../photos'
import {Gallery} from '../../gallery/Gallery'
import {Tabs, Underline} from '../Tabs'

const LABEL: Record<Category, string> = {street: 'Street', abstract: 'Abstract', color: 'Color'}

/**
 * 作品の一覧。カテゴリは URL（/photos/:category）で持ち、既定は street。
 * カテゴリの切り替えはフッターに置く（PhotoCategories）。
 * モノクロとカラーを同じ流れに混ぜないので「すべて」は置かない（docs/site.md）。
 */
export function Photos() {
  const params = useParams<{category?: string}>()
  const category = toCategory(params.category)
  const all = usePhotos()
  const photos = all?.filter((photo) => photo.category === category) ?? []

  return (
    <div className="mx-auto min-h-[100svh] max-w-7xl px-8 pt-[calc(var(--spacing-nav)+3.5rem)] pb-24 max-sm:px-4">
      <Gallery key={category} photos={photos} label={LABEL[category]} />
    </div>
  )
}

/**
 * カテゴリの切り替え。フッターの左に置く。見た目と下線の動きはナビのページのリンクと同じ（Tabs.tsx）
 */
export function PhotoCategories({current}: {current: Category}) {
  const items = CATEGORIES.map((c) => ({
    href: c === 'street' ? '/photos' : `/photos/${c}`,
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

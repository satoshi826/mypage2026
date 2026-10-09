import {Link, useParams} from 'wouter'
import {CATEGORIES, toCategory, usePhotos, type Category} from '../../photos'
import {Gallery} from '../../gallery/Gallery'

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

/** カテゴリの切り替え。フッターの左に置く */
export function PhotoCategories({current}: {current: Category}) {
  return (
    <nav aria-label="カテゴリ" className="flex gap-6 text-xs tracking-[0.12em] max-sm:gap-3 max-sm:text-[0.625rem]">
      {CATEGORIES.map((c) => (
        <Link
          key={c}
          href={c === 'street' ? '/photos' : `/photos/${c}`}
          aria-current={c === current ? 'page' : undefined}
          className="no-underline opacity-55 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100 aria-[current=page]:opacity-100"
        >
          {LABEL[c]}
        </Link>
      ))}
    </nav>
  )
}

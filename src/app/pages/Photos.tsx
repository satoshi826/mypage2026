import {Link, useParams} from 'wouter'
import {CATEGORIES, usePhotos, type Category} from '../../photos'
import {Gallery} from '../../gallery/Gallery'

const LABEL: Record<Category, string> = {street: 'Street', abstract: 'Abstract', color: 'Color'}

/**
 * 作品の一覧。カテゴリは URL（/photos/:category）で持ち、既定は street。
 * モノクロとカラーを同じ流れに混ぜないので「すべて」は置かない（docs/site.md）。
 */
export function Photos() {
  const params = useParams<{category?: string}>()
  const category = toCategory(params.category)
  const all = usePhotos()
  const photos = all?.filter((photo) => photo.category === category) ?? []

  return (
    <div className="mx-auto min-h-[100svh] max-w-5xl px-8 pt-32 pb-24 max-sm:px-4">
      <nav className="mb-16 flex items-baseline gap-6 text-sm tracking-[0.12em]">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={c === 'street' ? '/photos' : `/photos/${c}`}
            aria-current={c === category ? 'page' : undefined}
            className="no-underline opacity-40 transition-opacity duration-300 hover:opacity-100 aria-[current=page]:opacity-100"
          >
            {LABEL[c]}
          </Link>
        ))}
      </nav>
      <Gallery key={category} photos={photos} label={LABEL[category]} />
    </div>
  )
}

const toCategory = (value: string | undefined): Category =>
  (CATEGORIES as readonly string[]).includes(value ?? '') ? (value as Category) : 'street'

import {useRef} from 'react'
import {Link, useParams} from 'wouter'
import {CATEGORIES, PHOTOS, type Category} from '../../photos'
import {LAYOUTS, useChoice} from '../../gallery/options'
import {useReveal, useRevealVariant} from '../../gallery/reveal'
import {Gallery} from '../../gallery/layouts'
import {GalleryPanel} from '../../gallery/GalleryPanel'

const LABEL: Record<Category, string> = {street: 'Street', abstract: 'Abstract', color: 'Color'}

/**
 * 作品の一覧。カテゴリは URL（/photos/:category）で持ち、既定は street。
 * モノクロとカラーを同じ流れに混ぜないので「すべて」は置かない（docs/site.md）。
 * 現れ方と見せ方は候補を比べる段階（docs/design.md）。
 */
export function Photos() {
  const params = useParams<{category?: string}>()
  const category = toCategory(params.category)
  const photos = PHOTOS.filter((photo) => photo.category === category)

  const root = useRef<HTMLDivElement>(null)
  const [variant, setVariant] = useRevealVariant()
  const [layout, setLayout] = useChoice('gallery-layout', LAYOUTS, 'masonry')
  useReveal(root, [category, variant, layout])

  return (
    <div ref={root} className="mx-auto min-h-[100svh] max-w-5xl px-8 pt-32 pb-24 max-sm:px-4">
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
      <Gallery key={`${layout}-${category}`} layout={layout} photos={photos} label={LABEL[category]} />
      {import.meta.env.DEV && (
        <GalleryPanel variant={variant} onVariant={setVariant} layout={layout} onLayout={setLayout} />
      )}
    </div>
  )
}

const toCategory = (value: string | undefined): Category =>
  (CATEGORIES as readonly string[]).includes(value ?? '') ? (value as Category) : 'street'

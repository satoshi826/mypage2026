import {useRoute} from 'wouter'
import {PhotoCategories} from './pages/Photos'
import {toCategory} from '../photos'
import {HeroPlayer} from '../hero/HeroPlayer'
import {INSTAGRAM, X} from './social'

const LINK = 'flex opacity-55 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100'

/**
 * 固定フッター。ナビと対になり、右に SNS、左にそのページ固有の操作を置く
 * （トップは hero の再生操作、Photos はカテゴリ）。
 * 左の中身は URL で選ぶ。ページから差し込む形にすると、プリレンダの HTML に入らないため。
 *
 * 高さは --spacing-footer。iPhone のホームインジケータに重ならないよう、そのぶん下に余白を足す。
 * 写真の配置（Gallery / hero）は、この要素の実寸か --spacing-footer を引いて重なりを避ける。
 */
export function Footer() {
  const [isTop] = useRoute('/')
  const [isPhotos, params] = useRoute('/photos/:category?')
  return (
    <footer className="pointer-events-none fixed right-[env(safe-area-inset-right)] bottom-0 left-[env(safe-area-inset-left)] z-10 box-border flex h-[calc(var(--spacing-footer)+env(safe-area-inset-bottom))] items-center justify-between gap-4 border-t border-white/10 bg-black/35 px-8 pb-[env(safe-area-inset-bottom)] backdrop-blur-[14px] max-sm:px-5">
      <div className="pointer-events-auto">
        {isTop && <HeroPlayer />}
        {isPhotos && <PhotoCategories current={toCategory(params?.category)} />}
      </div>
      <div className="pointer-events-auto flex items-center gap-5">
        <a href={INSTAGRAM} target="_blank" rel="noreferrer" aria-label="Instagram" className={LINK}>
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </a>
        <a href={X} target="_blank" rel="noreferrer" aria-label="X" className={LINK}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
        </a>
      </div>
    </footer>
  )
}

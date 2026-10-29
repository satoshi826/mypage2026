import {matchRoute, useLocation, useRouter} from 'wouter-preact'
import {PhotoCategories} from './pages/Photos'
import {toCategory} from '../photos'
import {HeroPlayer} from '../hero/HeroPlayer'
import {LogoReset} from '../light/LogoReset'
import {GalleryTools} from '../gallery/GalleryTools'
import {INSTAGRAM, X} from './social'
import {basePath, isBilingual, langOf, localized} from './lang'
import {Tabs, Underline} from './Tabs'
import {GLOW_HOVER} from './glow'

// 枠の幅は Photos の一覧の操作のアイコンと同じ（GalleryTools.tsx）。並ぶアイコンの間隔をそろえるため
const LINK = `glow-mark flex w-10 items-center justify-center opacity-55 transition-[opacity,filter] duration-300 hover:opacity-100 focus-visible:opacity-100 ${GLOW_HOVER} max-sm:w-8`

/**
 * 固定フッター。ナビと対になり、右に SNS、左にそのページ固有の操作を置く
 * （トップは hero の再生操作と動かしたロゴを戻す操作、Photos はカテゴリ、About と Contact は言語。Photos の一覧の操作は右の SNS の手前に仕切って置く）。上の線は、そのページの進み具合を示す
 * （Photos の一覧をどこまで見たか）。
 * 左の中身は場所で選ぶ。ページから差し込む形にすると、プリレンダの HTML に入らないため。
 * 場所は App が渡す表示中の場所で、ページの移動では中身（main）とは別の演出で消えて現れる
 * （[data-page-footer]、pageMotion.ts）。入れ替わる部分は will-change で普段から別の層にしておく。ぼかしで
 * 現れる演出が終わった瞬間に層が外れて文字を描き直すと、一瞬ぼけて見えるため
 *
 * バー全体でクリックを受け止める。下を流れる写真に、バー越しに触れられないようにするため。
 *
 * 高さは --spacing-footer。iPhone のホームインジケータに重ならないよう、そのぶん下に余白を足す。
 * 写真の配置（Gallery / hero）は、この要素の実寸か --spacing-footer を引いて重なりを避ける。
 */
export function Footer({location}: {location: string}) {
  const {parser} = useRouter()
  const isTop = location === '/'
  const [isPhotos, params] = matchRoute(parser, '/photos/:category?', location)
  // 選んでいるカテゴリは実際の URL から決める。下線をナビと同じく押した瞬間から滑らせるため
  const [actual] = useLocation()
  const [toPhotos, next] = matchRoute(parser, '/photos/:category?', actual)
  const category = toCategory((toPhotos ? next : params)?.category)
  return (
    <footer className="fixed right-[env(safe-area-inset-right)] bottom-0 left-[env(safe-area-inset-left)] z-10 box-border flex h-[calc(var(--spacing-footer)+env(safe-area-inset-bottom))] items-center justify-between gap-4 border-t border-white/10 bg-black/60 px-8 pb-[env(safe-area-inset-bottom)] backdrop-blur-[12px] max-sm:px-5">
      <div data-page-footer className="flex items-center self-stretch will-change-[opacity]">
        {/* トップは hero の再生操作と、動かしたロゴを戻す操作を同じ場所に重ねる。同時には出ない */}
        {isTop && (
          <div className="grid items-center self-stretch *:[grid-area:1/1]">
            <HeroPlayer />
            <LogoReset />
          </div>
        )}
        {isPhotos && <PhotoCategories current={category} />}
        {isBilingual(location) && <Languages current={isBilingual(actual) ? actual : location} />}
      </div>
      {/* 上の境界線に重ねて、一覧をどこまでスクロールしたかを伸ばす。styles.css の [data-scroll-progress] */}
      {isPhotos && (
        <div
          data-scroll-progress
          data-page-footer
          aria-hidden
          className="absolute inset-x-0 -top-px h-[0.5px] bg-ink/45 will-change-[opacity]"
        />
      )}
      {/* アイコンは枠の中央にあるので、枠の右の余白ぶん右へ寄せ、X の右端をナビの右端（Contact）にそろえる */}
      <div className="-mr-3 flex items-center gap-6 self-stretch max-sm:-mr-2 max-sm:gap-2.5">
        {/* Photos の一覧の操作。ページの移動では左側と一緒に消えて現れる */}
        {isPhotos && (
          <div data-page-footer className="flex self-stretch will-change-[opacity]">
            <GalleryTools />
          </div>
        )}
        {/* SNS との仕切り。ぼかさず、中央の点から上下へ伸びて現れ、点へ縮んで消える（[data-page-grow]） */}
        {isPhotos && <div data-page-grow aria-hidden className="h-5 w-[0.5px] bg-ink/35" />}
        <div className="flex gap-2 self-stretch max-sm:gap-1">
          <a href={INSTAGRAM} target="_blank" rel="noreferrer" aria-label="Instagram" className={LINK}>
            <svg
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              stroke-width={1.5}
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
      </div>
    </footer>
  )
}

/**
 * 日本語と英語の切り替え。About と Contact のフッターの左に置く。見た目と下線の動きは Photos のカテゴリと同じ。
 * 選んでいる側は実際の URL で決める（カテゴリと同じく、押した瞬間から下線を滑らせるため）。別のページへ移る
 * ときは、消えるまで今の言語のまま
 */
function Languages({current}: {current: string}) {
  const page = basePath(current)
  const items = (['ja', 'en'] as const).map((lang) => ({
    href: localized(page, lang),
    label: lang.toUpperCase(),
    current: langOf(current) === lang
  }))
  return (
    <nav aria-label="Language" className="relative h-full">
      <Tabs items={items} />
      <Underline current={current} />
    </nav>
  )
}

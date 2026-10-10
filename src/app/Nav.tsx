import {useLocation} from 'wouter'
import {NAV_ROUTES} from './routes'
import {TabLink, Tabs, Underline} from './Tabs'

/**
 * 固定ナビ。左に名前（mu、トップへのリンク）、右にページのリンク。選んでいるページの下に線を引き、
 * ページを移ると線が滑って移る。トップでは mu の下に来る（Tabs.tsx の Underline）
 */
export function Nav() {
  const [location] = useLocation()
  // Photos はカテゴリ別の URL（/photos/color など）でも選んでいる扱い
  const items = NAV_ROUTES.map(({path, label}) => ({
    href: path,
    label: label!,
    current: location === path || location.startsWith(`${path}/`)
  }))

  return (
    <nav className="fixed top-0 right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] z-10 box-border flex h-(--spacing-nav) items-stretch justify-between gap-4 border-b border-white/10 bg-black/35 px-8 backdrop-blur-[14px] max-sm:px-5">
      <TabLink
        href="/"
        label="mu"
        current={location === '/'}
        // pt は F1.8 の字面がリンクより高く見えるぶん、名前だけ少し下げるため
        className="pt-1 font-number text-sm tracking-[0.12em] max-sm:text-xs"
      />
      {/* 狭い画面では名前とリンクが1行に収まらず、ナビが2行に伸びて
          --spacing-nav とずれる。360px で収まるところまで詰める */}
      <Tabs items={items} className="font-light" />
      <Underline current={location} />
      {/* 下の境界線に重ねて、スクロールの進み具合を伸ばす。styles.css の [data-scroll-progress] */}
      <div data-scroll-progress aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-ink/35" />
    </nav>
  )
}

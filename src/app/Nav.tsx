import {Link, useLocation} from 'wouter-preact'
import {Logo} from './Logo'
import {NAV_ROUTES} from './routes'
import {Tabs, Underline} from './Tabs'

/**
 * 固定ナビ。左にロゴ（トップへのリンク）、右にページのリンク。選んでいるページの下に線を引き、
 * ページを移ると線が滑って移る（Tabs.tsx の Underline）。トップでは線を出さない。hero が主役で、
 * どのページにいるかを示す必要が薄いため。トップと他のページのあいだでは、線がその場で点へ縮んで
 * 消え、点から伸びて現れる
 */
export function Nav() {
  const [location] = useLocation()
  // 最初の区切りが同じなら選んでいる扱い。Photos はどのカテゴリ（/photos/color など）でも選んでいる
  const section = (path: string) => path.split('/')[1]
  const items = NAV_ROUTES.map(({path, label}) => ({
    href: path,
    label: label!,
    current: section(location) === section(path)
  }))

  return (
    <nav className="fixed top-0 right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] z-10 box-border flex h-(--spacing-nav) items-stretch justify-between gap-4 border-b border-white/10 bg-black/60 px-8 backdrop-blur-[12px] max-sm:px-5">
      <Link
        href="/"
        aria-label="mu"
        // pt-px で中身の高さを偶数にし、ロゴを画素にそろえる（ナビの下の線 1px のぶん奇数になり、半画素に
        // かかってにじむ）。上に足して、ロゴの中心を下の線まで含めたナビの高さの中央に置く
        className="flex items-center pt-px opacity-90 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
      >
        <Logo />
      </Link>
      {/* 狭い画面ではロゴとリンクが1行に収まらず、ナビが2行に伸びて
          --spacing-nav とずれる。360px で収まるところまで詰める */}
      <Tabs items={items} className="font-light" />
      <Underline current={location} />
    </nav>
  )
}

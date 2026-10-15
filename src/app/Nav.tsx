import {useLocation} from 'wouter-preact'
import {NAV_ROUTES} from './routes'
import {TabLink, Tabs, Underline} from './Tabs'

/**
 * 固定ナビ。左に名前（mu、トップへのリンク）、右にページのリンク。選んでいるページの下に線を引き、
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
      <TabLink
        href="/"
        label="mu"
        current={false}
        // pt は F1.8 の字面がリンクより高く見えるぶん、名前だけ少し下げるため
        className="pt-1 font-number text-sm tracking-[0.12em] max-sm:text-xs"
      />
      {/* 狭い画面では名前とリンクが1行に収まらず、ナビが2行に伸びて
          --spacing-nav とずれる。360px で収まるところまで詰める */}
      <Tabs items={items} className="font-light" />
      <Underline current={location} />
    </nav>
  )
}

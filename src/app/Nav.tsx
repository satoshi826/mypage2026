import {Link, useLocation} from 'wouter-preact'
import {Logo} from './Logo'
import {NAV_ROUTES} from './routes'
import {basePath, langOf, localized} from './lang'
import {Tabs, Underline} from './Tabs'
import {GLOW_HOVER} from './glow'

/**
 * 固定ナビ。左にロゴ（トップへのリンク）、右にページのリンク。選んでいるページの下に線を引き、
 * ページを移ると線が滑って移る（Tabs.tsx の Underline）。トップでは線を出さない。hero が主役で、
 * どのページにいるかを示す必要が薄いため。トップと他のページのあいだでは、線がその場で点へ縮んで
 * 消え、点から伸びて現れる
 */
export function Nav() {
  const [location] = useLocation()
  // 最初の区切りが同じなら選んでいる扱い。Photos はどのカテゴリ（/photos/color など）でも、About と Contact は
  // どちらの言語でも選んでいる。英語版を見ているあいだは、英語版のあるページへのリンクも英語版へ向ける
  const section = (path: string) => basePath(path).split('/')[1]
  const items = NAV_ROUTES.map(({path, label}) => ({
    href: localized(path, langOf(location)),
    label: label!,
    current: section(location) === section(path)
  }))

  return (
    <nav className="fixed top-0 right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] z-10 box-border flex h-(--spacing-nav) items-stretch justify-between gap-4 border-b border-white/10 bg-black/60 px-8 backdrop-blur-[12px] max-sm:px-5">
      <Link
        href="/"
        aria-label="mu"
        // トップにいるあいだは、ほかのページのタブと同じく選んでいる扱いにし、濃さを 90% にしてうっすら光らせる。
        // ロゴは面が大きく、同じ強さでも光が強く出るので、選んでいる光をタブより弱くする
        aria-current={location === '/' ? 'page' : undefined}
        // 初めて開いたときのスプラッシュ（index.html）が、ロゴを移し終えるまでここを隠す
        data-logo
        // pt-px で中身の高さを偶数にし、ロゴを画素にそろえる（ナビの下の線 1px のぶん奇数になり、半画素に
        // かかってにじむ）。上に足して、ロゴの中心を下の線まで含めたナビの高さの中央に置く。
        // 狭い画面ではロゴを 20 × 18.33（格子 1 つが 5/3px）に縮める。iPhone（1px が 3 画素）で格子が画素にそろう。
        // 中央に置くと上端が 1/3px の刻みから外れるので、上からの位置を 13px に決めて置く
        className={`glow-mark flex items-center pt-px max-sm:items-start max-sm:pt-[13px] opacity-80 transition-[opacity,filter] duration-300 hover:opacity-100! focus-visible:opacity-100! ${GLOW_HOVER} aria-[current=page]:opacity-90 aria-[current=page]:[--glow:calc(var(--glow-selected)*0.6)]`}
      >
        <Logo className="max-sm:h-[calc(55px/3)] max-sm:w-5" />
      </Link>
      {/* 狭い画面ではロゴとリンクが1行に収まらず、ナビが2行に伸びて
          --spacing-nav とずれる。360px で収まるところまで詰める */}
      <Tabs items={items} className="font-light" />
      <Underline current={location} />
    </nav>
  )
}

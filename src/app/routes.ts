// ルート定義。アプリのナビとプリレンダリングの両方がここを唯一の出典として使う。
// title / description はプリレンダ時に HTML へ差し込まれる（検索結果と SNS プレビューに出る）。

type RouteDef = {
  path: string
  /** ナビに出す表記。null ならナビには出さない */
  label: string | null
  title: string
  description: string
}

const NAME = 'Satoshi Hata'

export const ROUTES: RouteDef[] = [
  {
    path: '/',
    label: null,
    title: `${NAME} (mu) — Photographer / Web Engineer`,
    description: 'mu / Satoshi Hata。神奈川を拠点に street / architecture を撮る写真家、Web エンジニア。'
  },
  {
    path: '/photos',
    label: 'Photos',
    title: `Photos — ${NAME}`,
    description: `${NAME} の写真作品。`
  },
  // カテゴリ別の URL。ナビには出さず、Photos 内の切り替えから辿る
  {
    path: '/photos/abstract',
    label: null,
    title: `Abstract — ${NAME}`,
    description: `${NAME} の写真作品（Abstract）。`
  },
  {
    path: '/photos/color',
    label: null,
    title: `Color — ${NAME}`,
    description: `${NAME} の写真作品（Color）。`
  },
  {
    path: '/works',
    label: 'Works',
    title: `Works — ${NAME}`,
    description: `${NAME} の撮影実績。`
  },
  {
    path: '/about',
    label: 'About',
    title: `About — ${NAME}`,
    description: `${NAME} のプロフィールとステートメント。`
  },
  {
    path: '/contact',
    label: 'Contact',
    title: `Contact — ${NAME}`,
    description: '撮影のご依頼とお問い合わせ。ジャンルは問いません。'
  },
  // 写真の管理画面。Cloudflare Access で保護する。ナビには出さない
  {
    path: '/admin',
    label: null,
    title: 'Admin',
    description: ''
  }
]

export const NAV_ROUTES = ROUTES.filter((route) => route.label !== null)
export const findRoute = (path: string) => ROUTES.find((route) => route.path === path)
export {NAME}

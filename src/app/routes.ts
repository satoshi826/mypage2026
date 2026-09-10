// ルート定義。アプリのナビとプリレンダリングの両方がここを唯一の出典として使う。
// title / description はプリレンダ時に HTML へ差し込まれる（検索結果と SNS プレビューに出る）。
// TODO: 撮影ジャンルが決まったら description を具体化する。今は仮。

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
    title: `${NAME} — Photographer / Engineer`,
    description: 'モノクロームの street / architecture を撮る写真家であり、WebGL を書くエンジニア。'
  },
  {
    path: '/photos',
    label: 'Photos',
    title: `Photos — ${NAME}`,
    description: `${NAME} の写真作品。`
  },
  {
    path: '/works',
    label: 'Works',
    title: `Works — ${NAME}`,
    description: 'WebGL を中心とした実装と、その仕組みの解説。'
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
    description: '撮影のご依頼とお問い合わせ。'
  }
]

export const NAV_ROUTES = ROUTES.filter((route) => route.label !== null)
export const findRoute = (path: string) => ROUTES.find((route) => route.path === path)
export {NAME}

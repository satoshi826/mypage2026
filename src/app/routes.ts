// ルート定義。アプリのナビとプリレンダリングの両方がここを唯一の出典として使う。
// title / description はプリレンダ時に HTML へ差し込まれる（検索結果と SNS プレビューに出る）。

type RouteDef = {
  path: string
  /** ナビに出す表記。null ならナビには出さない */
  label: string | null
  title: string
  description: string
}

export const NAME = 'Satoshi Hata'

/**
 * サイトの正式な住所。各ページの canonical に使う（scripts/prerender.js）。ほかの住所（workers.dev）で
 * 開かれても、検索ではここにまとめられる
 */
export const ORIGIN = 'https://mu826.com'

/** トップの題名と説明文での名乗り。作家名（mu）を先に置く */
const SIGNED = `mu / ${NAME}`

export const ROUTES: RouteDef[] = [
  {
    path: '/',
    label: null,
    title: SIGNED,
    description: `${SIGNED} (端 智士) is a photographer based in Tokyo and Kanagawa, Japan, photographing streets and people. 東京・神奈川を拠点に、街や人を撮る写真家。`
  },
  // Photos はカテゴリ別の URL（/photos/:category）。ナビの Photos は street を指し、ほかはフッターの
  // 切り替えから辿る。/photos は street へ転送する（worker/index.ts と App.tsx）
  {
    path: '/photos/street',
    label: 'Photos',
    title: `Street — ${NAME}`,
    description: `Street photographs by ${SIGNED}. 街で撮った写真。`
  },
  {
    path: '/photos/abstract',
    label: null,
    title: `Abstract — ${NAME}`,
    description: `Abstract photographs by ${SIGNED}. 抽象の写真。`
  },
  {
    path: '/photos/color',
    label: null,
    title: `Color — ${NAME}`,
    description: `Color photographs by ${SIGNED}. カラーの写真。`
  },
  {
    path: '/works',
    label: 'Works',
    title: `Works — ${NAME}`,
    description: `Commissioned photography by ${SIGNED}. ご依頼をいただいて撮影した写真。`
  },
  {
    path: '/about',
    label: 'About',
    title: `About — ${NAME}`,
    description: `${SIGNED}（端 智士）のステートメントとプロフィール。受賞・展示・掲載。`
  },
  // About と Contact の英語版（lang.ts）。ナビには出さず、フッターの JA / EN で行き来する
  {
    path: '/en/about',
    label: null,
    title: `About — ${NAME}`,
    description: `Statement and profile of ${SIGNED}, a photographer based in Tokyo and Kanagawa, Japan, photographing streets and people. Awards, exhibitions, and publications.`
  },
  {
    path: '/contact',
    label: 'Contact',
    title: `Contact — ${NAME}`,
    description: '撮影のご依頼や、展示・掲載、ワークショップなどのご相談。'
  },
  {
    path: '/en/contact',
    label: null,
    title: `Contact — ${NAME}`,
    description: `Commissions, exhibitions and publications, workshops, and more — contact ${SIGNED}.`
  },
  // 編集のログインの入口（pages/Login.tsx）。Cloudflare Access で保護する。ナビには出さない
  {
    path: '/admin',
    label: null,
    title: 'Admin',
    description: ''
  }
]

export const NAV_ROUTES = ROUTES.filter((route) => route.label !== null)
export const findRoute = (path: string) => ROUTES.find((route) => route.path === path)

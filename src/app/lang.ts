// 日本語と英語の出し分け。英語版があるのは About と Contact だけで、URL の頭に /en を付ける（/en/about）。
// ほかのページは文字がほとんど英語か写真だけなので、言語で分けない

export type Lang = 'ja' | 'en'

/** 英語版のあるページ（日本語版の URL） */
const BILINGUAL = ['/about', '/contact'] as const

const EN = '/en'

/** その URL の言語 */
export const langOf = (path: string): Lang => (path === EN || path.startsWith(`${EN}/`) ? 'en' : 'ja')

/** 言語の頭を外した URL。/en/about → /about */
export const basePath = (path: string) => (langOf(path) === 'en' ? path.slice(EN.length) || '/' : path)

/** その言語の版の URL。英語版の無いページは日本語の URL のまま */
export const localized = (path: string, lang: Lang) =>
  lang === 'en' && (BILINGUAL as readonly string[]).includes(path) ? `${EN}${path}` : path

/** 英語版のあるページか */
export const isBilingual = (path: string) => (BILINGUAL as readonly string[]).includes(basePath(path))

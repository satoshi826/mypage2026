import {NAME, ORIGIN} from './routes'
import {INSTAGRAM, X} from './social'

// 本人の情報。About の表示と、検索エンジン向けの人物の情報（JSON-LD。scripts/prerender.js がトップと About の
// HTML に埋め込む）の両方がここを読む。元の事実は docs/profile.md

/** 年・名前・結果・公式ページ */
type Entry = readonly [year: string, name: string, result: string, href: string]

export const LINKS = [
  ['Instagram', INSTAGRAM],
  ['X', X],
  ['note', 'https://note.com/mu826'],
  ['1x', 'https://1x.com/satoshi826']
] as const

// 作品名は出さない。賞名のリンク先は代表する1点の公式ページ
export const AWARDS: readonly Entry[] = [
  [
    '2024',
    'Tokyo International Foto Awards',
    'Honorable Mention, Street Photography',
    'https://www.tokyofotoawards.jp/winners/hm/2024/12681/'
  ],
  [
    '2025',
    '11th Fine Art Photography Awards',
    'Nominee, Street Photography',
    'https://fineartphotoawards.com/winners-gallery/fapa-2024-2025/amateur/street-photography/hm/23448'
  ]
]

export const EXHIBITIONS: readonly Entry[] = [
  [
    '2026',
    '1X Artist Exhibition 2026',
    'Group exhibition, Hiltopia Art Square, Tokyo',
    'https://1xjapan.co.jp/1x-artist-exhibition-2026/'
  ]
]

export const PRESS: readonly Entry[] = [
  ['2020', 'Photography Masterclass Magazine', 'Issue 97, Interview', 'https://photographymc.com/issues/issue-97'],
  // 1x は審査を通った写真だけが載る。掲載が続いているので、年は始めた年から
  ['2020–', '1x', '277 curated photos', 'https://1x.com/satoshi826']
]

/**
 * 検索エンジン向けの人物の情報（schema.org の Person）。名前で検索したときに、同姓同名の人と区別して
 * 本人の情報として扱ってもらうため、別名・拠点・SNS・受賞をまとめて渡す
 */
export const PERSON = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: NAME,
  alternateName: ['端 智士', 'mu'],
  jobTitle: 'Photographer',
  url: ORIGIN,
  image: `${ORIGIN}/og.png`,
  homeLocation: {'@type': 'Place', name: 'Tokyo and Kanagawa, Japan'},
  knowsAbout: ['Street photography', 'Architecture photography', 'Abstract photography'],
  sameAs: [...LINKS.map(([, href]) => href), 'https://500px.com/p/satoshi826'],
  award: AWARDS.map(([year, name, result]) => `${name} ${year} — ${result}`)
}

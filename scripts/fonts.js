// 本文の書体（Zen Kaku Gothic New）を、サイトに出てくる文字だけに絞って書き出す。prerender.js が使う。
//
// 日本語の書体は 1 つの太さで 2MB 以上あり、Google Fonts の分割配信でも About だけで 40 本・370KB 近く
// 読んでいた。表示される文字は全ページで 200 種類ほどしかないので、太さごとに 1 本へ絞って同じ
// オリジンから配り、HTML の先頭で先読みする。文字を足せばビルドのたびに作り直されるので手入れは要らない。
//
// 元のフォントは fonts/ にある（SIL Open Font License、fonts/OFL.txt）。開発中は絞らずに
// そのまま使う（src/dev-fonts.css）。
import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import subsetFont from 'subset-font'

const FAMILY = 'Zen Kaku Gothic New'

/** 使う太さと元のファイル。styles.css / 各要素のクラスで使う太さと揃える */
const SOURCES = {
  300: 'ZenKakuGothicNew-Light.ttf',
  400: 'ZenKakuGothicNew-Regular.ttf'
}

/**
 * HTML に出てこなくても表示しうる文字。ブラウザでだけ描くもの（hero のカレンダーの番号など）の
 * ために、英数字と記号は常に入れておく
 */
const ALWAYS = Array.from({length: 0x7f - 0x20}, (_, i) => String.fromCharCode(0x20 + i)).join('')

/** プリレンダした本文から、画面に出る文字を集める。script / style / タグの中身は数えない */
function visibleText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 書体を絞って dist/assets/fonts に書き出し、各ページの <head> に足すタグを返す。
 * ファイル名に中身のハッシュを入れるので、/assets/* の長期キャッシュ（public/_headers）がそのまま効く
 * @param {string} root リポジトリの根
 * @param {string} dist ビルドの出力先
 * @param {string[]} pages プリレンダした各ページの本文の HTML
 */
export async function subsetFonts(root, dist, pages) {
  const text = [...new Set(ALWAYS + pages.map(visibleText).join(''))].join('')
  await mkdir(join(dist, 'assets', 'fonts'), {recursive: true})

  const faces = await Promise.all(
    Object.entries(SOURCES).map(async ([weight, source]) => {
      const font = await subsetFont(await readFile(join(root, 'fonts', source)), text, {targetFormat: 'woff2'})
      const hash = createHash('sha256').update(font).digest('hex').slice(0, 8)
      const href = `/assets/fonts/zen-kaku-gothic-new-${weight}-${hash}.woff2`
      await writeFile(join(dist, href), font)
      console.log('font', href, `${(font.length / 1024).toFixed(1)}KB`)
      return {weight, href}
    })
  )
  console.log('font', `${[...text].length} 文字`)

  const css = faces
    .map(
      ({weight, href}) =>
        `@font-face{font-family:'${FAMILY}';font-weight:${weight};font-style:normal;font-display:swap;src:url(${href}) format('woff2')}`
    )
    .join('')
  return [
    ...faces.map(({href}) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`),
    `<style>${css}</style>`
  ]
}

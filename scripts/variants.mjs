// 派生画像の段（src/photos/manifest.ts の VARIANTS）を Node のスクリプトから読む。
// スクリプトは TS を読み込めないので、1 段 1 行で書かれた定義を文字列として拾う。

import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const LINE = /\{kind: '([a-z0-9-]+)', long: (\d+), quality: (\d+), use: '(list|large)'\}/g

/** [{kind, long, quality, use}]。root はリポジトリの根 */
export function readVariants(root) {
  const text = readFileSync(join(root, 'src/photos/manifest.ts'), 'utf8')
  const variants = [...text.matchAll(LINE)].map(([, kind, long, quality, use]) => ({
    kind,
    long: Number(long),
    quality: Number(quality),
    use
  }))
  if (variants.length === 0) throw new Error('src/photos/manifest.ts の VARIANTS を読めない')
  return variants
}

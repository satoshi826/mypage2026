// 2 回分の計測を比べる。使い方は bench/README.md。
//
//   node bench/compare.mjs [前.json 後.json]
//
// 引数を省くと、bench/results の新しい 2 つを比べる。

import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {compare} from './report.mjs'

const RESULTS = new URL('results', import.meta.url).pathname

let [a, b] = process.argv.slice(2)
if (!a || !b) {
  const files = readdirSync(RESULTS)
    .filter((name) => name.endsWith('.json'))
    .sort()
  if (files.length < 2) throw new Error('比べる結果が 2 つ無い')
  ;[a, b] = files.slice(-2).map((name) => join(RESULTS, name))
}
const before = JSON.parse(readFileSync(a, 'utf8'))
const after = JSON.parse(readFileSync(b, 'utf8'))
const describe = ({meta}) =>
  `${meta.date} ${meta.commit}${meta.dirty ? '（未コミットの変更あり）' : ''} / ${meta.chrome}`
console.log(`前: ${describe(before)}\n後: ${describe(after)}`)
if (before.meta.machine !== after.meta.machine) console.log('注意: 別の機械で測った結果どうし')
console.log(`\n${compare(before, after)}`)

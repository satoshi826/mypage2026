// 指標の定義と、結果を表にする処理。run.mjs（実行後の要約）と compare.mjs（2 回分の比較）が使う。

/**
 * 表に出す指標。lower: 小さいほど良い。単位は表示用。
 * 読み込み（load）と操作（interaction）で見る指標が違う
 */
export const METRICS = {
  load: {
    ttfb: {unit: 'ms', lower: true, label: '最初の 1 バイト'},
    fcp: {unit: 'ms', lower: true, label: '最初の描画'},
    lcp: {unit: 'ms', lower: true, label: '最大の要素の描画'},
    hero: {unit: 'ms', lower: true, label: 'hero の最初の写真'},
    cls: {unit: '', lower: true, label: 'レイアウトのずれ'},
    transferKB: {unit: 'KB', lower: true, label: '転送量'},
    requests: {unit: '', lower: true, label: '読み込んだファイル（キャッシュ含む）'},
    script: {unit: 'ms', lower: true, label: 'JS の実行'},
    heapMB: {unit: 'MB', lower: true, label: 'JS のヒープ'}
  },
  interaction: {
    fps: {unit: '', lower: false, label: '1 秒あたりのフレーム'},
    p95: {unit: 'ms', lower: true, label: 'フレーム間隔の p95'},
    max: {unit: 'ms', lower: true, label: 'フレーム間隔の最大'},
    dropped: {unit: '', lower: true, label: '落ちたフレーム'},
    blocking: {unit: 'ms', lower: true, label: '長いフレームの詰まり'},
    script: {unit: 'ms', lower: true, label: 'JS の実行'},
    style: {unit: 'ms', lower: true, label: 'スタイルの再計算'},
    layout: {unit: 'ms', lower: true, label: 'レイアウト'},
    task: {unit: 'ms', lower: true, label: 'メインスレッドの合計'},
    heapMB: {unit: 'MB', lower: true, label: 'JS のヒープ'}
  },
  // ビルドの大きさ（dist の全ファイルを gzip した合計）
  build: {
    jsKB: {unit: 'KB', lower: true, label: 'JS'},
    cssKB: {unit: 'KB', lower: true, label: 'CSS'},
    htmlKB: {unit: 'KB', lower: true, label: 'HTML'},
    fontKB: {unit: 'KB', lower: true, label: 'フォント'}
  }
}

export const median = (values) => {
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const format = (value) =>
  value === null || value === undefined
    ? '-'
    : Math.abs(value) >= 100
      ? value.toFixed(0)
      : value.toFixed(value % 1 ? 2 : 0)

/** 全角を 2 文字ぶんとして数えた幅 */
const width = (text) => [...text].reduce((n, c) => n + (c.charCodeAt(0) > 0xff ? 2 : 1), 0)
const pad = (text, n, right = false) => {
  const space = ' '.repeat(Math.max(0, n - width(text)))
  return right ? space + text : text + space
}

/** 行の配列を、列の幅をそろえた文字列にする。1 列目は左寄せ、ほかは右寄せ */
function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => width(row[i]))))
  return rows.map((row) => row.map((cell, i) => pad(cell, widths[i], i > 0)).join('  ')).join('\n')
}

/** 1 回分の結果の要約。端末・場面ごとに中央値を並べる */
export function summary(result) {
  const out = []
  for (const [profile, scenarios] of Object.entries(result.results)) {
    for (const [scenario, {kind, metrics, error}] of Object.entries(scenarios)) {
      if (error) {
        out.push(`■ ${profile} / ${scenario}\n失敗: ${error}`)
        continue
      }
      const rows = [['指標', '中央値', '最小', '最大']]
      for (const [key, {unit, label}] of Object.entries(METRICS[kind])) {
        const m = metrics[key]
        if (!m || m.median === null) continue
        rows.push([`${label}${unit ? ` (${unit})` : ''}`, format(m.median), format(m.min), format(m.max)])
      }
      out.push(`■ ${profile} / ${scenario}\n${table(rows)}`)
    }
  }
  return out.join('\n\n')
}

/** これ未満の変化は誤差として扱う（%） */
const NOISE = 5

/** 2 回分の比較。両方にある端末・場面・指標について、中央値の差と変化率を出す */
export function compare(a, b) {
  const out = []
  for (const [profile, scenarios] of Object.entries(b.results)) {
    for (const [scenario, {kind, metrics}] of Object.entries(scenarios)) {
      const before = a.results[profile]?.[scenario]?.metrics
      if (!before) continue
      const rows = [['指標', '前', '後', '差', '変化', '']]
      for (const [key, {unit, label, lower}] of Object.entries(METRICS[kind])) {
        const x = before[key]?.median ?? null
        const y = metrics[key]?.median ?? null
        if (x === null && y === null) continue
        const diff = x !== null && y !== null ? y - x : null
        const rate = diff !== null && x !== 0 ? (diff / x) * 100 : null
        const verdict = rate === null || Math.abs(rate) < NOISE ? '' : rate < 0 === lower ? '改善' : '悪化'
        rows.push([
          `${label}${unit ? ` (${unit})` : ''}`,
          format(x),
          format(y),
          diff === null ? '-' : `${diff > 0 ? '+' : ''}${format(diff)}`,
          rate === null ? '-' : `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`,
          verdict
        ])
      }
      out.push(`■ ${profile} / ${scenario}\n${table(rows)}`)
    }
  }
  return out.join('\n\n')
}

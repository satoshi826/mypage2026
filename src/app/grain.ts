// 地の粒（styles.css の body::before）の画像を作る。開いたときに 1 度だけ、手の空いたときに作り、できたら
// 薄く現す（styles.css の --grain-on）。粒の種類は試し中で、開発中は GrainPanel で切り替えて比べる。
// どの種類も地の色を中心に明暗へ揺らし（平均の明るさは地の色のまま）、ぼかさずくっきり置く。
// 画面の画素に合わせて粒を置くため、画素の細かさ（devicePixelRatio）に合わせて敷く大きさを決める。

/** 粒の画像の一辺（画面の画素）。これより大きい範囲は繰り返すが、粒どうしに関係がないので繰り返しは見えない */
const TILE = 1024

/**
 * 粒の種類。
 * - triangle: 画素ごとにでたらめな明るさ。2 つの乱数の和で、中ほどの明るさが多い
 * - uniform: 画素ごとにでたらめな明るさ。どの明るさも同じだけ出る（ざらつきが強い）
 * - gauss: 画素ごとにでたらめな明るさ。正規分布で、ほとんどは弱く、ときどき強い粒が出る
 * - blue: でたらめな明るさから、塊になる成分（なだらかな変化）を抜いたもの。粒が均等に散り、細かく見える
 * - binary: 明るいか暗いかの 2 つだけ。版画の網点のように硬い
 * - dust: ほとんどは地のままで、ところどころに明るい点。ほこりや星のよう
 */
export const GRAIN_KINDS = ['triangle', 'uniform', 'gauss', 'blue', 'binary', 'dust'] as const
export type GrainKind = (typeof GRAIN_KINDS)[number]

/** 本番で使う種類 */
const KIND: GrainKind = 'triangle'

export function startGrain() {
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => renderGrain(KIND))
}

let url = ''

/** 粒の画像を作って敷く。開発用パネルからも種類を変えて呼ぶ */
export function renderGrain(kind: GrainKind) {
  const root = document.documentElement
  // 地が暗いので、振れ幅はおおむね地の明るさまで（暗い側が黒で止まる）
  const ground = groundLevel()
  const amplitude = ground / 2.5
  const values = noise(kind)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const context = canvas.getContext('2d')!
  const image = context.createImageData(TILE, TILE)
  const pixels = new Uint32Array(image.data.buffer)
  for (let i = 0; i < pixels.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(ground + amplitude * values[i])))
    pixels[i] = 0xff000000 | (v << 16) | (v << 8) | v
  }
  context.putImageData(image, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) return
    if (url) URL.revokeObjectURL(url)
    url = URL.createObjectURL(blob)
    root.style.setProperty('--grain-image', `url(${url})`)
    root.style.setProperty('--grain-tile', `${TILE / devicePixelRatio}px`)
    root.style.setProperty('--grain-on', '1')
  })
}

/** 画素ごとの揺れ。おおむね平均 0、標準偏差 1 */
function noise(kind: GrainKind): Float32Array {
  const size = TILE * TILE
  const data = new Float32Array(size)
  const r = Math.random
  switch (kind) {
    case 'triangle':
      for (let i = 0; i < size; i++) data[i] = r() + r() - 1
      return normalize(data)
    case 'uniform':
      for (let i = 0; i < size; i++) data[i] = r() - 0.5
      return normalize(data)
    case 'gauss':
      for (let i = 0; i < size; i++) data[i] = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
      return normalize(data)
    case 'blue': {
      for (let i = 0; i < size; i++) data[i] = r() - 0.5
      // まわり（3 × 3）の平均を引くと、なだらかな変化（塊）が消え、細かい変化だけが残る
      const smooth = data.slice()
      blur(smooth, 1)
      for (let i = 0; i < size; i++) data[i] -= smooth[i]
      return normalize(data)
    }
    case 'binary':
      for (let i = 0; i < size; i++) data[i] = r() < 0.5 ? -1 : 1
      return data
    case 'dust':
      // 2% の画素だけを明るくする。平均がわずかに上がるぶん、残りをほんの少し暗くして打ち消す
      for (let i = 0; i < size; i++) data[i] = r() < 0.02 ? 2.5 + r() * 1.5 : -0.065
      return data
  }
}

/** 横と縦に箱形のぼかしをかける。端は反対側とつなぐ（画像を並べても継ぎ目が出ない） */
function blur(data: Float32Array, radius: number) {
  const width = TILE
  const line = new Float32Array(width)
  const span = radius * 2 + 1
  for (const [step, stride] of [
    [1, width],
    [width, 1]
  ]) {
    for (let row = 0; row < width; row++) {
      const start = row * stride
      let acc = 0
      for (let k = -radius; k <= radius; k++) acc += data[start + ((k + width) % width) * step]
      for (let i = 0; i < width; i++) {
        line[i] = acc / span
        acc += data[start + ((i + radius + 1) % width) * step] - data[start + ((i - radius + width) % width) * step]
      }
      for (let i = 0; i < width; i++) data[start + i * step] = line[i]
    }
  }
}

/** 平均 0、標準偏差 1 にそろえる */
function normalize(data: Float32Array) {
  let mean = 0
  for (const v of data) mean += v
  mean /= data.length
  let variance = 0
  for (const v of data) variance += (v - mean) ** 2
  const sd = Math.sqrt(variance / data.length) || 1
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - mean) / sd
  return data
}

/** 地の色（--color-ground）の明るさ 0〜255。灰色なので赤の値を使う */
function groundLevel() {
  const probe = document.createElement('div')
  probe.style.color = 'var(--color-ground)'
  document.body.append(probe)
  const [r] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number)
  probe.remove()
  return r
}

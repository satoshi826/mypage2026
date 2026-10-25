// 地の粒（styles.css の body::after）の画像を作る。開いたときに 1 度だけ、手の空いたときに作り、できたら
// 薄く現す（styles.css の --grain-on）。粒の種類は試し中で、開発中は GrainPanel で切り替えて比べる。
// どの種類も中間の灰色を中心に明暗へ揺らし、ぼかさずくっきり置く。地の上には、下の明るさに対する割合で
// 重ねる（styles.css の mix-blend-mode: overlay）ので、平均の明るさは変わらない。
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
 * - concrete: 打ちっぱなしのコンクリート。細かい砂の粒に、大きな濃淡のむら（雲のよう）、中くらいのざらつき、
 *   ところどころの小さな穴（気泡の跡）と明るい点（骨材）を重ねる
 * - hairline: 金属のヘアライン加工。横にだけ伸ばした細い筋に、ごく細かい粒を重ねる
 * - paper: 印画紙のような紙。ばらばらの向きの短い繊維に、細かい粒と、ごく弱いむらを重ねる
 */
export const GRAIN_KINDS = [
  'triangle',
  'uniform',
  'gauss',
  'blue',
  'binary',
  'dust',
  'concrete',
  'hairline',
  'paper'
] as const
export type GrainKind = (typeof GRAIN_KINDS)[number]

/** 本番で使う種類 */
const KIND: GrainKind = 'gauss'

export function startGrain() {
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => renderGrain(KIND))
}

let url = ''

/** 粒の画像を作って敷く。開発用パネルからも種類を変えて呼ぶ */
export function renderGrain(kind: GrainKind) {
  const root = document.documentElement
  // 中間の灰色（128）を中心に揺らす。ほとんどの粒（±2.5 標準偏差）が 0〜255 に収まる振れ幅。重ねたときの揺れは
  // 下の明るさの ±40%（1 標準偏差）になる
  const amplitude = 51
  const values = noise(kind)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const context = canvas.getContext('2d')!
  const image = context.createImageData(TILE, TILE)
  const pixels = new Uint32Array(image.data.buffer)
  for (let i = 0; i < pixels.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(128 + amplitude * values[i])))
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
    case 'concrete': {
      // 大きさの違う濃淡を重ねる。[ぼかしの半径（画面の画素）, 重み]。半径 0 はぼかさない砂の粒
      for (const [radius, weight] of [
        [0, 0.55],
        [4, 0.3],
        [32, 0.6]
      ]) {
        const layer = new Float32Array(size)
        for (let i = 0; i < size; i++) layer[i] = r() - 0.5
        if (radius > 0) for (let pass = 0; pass < 3; pass++) blur(layer, radius)
        normalize(layer)
        for (let i = 0; i < size; i++) data[i] += layer[i] * weight
      }
      normalize(data)
      // 気泡の跡（暗い穴）と骨材（明るい点）。どちらも 1〜2 画素の小さな点
      for (let n = 0; n < size * 0.0015; n++) speck(data, -3 - r() * 1.5, r() < 0.3 ? 2 : 1)
      for (let n = 0; n < size * 0.001; n++) speck(data, 1.5 + r(), 1)
      return data
    }
    case 'hairline': {
      // 横にだけ長くぼかすと、横に走る筋になる。筋の太さは 1 画素のまま
      const lines = new Float32Array(size)
      for (let i = 0; i < size; i++) lines[i] = r() - 0.5
      for (let pass = 0; pass < 3; pass++) blur(lines, 48, 'x')
      normalize(lines)
      for (let i = 0; i < size; i++) data[i] = lines[i] * 0.85 + (r() + r() - 1) * 0.9
      return normalize(data)
    }
    case 'paper': {
      for (let i = 0; i < size; i++) data[i] = (r() + r() - 1) * 1.2
      const mottle = new Float32Array(size)
      for (let i = 0; i < size; i++) mottle[i] = r() - 0.5
      for (let pass = 0; pass < 3; pass++) blur(mottle, 24)
      normalize(mottle)
      for (let i = 0; i < size; i++) data[i] += mottle[i] * 0.25
      // 繊維。長さ 8〜40 画素の細い線を、ばらばらの向きに置く。明るいものと暗いものを半々に
      for (let n = 0; n < size * 0.0008; n++) {
        const length = 8 + r() * 32
        const angle = r() * Math.PI
        const value = (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.4)
        let x = r() * TILE
        let y = r() * TILE
        for (let t = 0; t < length; t++) {
          const i = (Math.floor(y + TILE) % TILE) * TILE + (Math.floor(x + TILE) % TILE)
          data[i] += value
          x += Math.cos(angle)
          y += Math.sin(angle)
        }
      }
      return normalize(data)
    }
  }
}

/** でたらめな位置に、一辺 side 画素の点を置く。端は反対側とつなぐ */
function speck(data: Float32Array, value: number, side: number) {
  const x = Math.floor(Math.random() * TILE)
  const y = Math.floor(Math.random() * TILE)
  for (let dy = 0; dy < side; dy++)
    for (let dx = 0; dx < side; dx++) data[((y + dy) % TILE) * TILE + ((x + dx) % TILE)] = value
}

/** 箱形のぼかしをかける（横と縦、または片方だけ）。端は反対側とつなぐ（画像を並べても継ぎ目が出ない） */
function blur(data: Float32Array, radius: number, axis: 'both' | 'x' = 'both') {
  const width = TILE
  const line = new Float32Array(width)
  const span = radius * 2 + 1
  const axes = [
    [1, width],
    [width, 1]
  ]
  for (const [step, stride] of axis === 'x' ? axes.slice(0, 1) : axes) {
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

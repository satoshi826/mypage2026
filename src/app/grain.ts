// 地の粒（styles.css の body::before）の画像を、開いたときに 1 度だけ作る。
//
// フィルムの粒に寄せる。フィルムの粒は大きさのばらついた銀の結晶の重なりで、粒どうしが寄り集まった塊が
// 粒らしさを作る（Newson ほか, "A Stochastic Film Grain Model for Resolution-Independent Rendering", 2017）。
// ここでは、でたらめな明るさを 2 つの大きさでぼかして重ね（細かい粒と、少し大きい塊）、大きさのばらついた粒が
// 寄り集まった見え方に近づける。ぼかしは端を反対側へつないで行うので、画像を並べても継ぎ目が出ない。
// 粒は地の色を中心に明暗へ同じだけ揺らす（平均の明るさは地の色のまま）。
// 画面の画素 1 つを粒の単位にするため、画素の細かさ（devicePixelRatio）に合わせて敷く大きさを決める。
// 作るのに少しかかるので、手の空いたときに作り、できたら薄く現す（styles.css の --grain-on）

/** 粒の画像の一辺（画面の画素） */
const TILE = 1024

/** 重ねる粒の大きさ（ぼかしの半径、画面の画素）と重み */
const SCALES = [
  {radius: 1, weight: 0.65},
  {radius: 3, weight: 0.35}
]

export function startGrain() {
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => {
    const root = document.documentElement
    const ground = groundLevel()
    const size = TILE * TILE
    const sum = new Float32Array(size)
    for (const {radius, weight} of SCALES) {
      const layer = new Float32Array(size)
      for (let i = 0; i < size; i++) layer[i] = Math.random() - 0.5
      // 箱形のぼかしを 3 回かけると、ガウスのぼかしに近くなる
      for (let pass = 0; pass < 3; pass++) blur(layer, radius)
      normalize(layer)
      for (let i = 0; i < size; i++) sum[i] += layer[i] * weight
    }
    normalize(sum)

    // 揺れの大きさ。地が暗く、暗い側は黒で止まるので、ほとんどの粒（±2.5 標準偏差）が地の明るさに収まる大きさ
    const amplitude = ground / 2.5
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE
    const context = canvas.getContext('2d')!
    const image = context.createImageData(TILE, TILE)
    const pixels = new Uint32Array(image.data.buffer)
    for (let i = 0; i < size; i++) {
      const v = Math.max(0, Math.min(255, Math.round(ground + amplitude * sum[i])))
      pixels[i] = 0xff000000 | (v << 16) | (v << 8) | v
    }
    context.putImageData(image, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      root.style.setProperty('--grain-image', `url(${URL.createObjectURL(blob)})`)
      root.style.setProperty('--grain-tile', `${TILE / devicePixelRatio}px`)
      root.style.setProperty('--grain-on', '1')
    })
  })
}

/** 横と縦に箱形のぼかしをかける。端は反対側とつなぐ */
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

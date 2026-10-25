// 地の粒（styles.css の body::before）の画像を、開いたときに 1 度だけ作る。画素ごとにでたらめな明るさを割り振った
// くっきりした粒で、なめらかなノイズ（塊ができる）や小さな画像の繰り返しのように、模様が見えることがない。
// 粒をぼかして塊にするとフィルムの粒には近づくが、ぼけて安っぽく見えたので、ぼかさない。
// 粒は地の色を中心に明暗へ同じだけ揺らす（平均の明るさは地の色のまま）。
// 画面の画素に合わせて粒を置くため、画素の細かさ（devicePixelRatio）に合わせて敷く大きさを決める。
// 作るのに少しかかるので、手の空いたときに作り、できたら薄く現す（styles.css の --grain-on）

/** 粒の画像の一辺（画面の画素）。これより大きい範囲は繰り返すが、粒どうしに関係がないので繰り返しは見えない */
const TILE = 1024

export function startGrain() {
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => {
    const root = document.documentElement
    // 地が暗いので、振れ幅は地の明るさまで（暗い側が黒で止まる）
    const ground = groundLevel()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE
    const context = canvas.getContext('2d')!
    const image = context.createImageData(TILE, TILE)
    const pixels = new Uint32Array(image.data.buffer)
    for (let i = 0; i < pixels.length; i++) {
      // 2 つの乱数の和で、中央に寄った（三角形の）分布にする。一様だと粒がざらついて見える
      const v = Math.round(ground + ground * (Math.random() + Math.random() - 1))
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

/** 地の色（--color-ground）の明るさ 0〜255。灰色なので赤の値を使う */
function groundLevel() {
  const probe = document.createElement('div')
  probe.style.color = 'var(--color-ground)'
  document.body.append(probe)
  const [r] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number)
  probe.remove()
  return r
}

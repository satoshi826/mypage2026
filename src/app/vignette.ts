// 周辺減光（styles.css の body::before）の画像を作る。
// CSS のグラデーションで暗い地を少しずつ暗くすると、明るさの 1 段ごとに境目ができ、同心円の縞（バンディング）が
// 見える。ブラウザが先に明るさを丸めるので、上に粒を重ねても消えない。そこで画素ごとの明るさを計算し、丸める前に
// 細かいばらつき（ディザ。±1 段の三角形の分布）を混ぜて、段の境目を散らす。
// 形は CSS の radial-gradient（ellipse at center）と同じで、画面の角を通る楕円の中心から外へ暗くする。
// 画面の大きさが変わったら作り直す。濃さと形は styles.css の --vignette、--vignette-start を読む

let url = ''
let timer = 0

export function startVignette() {
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => renderVignette())
  addEventListener('resize', () => {
    clearTimeout(timer)
    timer = window.setTimeout(renderVignette, 200)
  })
}

/** 今の画面の大きさで作って敷く。開発用パネルからも値を変えて呼ぶ */
export function renderVignette() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const strength = parseFloat(style.getPropertyValue('--vignette')) || 0
  const start = (parseFloat(style.getPropertyValue('--vignette-start')) || 0) / 100
  const ground = groundLevel()
  // CSS の画素で作る（画面の画素で作るより軽い）。引き伸ばしても、ばらつきが残るので縞は出ない
  const width = Math.max(1, Math.round(innerWidth))
  const height = Math.max(1, Math.round(innerHeight))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(width, height)
  const pixels = new Uint32Array(image.data.buffer)
  const r = Math.random
  for (let y = 0; y < height; y++) {
    const dy = (y + 0.5) / height - 0.5
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5) / width - 0.5
      // 中心 0、角 1 の距離
      const d = Math.sqrt(2 * (dx * dx + dy * dy))
      const t = Math.min(1, Math.max(0, (d - start) / (1 - start)))
      const v = Math.max(0, Math.min(255, Math.round(ground * (1 - strength * t) + (r() + r() - 1))))
      pixels[y * width + x] = 0xff000000 | (v << 16) | (v << 8) | v
    }
  }
  context.putImageData(image, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) return
    if (url) URL.revokeObjectURL(url)
    url = URL.createObjectURL(blob)
    root.style.setProperty('--vignette-image', `url(${url})`)
    root.style.setProperty('--vignette-on', '1')
  })
}

/** 地の色（--color-ground）の明るさ 0〜255。灰色なので赤の値を使う */
function groundLevel() {
  const probe = document.createElement('div')
  probe.style.color = 'var(--color-ground)'
  document.body.append(probe)
  const [value] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number)
  probe.remove()
  return value
}

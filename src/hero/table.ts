// 読む画像（photos/manifest.ts の heroSrc、長辺 1200 の 3:2）の寸法。粒子グリッドの上限と縦横比になる。
// 全写真をこの縦横比で扱う（粒子集合を共有するため）。違う縦横比の写真は中央を切り出して使う（loadPixels）。
export const SOURCE_W = 1200
export const SOURCE_H = 800

/**
 * 粒子グリッド。粒子の数、写真をサンプリングする解像度、アトラス上の1ブロックの
 * 寸法を兼ねる。配信解像度が上限になる（配信物より細かくはできない）。
 */
export type Grid = {width: number; height: number; count: number}

/** 縦横比。全写真をこれで扱う */
export const ASPECT = SOURCE_W / SOURCE_H

/**
 * 粒子グリッドは配信解像度そのまま。アトラスに置く写真は SLOTS 枚に限るので、写真の枚数が増えても落とさない。
 * 画面サイズも見ない。小さい画面に合わせて落とすと、ウィンドウを広げたときに粗いままになる
 */
export const GRID: Grid = {width: SOURCE_W, height: SOURCE_H, count: SOURCE_W * SOURCE_H}

/**
 * アトラスに同時に置く写真の枚数。描いている組（2 枚）と、行き先と 1 枚先（番号を押した直後は、描いている組のほかに
 * 2 枚）と、カーソルを乗せた番号の先読み（1 枚）が収まる数（hero/library.ts）
 */
export const SLOTS = 5

const LEVELS = 256

/**
 * 画像を輝度で昇順に並べ替え、ランクを添字とする2枚のテーブルにする。
 *
 * 輝度を8bitに量子化してカウントソートするので O(画素数)。ピクセルを走査順に
 * バケットへ流し込む＝安定ソートになるため、同輝度の画素は「上から下・左から右」
 * の順に並ぶ。空や壁のような平坦部が塊のまま移動するのはこの副作用による。
 *
 * 返すのは1粒子あたり4バイト。RGB に元画素のインデックス(24bit LE)、A に輝度。
 * 座標を直接持たずインデックスにしているのは、3バイトに収まってアルファが空くため。
 * 作品がモノクロなので、色は輝度1バイトで足りる。
 */
export function buildTable(src: Uint8ClampedArray, {count}: Grid): Uint8Array {
  const luminance = new Uint8Array(count)
  const histogram = new Uint32Array(LEVELS)

  for (let i = 0; i < count; i++) {
    const o = i * 4
    const l = (0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2]) | 0
    luminance[i] = l
    histogram[l]++
  }

  // 各輝度値が占める最初のランク
  const cursor = new Uint32Array(LEVELS)
  for (let l = 1; l < LEVELS; l++) cursor[l] = cursor[l - 1] + histogram[l - 1]

  const table = new Uint8Array(count * 4)

  for (let i = 0; i < count; i++) {
    const d = cursor[luminance[i]]++ * 4
    table[d] = i & 255
    table[d + 1] = (i >> 8) & 255
    table[d + 2] = (i >> 16) & 255
    table[d + 3] = luminance[i]
  }

  return table
}

/** 写真の中央を粒子グリッドの縦横比（3:2）で切り出し、グリッドの解像度まで縮小して画素を取り出す */
export async function loadPixels(url: string, {width, height}: Grid) {
  const source = await createImageBitmap(await (await fetch(url)).blob())
  const scale = Math.min(source.width / width, source.height / height)
  const [w, h] = [width * scale, height * scale]
  const [x, y] = [(source.width - w) / 2, (source.height - h) / 2]
  const bitmap = await createImageBitmap(source, x, y, w, h, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high'
  })
  source.close()
  const ctx = new OffscreenCanvas(width, height).getContext('2d')!
  // createImageBitmap のリサイズ指定を無視するブラウザがあるので、描画側でも縮小先を明示する
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return ctx.getImageData(0, 0, width, height).data
}

/** アトラス上のブロック配置。レイヤ L は (L % cols, L / cols) 番目のブロックに入る */
export type AtlasLayout = {cols: number; width: number; height: number}

/** 縦横比の偏り。1 で正方形 */
const skewOf = ({width, height}: AtlasLayout) => Math.max(width / height, height / width)

/**
 * ブロックを縦横に並べる配置を決める。
 *
 * 横一列に並べると幅がブロック幅 × 枚数 になり、MAX_TEXTURE_SIZE にすぐ当たる
 * （16384 の環境で21枚、4096 の環境では5枚）。縦にも積むことで上限が
 * 「横に入る数 × 縦に入る数」まで広がる。
 *
 * 列数は「確保するブロック数 cols * rows が最小になる」ものを選ぶ。横に詰められる
 * だけ詰めると最後の行の空きがそのまま VRAM の無駄になるため（31枚を14列に置くと
 * 42スロット確保して11スロットが空く）。同数なら正方形に近いほうを採る。
 */
export function layoutFor(limit: number, count: number, grid: Grid): AtlasLayout {
  const maxCols = Math.min(count, Math.floor(limit / grid.width))
  const maxRows = Math.floor(limit / grid.height)

  let best: AtlasLayout | null = null
  let bestSlots = Infinity
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(count / cols)
    if (rows > maxRows) continue
    const slots = cols * rows
    if (slots > bestSlots) continue
    const layout = {cols, width: cols * grid.width, height: rows * grid.height}
    if (slots === bestSlots && best && skewOf(layout) >= skewOf(best)) continue
    best = layout
    bestSlots = slots
  }

  if (!best) throw new Error(`写真がテクスチャに収まらない: ${count}枚 / 上限 ${maxCols * maxRows}枚`)
  return best
}

/** レイヤ L のブロックがアトラス上で始まる位置。シェーダの addressOf と対になる */
export const blockOrigin = (layer: number, {cols}: AtlasLayout, grid: Grid) => ({
  x: (layer % cols) * grid.width,
  y: Math.floor(layer / cols) * grid.height
})

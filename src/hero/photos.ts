// title は仮置き。表示用の名前が決まったら差し替える。
// 再生順は実行時にランダムなので、この並びが決めるのは番号表示と最初の1枚だけ。
const SOURCE = [
  {src: '/photos/DSC00062.webp', title: 'DSC00062'},
  {src: '/photos/DSC00093-2.webp', title: 'DSC00093-2'},
  {src: '/photos/DSC00153.webp', title: 'DSC00153'},
  {src: '/photos/DSC00493.webp', title: 'DSC00493'},
  {src: '/photos/DSC00753.webp', title: 'DSC00753'},
  {src: '/photos/DSC00931.webp', title: 'DSC00931'},
  {src: '/photos/DSC02046-3.webp', title: 'DSC02046-3'},
  {src: '/photos/DSC02439.webp', title: 'DSC02439'},
  {src: '/photos/DSC03551.webp', title: 'DSC03551'},
  {src: '/photos/DSC04557-2.webp', title: 'DSC04557-2'},
  {src: '/photos/DSC05337.webp', title: 'DSC05337'},
  {src: '/photos/P4182215.webp', title: 'P4182215'}
]

/**
 * 枚数が増えたときの見え方を確かめるための水増し。実枚数に戻すなら SOURCE.length にする。
 * 粒子側も同じ枚数を読むので、グリッドや VRAM の変化まで含めて確認できる。
 */
const COUNT = 31

export const PHOTOS = Array.from({length: COUNT}, (_, i) => SOURCE[i % SOURCE.length])

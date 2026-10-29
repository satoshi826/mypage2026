import type {Param} from '../app/DevPanel'

// 光とロゴの調整値。worker の既定値と開発用パネルの両方がここを使う

export type LightTuning = {
  /** 光源から出す光線の数（スマホは半分） */
  rays: number
  /** 光線が物に当たって跳ね返る回数の上限 */
  bounces: number
  /** ロゴの表面が光を返す割合 %。ロゴはばらばらの向きに散らして返す */
  albedo: number
  /** 部屋の左右の壁と床が光を返す割合 %。0 なら壁はなく、光は部屋の外へ抜ける */
  wall: number
  /** 壁と床の跳ね返りのうち、鏡のように返す割合 %（残りはばらばらの向きに散る） */
  wallSpecular: number
  /** 光の強さ */
  power: number
  /** 光源の半径 px。大きいほど影の縁がぼける */
  lightSize: number
  /** 床の上の棒の光（上向き）に回す光線の割合 %。下に開いたロゴの切り込みを照らす */
  barShare: number
  /** 棒の光の強さ */
  barPower: number
  /** 棒の長さ px */
  barWidth: number
  /** 棒の高さ。床から上へ px */
  barHeight: number
  /** 前のフレームの結果を残す割合 %。光線のすき間をならす */
  keep: number
  /** 光をためる層の解像度。画面の画素に対する % */
  resolution: number
  /** ロゴの格子 1 マスの大きさ px（ロゴは 12 マス × 11 マス） */
  cell: number
}

export const DEFAULT_LIGHT: LightTuning = {
  rays: 4096,
  bounces: 3,
  albedo: 70,
  wall: 50,
  wallSpecular: 0,
  power: 20,
  lightSize: 25,
  barShare: 30,
  barPower: 6,
  barWidth: 600,
  barHeight: 30,
  keep: 70,
  resolution: 50,
  cell: 16
}

export const LIGHT_PARAMS: Param<LightTuning>[] = [
  {group: '光線', key: 'rays', label: '光線の数', min: 256, max: 16384, step: 256, hint: '本。スマホは半分'},
  {group: '光線', key: 'bounces', label: '跳ね返り', min: 0, max: 8, step: 1, hint: '回'},
  {group: '光線', key: 'albedo', label: 'ロゴが返す割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: '光線', key: 'wall', label: '壁が返す割合', min: 0, max: 100, step: 5, hint: '%。部屋の左右と床。0 で壁なし'},
  {group: '光線', key: 'wallSpecular', label: '壁の鏡の割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: '見え方', key: 'power', label: '強さ', min: 0.5, max: 200, step: 0.5, hint: ''},
  {
    group: '見え方',
    key: 'lightSize',
    label: '光源の大きさ',
    min: 0,
    max: 100,
    step: 1,
    hint: 'px。半径。大きいほど影がぼける'
  },
  {group: '見え方', key: 'keep', label: '残す割合', min: 0, max: 95, step: 5, hint: '%。前のフレーム'},
  {group: '見え方', key: 'resolution', label: '解像度', min: 25, max: 100, step: 25, hint: '%。光をためる層'},
  {group: '棒の光', key: 'barShare', label: '光線の割合', min: 0, max: 90, step: 5, hint: '%。棒に回す光線'},
  {group: '棒の光', key: 'barPower', label: '強さ', min: 0, max: 200, step: 0.5, hint: ''},
  {group: '棒の光', key: 'barWidth', label: '長さ', min: 0, max: 1200, step: 10, hint: 'px'},
  {group: '棒の光', key: 'barHeight', label: '高さ', min: 0, max: 400, step: 10, hint: 'px。床から上へ'},
  {group: '配置', key: 'cell', label: 'ロゴの 1 マス', min: 4, max: 40, step: 1, hint: 'px'}
]

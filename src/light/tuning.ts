import type {Param} from '../app/DevPanel'

// 光とロゴの調整値。worker の既定値と開発用パネルの両方がここを使う

export type LightTuning = {
  /** 光源から出す光線の数（スマホは半分） */
  rays: number
  /** 光線が物に当たって跳ね返る回数の上限 */
  bounces: number
  /** ロゴの表面が光を返す割合 % */
  albedo: number
  /** 画面の端（壁）が光を返す割合 %。0 なら壁はなく、光は画面の外へ抜ける */
  wall: number
  /** 跳ね返りのうち、鏡のように返す割合 %（残りはばらばらの向きに散る） */
  specular: number
  /** 光の強さ */
  power: number
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
  specular: 10,
  power: 30,
  keep: 70,
  resolution: 50,
  cell: 16
}

export const LIGHT_PARAMS: Param<LightTuning>[] = [
  {group: '光線', key: 'rays', label: '光線の数', min: 256, max: 16384, step: 256, hint: '本。スマホは半分'},
  {group: '光線', key: 'bounces', label: '跳ね返り', min: 0, max: 8, step: 1, hint: '回'},
  {group: '光線', key: 'albedo', label: '返す割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: '光線', key: 'wall', label: '壁が返す割合', min: 0, max: 100, step: 5, hint: '%。画面の端。0 で壁なし'},
  {group: '光線', key: 'specular', label: '鏡の割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: '見え方', key: 'power', label: '強さ', min: 0.5, max: 200, step: 0.5, hint: ''},
  {group: '見え方', key: 'keep', label: '残す割合', min: 0, max: 95, step: 5, hint: '%。前のフレーム'},
  {group: '見え方', key: 'resolution', label: '解像度', min: 25, max: 100, step: 25, hint: '%。光をためる層'},
  {group: '配置', key: 'cell', label: 'ロゴの 1 マス', min: 4, max: 40, step: 1, hint: 'px'}
]

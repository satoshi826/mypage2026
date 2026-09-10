import type {SliderParam} from './DevPanel'

// 粒子の遷移まわりの調整値。worker（既定値）と開発用パネル（スライダー）の
// 両方がここを唯一の出典として使う。
// 値が固まったらこのファイルの DEFAULT_TUNING を書き換える。

export type Tuning = {
  cycleSeconds: number
  dwellRatio: number
  staggerTotal: number
  toneCurve: number
  easePower: number
}

export const DEFAULT_TUNING: Tuning = {
  cycleSeconds: 7,
  dwellRatio: 0.3,
  staggerTotal: 0.7,
  toneCurve: 1,
  easePower: 5
}

export const TUNING_PARAMS: SliderParam<Tuning>[] = [
  {
    key: 'cycleSeconds',
    label: '1枚あたりの秒数',
    min: 1,
    max: 20,
    step: 0.5,
    hint: '静止と遷移を合わせた1周の長さ'
  },
  {
    key: 'dwellRatio',
    label: '静止帯の割合',
    min: 0,
    max: 0.9,
    step: 0.05,
    hint: '1周のうち写真が像を結んでいる時間の割合。残りが遷移'
  },
  {
    key: 'staggerTotal',
    label: '出発のばらつき',
    min: 0,
    max: 0.95,
    step: 0.01,
    hint: '残りが1粒子あたりの移動時間。上げるほどカスケードが長くなり、同時に速くなる'
  },
  {
    key: 'toneCurve',
    label: '暗さのカーブ',
    min: 0.5,
    max: 10,
    step: 0.1,
    hint: '1 で線形。写真が暗部に偏っているので、上げないと大半の粒子が同時に動いてしまう'
  },
  {
    key: 'easePower',
    label: '遷移のイージング',
    min: 1,
    max: 6,
    step: 0.1,
    hint: '1 で等速、3 で cubic。上げるほど出だしと終わりがゆっくりになる'
  }
]

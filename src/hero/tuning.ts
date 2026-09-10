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

// マウスと指による干渉。写真の位置からのズレ（変位）だけを動かすので、
// 干渉が止めば必ず元の写真に戻る。

export type Interaction = {
  /** 力が届く半径。写真の半幅を 1 とした長さ */
  radius: number
  /** ポインタ起点で外へ押しのける強さ */
  push: number
  /** ポインタの進行方向へ引きずる強さ */
  drag: number
  /** 輝度による質量差。正で明るいほど重い、負で暗いほど重い、0 で差なし */
  massGain: number
  /** 速度が上がるときの時定数(秒)。大きいほど力の立ち上がりが緩やか */
  attack: number
  /** 速度が下がるときの時定数(秒)。大きいほど余韻が長く残る */
  release: number
  /** 速度がこれを下回ったら描画を止める。0 にすると止めずに回し続ける */
  stopBelow: number
}

export const DEFAULT_INTERACTION: Interaction = {
  radius: 0.15,
  push: 0.05,
  drag: 0.25,
  massGain: 0.5,
  attack: 0.5,
  release: 0.2,
  stopBelow: 0.005
}

export const INTERACTION_PARAMS: SliderParam<Interaction>[] = [
  {key: 'radius', label: '力の半径', min: 0.02, max: 1, step: 0.01, hint: '写真の半幅が 1'},
  {key: 'push', label: '押しのける強さ', min: 0, max: 0.3, step: 0.005, hint: 'ポインタ起点で放射状に押す'},
  {key: 'drag', label: '引きずる強さ', min: 0, max: 0.3, step: 0.005, hint: 'ポインタの進行方向へ連れていく'},
  {
    key: 'massGain',
    label: '輝度による重さ',
    min: -1,
    max: 1,
    step: 0.05,
    hint: '正で明るいほど重い。0 で差なし'
  },
  {key: 'attack', label: '立ち上がり', min: 0.01, max: 1, step: 0.01, hint: '秒。上げるほど力がゆっくり乗る'},
  {key: 'release', label: '余韻', min: 0.05, max: 3, step: 0.05, hint: '秒。上げるほど長く尾を引く'},
  {
    key: 'stopBelow',
    label: '描画を止める速度',
    min: 0,
    max: 0.05,
    step: 0.001,
    hint: 'これを下回ったら描画を止める。0 で止めずに回し続ける'
  }
]

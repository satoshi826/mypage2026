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
  cycleSeconds: 9,
  dwellRatio: 0.5,
  staggerTotal: 0.75,
  toneCurve: 1.2,
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
  /** 輝度による質量差。正で明るいほど軽い、負で明るいほど重い、0 で差なし。
   * 重さは比で効くので、1 で最暗と最明の質量比が e^2 ≈ 7.4 倍になる */
  massGain: number
  /** 重さを決めるときの暗さのカーブ。1 で線形、上げるほど暗部の差が広がる */
  massCurve: number
  /** 粒子ごとの質量のばらつき。上げるほど戻る速さと行き過ぎ方が粒ごとに散る */
  spread: number
  /** 押される向きのゆらぎ(ラジアン)。0 で全粒子が放射状に揃う */
  scatter: number
  /** 速度が上がるときの時定数(秒)。大きいほど力の立ち上がりが緩やか */
  attack: number
  /** 速度が下がるときの時定数(秒)。大きいほど余韻が長く残る */
  release: number
  /** 写真へ戻りきる速さ(秒)。バネの周期で、小さいほど硬く速い */
  returnSeconds: number
  /** バネの減衰比。1 で行き過ぎなし、下げるほどしなって戻る */
  damping: number
  /** 速度がこれを下回ったら描画を止める。0 にすると止めずに回し続ける */
  stopBelow: number
}

export const DEFAULT_INTERACTION: Interaction = {
  radius: 0.25,
  push: 0.2,
  drag: 0.01,
  massGain: 1.5,
  massCurve: 1.5,
  spread: 0,
  scatter: 0.1,
  attack: 2,
  release: 0.15,
  returnSeconds: 0.6,
  damping: 0.2,
  stopBelow: 0
}

export const INTERACTION_PARAMS: SliderParam<Interaction>[] = [
  {key: 'radius', label: '力の半径', min: 0.02, max: 1, step: 0.01, hint: '写真の半幅が 1'},
  {key: 'push', label: '押しのける強さ', min: 0, max: 0.3, step: 0.005, hint: 'ポインタ起点で放射状に押す'},
  {key: 'drag', label: '引きずる強さ', min: 0, max: 0.3, step: 0.005, hint: 'ポインタの進行方向へ連れていく'},
  {
    key: 'massGain',
    label: '輝度による重さ',
    min: -3,
    max: 3,
    step: 0.1,
    hint: '正で明るいほど軽い。0 で差なし。1 で最暗と最明が約7倍'
  },
  {
    key: 'massCurve',
    label: '重さのカーブ',
    min: 0.5,
    max: 10,
    step: 0.1,
    hint: '1 で線形。上げるほど暗部の差が広がる'
  },
  {key: 'spread', label: '重さのばらつき', min: 0, max: 0.9, step: 0.05, hint: '粒子ごとに質量を散らす'},
  {key: 'scatter', label: '向きのゆらぎ', min: 0, max: 1.5, step: 0.05, hint: 'ラジアン。0 で放射状に揃う'},
  {key: 'attack', label: '立ち上がり', min: 0.01, max: 2, step: 0.01, hint: '秒。上げるほど力がゆっくり乗る'},
  {key: 'release', label: '余韻', min: 0.05, max: 3, step: 0.05, hint: '秒。上げるほど長く尾を引く'},
  {key: 'returnSeconds', label: '戻る速さ', min: 0.15, max: 3, step: 0.05, hint: '秒。小さいほど硬く速く戻る'},
  {key: 'damping', label: '減衰比', min: 0.2, max: 2, step: 0.05, hint: '1 で行き過ぎなし。下げるほどしなる'},
  {
    key: 'stopBelow',
    label: '描画を止める速度',
    min: 0,
    max: 0.05,
    step: 0.001,
    hint: 'これを下回ったら描画を止める。0 で止めずに回し続ける'
  }
]

import type {Param} from '../app/DevPanel'

// 光とロゴの調整値。worker の既定値と開発用パネルの両方がここを使う

export type LightTuning = {
  // 上の光と下の光。どちらもロゴの中心を向くスポット。光線は強さの比で 2 つに分ける。位置は、最後に画面に収まるロゴの中心からのずれで、部屋の高さに対する %。
  // x は正で右、y は正で下。上の光はスクロールで画面の中央からそこまで上がり、下の光は部屋と一緒に動く
  /** 上の光の強さ */
  upperPower: number
  /** 上の光の光源の半径 px。大きいほど影の縁がぼける */
  upperSize: number
  /**
   * 上の光の広がり。ロゴの中心を向く向きから左右にこの角度（度）まで出し、その向きが一番明るく、この角度で 0 になる。
   * ついた直後は全周（180）に出し、ページの一番下までスクロールするあいだにこの角度まで絞る
   */
  upperCone: number
  upperX: number
  upperY: number
  /** 下の光の強さ。下に開いたロゴの切り込みを照らす */
  underPower: number
  /** 下の光の光源の半径 px */
  underSize: number
  /** 下の光の広がり。ロゴの中心を向く向きから左右にこの角度（度）まで出し、その向きが一番明るく、この角度で 0 になる */
  underCone: number
  underX: number
  underY: number

  // ロゴ。素材は白い面・ガラス・金属の 3 つ（訪問者がフッターで切り替える）
  /** ロゴの横のずれ px。負で左。2 つの光もロゴからのずれで置くので、一緒にずれる */
  logoShift: number
  /** ロゴの格子 1 マスの大きさ px（ロゴは 12 マス × 11 マス） */
  cell: number
  /** 白い面が光を返す割合 %。ばらばらの向きに散らして返す */
  albedo: number
  /** ガラスの屈折率。1.33 で水、1.5 でガラスに近い。大きいほど強く曲がり、面で返る割合も増える */
  ior: number
  /** ガラスのぼけ。屈折した向きから左右にずれる最大の角度（度）。大きいほどすりガラスに近く、光の筋が柔らかくなる */
  frost: number
  /** 金属が光を返す割合 %。鏡の向きの近くに返し、残りは吸収する */
  reflectance: number
  /** 金属のぼけ。鏡の向きから左右にずれる最大の角度（度）。小さいほど磨いた金属、大きいほどつや消しに近い */
  roughness: number

  // 描画
  /**
   * 光源から出す光線の数の下限と上限。下限から始め、60fps 出ていれば上限まで増やし、出なければ下限まで減らす
   * （light/rayBudget.ts）
   */
  minRays: number
  maxRays: number
  /** 光線がロゴに当たって跳ね返る回数の上限。ロゴの切り込みの中で棒と棒のあいだを行き来するぶん */
  bounces: number
  /** 前のフレームの結果を残す割合 %。光線のすき間をならす（時間の平均）。ロゴや光が止まっているとき */
  keep: number
  /** ロゴや光が動いているときに、前のフレームの結果を残す割合 %。弱めにして跡を引かないようにする */
  keepMoving: number
  /** 光をためる層の解像度。画面の画素に対する % */
  resolution: number
  /** 光へ飛んでいる粒子の光の強さ。粒子の輝度に掛ける。1 で、写真の粒子と同じくらいの明るさ */
  particleGlow: number
}

export const DEFAULT_LIGHT: LightTuning = {
  upperPower: 40,
  upperSize: 4,
  upperCone: 36,
  upperX: 10,
  upperY: -21,
  underPower: 40,
  underSize: 4,
  underCone: 30,
  underX: -12,
  underY: 18,
  logoShift: -10,
  cell: 10,
  albedo: 100,
  ior: 2,
  frost: 4,
  reflectance: 90,
  roughness: 6,
  minRays: 8192,
  maxRays: 32000,
  bounces: 8,
  keep: 95,
  keepMoving: 80,
  resolution: 100,
  particleGlow: 1.5
}

/** 光源の位置の範囲。部屋の高さの % */
const SHIFT = {min: -60, max: 60, step: 1}

export const LIGHT_PARAMS: Param<LightTuning>[] = [
  {group: '上の光', key: 'upperPower', label: '強さ', min: 0, max: 200, step: 0.5, hint: ''},
  {
    group: '上の光',
    key: 'upperSize',
    label: '光源の大きさ',
    min: 0,
    max: 100,
    step: 1,
    hint: 'px。半径。大きいほど影がぼける'
  },
  {
    group: '上の光',
    key: 'upperCone',
    label: '広がり',
    min: 5,
    max: 180,
    step: 1,
    hint: '度。最後の画面で。ロゴを向く向きから左右に'
  },
  {group: '上の光', key: 'upperX', label: '横の位置', ...SHIFT, hint: '部屋の高さの %。ロゴの中心から。正で右'},
  {group: '上の光', key: 'upperY', label: '縦の位置', ...SHIFT, hint: '部屋の高さの %。ロゴの中心から。正で下'},
  {group: '下の光', key: 'underPower', label: '強さ', min: 0, max: 200, step: 0.5, hint: ''},
  {group: '下の光', key: 'underSize', label: '光源の大きさ', min: 0, max: 100, step: 1, hint: 'px。半径'},
  {group: '下の光', key: 'underCone', label: '広がり', min: 5, max: 90, step: 1, hint: '度。ロゴを向く向きから左右に'},
  {group: '下の光', key: 'underX', label: '横の位置', ...SHIFT, hint: '部屋の高さの %。ロゴの中心から。正で右'},
  {group: '下の光', key: 'underY', label: '縦の位置', ...SHIFT, hint: '部屋の高さの %。ロゴの中心から。正で下'},
  {
    group: 'ロゴ',
    key: 'logoShift',
    label: '横のずれ',
    min: -400,
    max: 400,
    step: 10,
    hint: 'px。負で左。光も一緒にずれる'
  },
  {group: 'ロゴ', key: 'cell', label: '1 マス', min: 4, max: 40, step: 1, hint: 'px'},
  {group: 'ロゴ', key: 'albedo', label: '白い面: 返す割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: 'ロゴ', key: 'ior', label: 'ガラス: 屈折率', min: 1, max: 2.4, step: 0.01, hint: '1.33 で水、1.5 でガラス'},
  {group: 'ロゴ', key: 'frost', label: 'ガラス: ぼけ', min: 0, max: 45, step: 1, hint: '度。屈折した向きから左右に'},
  {group: 'ロゴ', key: 'reflectance', label: '金属: 返す割合', min: 0, max: 100, step: 5, hint: '%。残りは吸収する'},
  {group: 'ロゴ', key: 'roughness', label: '金属: ぼけ', min: 0, max: 90, step: 1, hint: '度。鏡の向きから左右に'},
  {group: '描画', key: 'minRays', label: '光線の数の下限', min: 256, max: 16384, step: 256, hint: '本。ここから始める'},
  {
    group: '描画',
    key: 'maxRays',
    label: '光線の数の上限',
    min: 256,
    max: 65536,
    step: 1024,
    hint: '本。60fps 出ていればここまで増やす'
  },
  {group: '描画', key: 'bounces', label: '跳ね返り', min: 0, max: 8, step: 1, hint: '回'},
  {group: '描画', key: 'keep', label: '残す割合', min: 0, max: 95, step: 5, hint: '%。前のフレーム。止まっているとき'},
  {
    group: '描画',
    key: 'keepMoving',
    label: '動いているときに残す割合',
    min: 0,
    max: 95,
    step: 5,
    hint: '%。前のフレーム'
  },
  {group: '描画', key: 'resolution', label: '解像度', min: 25, max: 100, step: 25, hint: '%。光をためる層'},
  {group: '描画', key: 'particleGlow', label: '飛ぶ粒子の光', min: 0, max: 10, step: 0.1, hint: '粒子の輝度に掛ける'}
]

import type {Param} from '../app/DevPanel'

// 光とロゴの調整値。worker の既定値と開発用パネルの両方がここを使う

export type LightTuning = {
  /**
   * 光源から出す光線の数の下限と上限。下限から始め、60fps 出ていれば上限まで増やし、出なければ下限まで減らす
   * （light/rayBudget.ts）
   */
  minRays: number
  maxRays: number
  /** 光線がロゴに当たって跳ね返る回数の上限。ロゴの切り込みの中で棒と棒のあいだを行き来するぶん */
  bounces: number
  /** ロゴの表面が光を返す割合 %。ロゴはばらばらの向きに散らして返す */
  albedo: number
  /** 和紙にしたとき、ロゴに当たった光線のうち中へ入る割合 %。残りは白い面と同じく表面で散る */
  translucency: number
  /** 和紙の中で、光線が向きを変えるまでに進む平均の長さ px。短いほど入ったところの近くで出て、柔らかく光る */
  scatter: number
  /** つやにしたとき、ロゴに当たった光線のうち鏡の向きに返る割合 %。残りは白い面と同じく散る */
  shine: number
  /** つやのぼけ。鏡の向きから左右にずれる最大の角度（度）。小さいほど鏡に近い */
  roughness: number
  /** 光の強さ */
  power: number
  /** 光源の半径 px。大きいほど影の縁がぼける */
  lightSize: number
  /**
   * 光の広がり。ロゴの中心を向く向きから左右にこの角度（度）まで出し、その向きが一番明るく、この角度で 0 になる。ついた直後は全周（180）に出し、
   * ページの一番下までスクロールするあいだにこの角度まで絞る
   */
  cone: number
  /**
   * ロゴの横のずれ px。負で左。光は画面の中央にあるので、ロゴを左へずらすと光がロゴの右寄りの上に来て、
   * 上に開いた切り込み（右寄り）に光が入る
   */
  logoShift: number
  /** 部屋の床の上に置く下の光（ロゴの中心を向くスポット）に回す光線の割合 %。下に開いたロゴの切り込みを照らす */
  underShare: number
  /** 下の光の強さ */
  underPower: number
  /** 下の光の光源の半径 px */
  underSize: number
  /** 下の光の広がり。ロゴの中心を向く向きから左右にこの角度（度）まで出し、その向きが一番明るく、この角度で 0 になる */
  underCone: number
  /** 下の光の横の位置。ロゴの中心から px。負で左。下に開いた 2 本の切り込み（左寄り）の真下に置く */
  underShift: number
  /** 下の光の高さ。床から上へ px */
  underHeight: number
  /** 前のフレームの結果を残す割合 %。光線のすき間をならす（時間の平均）。ロゴや光が止まっているとき */
  keep: number
  /** ロゴや光が動いているときに、前のフレームの結果を残す割合 %。弱めにして跡を引かないようにする */
  keepMoving: number
  /** 光をためる層の解像度。画面の画素に対する % */
  resolution: number
  /** 光へ飛んでいる粒子の光の強さ。粒子の輝度に掛ける。1 で、写真の粒子と同じくらいの明るさ */
  particleGlow: number
  /** ロゴの格子 1 マスの大きさ px（ロゴは 12 マス × 11 マス） */
  cell: number
}

export const DEFAULT_LIGHT: LightTuning = {
  minRays: 8192,
  maxRays: 12288,
  bounces: 8,
  albedo: 100,
  translucency: 70,
  scatter: 8,
  shine: 40,
  roughness: 12,
  power: 22.5,
  lightSize: 4,
  cone: 36,
  keep: 95,
  keepMoving: 80,
  resolution: 100,
  particleGlow: 1.5,
  underShare: 50,
  underPower: 22.5,
  underSize: 4,
  underCone: 45,
  underShift: -80,
  underHeight: 120,
  logoShift: 0,
  cell: 12
}

export const LIGHT_PARAMS: Param<LightTuning>[] = [
  {group: '光線', key: 'minRays', label: '光線の数の下限', min: 256, max: 16384, step: 256, hint: '本。ここから始める'},
  {
    group: '光線',
    key: 'maxRays',
    label: '光線の数の上限',
    min: 256,
    max: 65536,
    step: 1024,
    hint: '本。60fps 出ていればここまで増やす'
  },
  {group: '光線', key: 'bounces', label: '跳ね返り', min: 0, max: 8, step: 1, hint: '回'},
  {group: '光線', key: 'albedo', label: 'ロゴが返す割合', min: 0, max: 100, step: 5, hint: '%'},
  {group: '和紙', key: 'translucency', label: '中へ入る割合', min: 0, max: 100, step: 5, hint: '%。残りは表面で散る'},
  {group: '和紙', key: 'scatter', label: '散るまでの長さ', min: 1, max: 60, step: 1, hint: 'px。平均'},
  {group: 'つや', key: 'shine', label: '鏡の向きに返す割合', min: 0, max: 100, step: 5, hint: '%。残りは散る'},
  {group: 'つや', key: 'roughness', label: 'ぼけ', min: 0, max: 90, step: 1, hint: '度。鏡の向きから左右に'},
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
  {
    group: '見え方',
    key: 'cone',
    label: '光の広がり',
    min: 5,
    max: 180,
    step: 1,
    hint: '度。最後の画面で。ロゴを向く向きから左右に'
  },
  {
    group: '見え方',
    key: 'keep',
    label: '残す割合',
    min: 0,
    max: 95,
    step: 5,
    hint: '%。前のフレーム。止まっているとき'
  },
  {
    group: '見え方',
    key: 'keepMoving',
    label: '動いているときに残す割合',
    min: 0,
    max: 95,
    step: 5,
    hint: '%。前のフレーム'
  },
  {group: '見え方', key: 'particleGlow', label: '飛ぶ粒子の光', min: 0, max: 10, step: 0.1, hint: '粒子の輝度に掛ける'},
  {group: '見え方', key: 'resolution', label: '解像度', min: 25, max: 100, step: 25, hint: '%。光をためる層'},
  {group: '下の光', key: 'underShare', label: '光線の割合', min: 0, max: 90, step: 5, hint: '%。下の光に回す光線'},
  {group: '下の光', key: 'underPower', label: '強さ', min: 0, max: 200, step: 0.5, hint: ''},
  {group: '下の光', key: 'underSize', label: '光源の大きさ', min: 0, max: 100, step: 1, hint: 'px。半径'},
  {
    group: '下の光',
    key: 'underCone',
    label: '光の広がり',
    min: 5,
    max: 90,
    step: 1,
    hint: '度。ロゴを向く向きから左右に'
  },
  {
    group: '下の光',
    key: 'underShift',
    label: '横のずれ',
    min: -400,
    max: 400,
    step: 10,
    hint: 'px。ロゴの中心から。負で左'
  },
  {group: '下の光', key: 'underHeight', label: '高さ', min: 0, max: 400, step: 10, hint: 'px。床から上へ'},
  {
    group: '配置',
    key: 'logoShift',
    label: 'ロゴの横のずれ',
    min: -400,
    max: 400,
    step: 10,
    hint: 'px。負で左'
  },
  {group: '配置', key: 'cell', label: 'ロゴの 1 マス', min: 4, max: 40, step: 1, hint: 'px'}
]

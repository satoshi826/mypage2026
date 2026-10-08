import type {Param} from '../app/DevPanel'

// Photos で写真を広げる・戻すときの動きの調整値。Gallery（既定値）と開発用パネルの両方がここを使う。
// 値が固まったら DEFAULT_MOTION を書き換える。
// スクロールで見つけた写真が現れるワイプは固定で、styles.css の [data-reveal] が持つ。

/** 広く使われるイージング。CSS 用の cubic-bezier と、スクロールに渡す関数の両方を持つ */
export const EASINGS = {
  easeOutCubic: {css: 'cubic-bezier(0.33, 1, 0.68, 1)', fn: (t: number) => 1 - (1 - t) ** 3},
  easeOutQuart: {css: 'cubic-bezier(0.25, 1, 0.5, 1)', fn: (t: number) => 1 - (1 - t) ** 4},
  easeOutQuint: {css: 'cubic-bezier(0.22, 1, 0.36, 1)', fn: (t: number) => 1 - (1 - t) ** 5},
  easeOutExpo: {css: 'cubic-bezier(0.16, 1, 0.3, 1)', fn: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))},
  easeInOutCubic: {
    css: 'cubic-bezier(0.65, 0, 0.35, 1)',
    fn: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
  },
  easeInOutQuart: {
    css: 'cubic-bezier(0.76, 0, 0.24, 1)',
    fn: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2)
  },
  easeInOutQuint: {
    css: 'cubic-bezier(0.83, 0, 0.17, 1)',
    fn: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2)
  },
  easeInOutExpo: {
    css: 'cubic-bezier(0.87, 0, 0.13, 1)',
    fn: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2)
  }
}
export type Easing = keyof typeof EASINGS

export type Motion = {
  /** 広げる・戻すときに写真が動く秒数 */
  expandSeconds: number
  /** 広げた写真が画面に収まらないとき、上辺をナビの下へ寄せるスクロールの秒数 */
  scrollSeconds: number
  /** 動きとスクロールに共通のイージング */
  easing: Easing
}

export const DEFAULT_MOTION: Motion = {
  expandSeconds: 1,
  scrollSeconds: 1,
  easing: 'easeOutQuint'
}

export const MOTION_PARAMS: Param<Motion>[] = [
  {key: 'expandSeconds', label: '広げる・戻す', min: 0.2, max: 3, step: 0.05, hint: '秒'},
  {
    key: 'scrollSeconds',
    label: '寄せるスクロール',
    min: 0.2,
    max: 3,
    step: 0.05,
    hint: '秒。広げた写真が画面に収まらないときだけ動く'
  },
  {key: 'easing', label: 'イージング', options: Object.keys(EASINGS), hint: '動きとスクロールに共通'}
]

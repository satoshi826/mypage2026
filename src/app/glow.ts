// 部品の光の強さ（styles.css の --glow）を置くクラス。光る線や文字（.glow-line など）は、この要素か、その中に置く

/** ホバーとキーボードで選んだときに弱く光らせる */
export const GLOW_HOVER = 'hover:[--glow:var(--glow-weak)] focus-visible:[--glow:var(--glow-weak)]'

/** いつも選んでいる状態の強さで光らせる（タブの下線、hero のプログレスなど、それ自体が「今」を示すもの） */
export const GLOW_ON = '[--glow:1]'

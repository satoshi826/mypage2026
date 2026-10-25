// 部品の光の強さ（styles.css の --glow）を置くクラス。光る線や文字（.glow-line など）は、この要素か、その中に置く。
// 一番明るいのはホバーで、選んでいる状態はその一段下（docs/design.md の「光」）

/** ホバーとキーボードで選んだときの光。選んでいる状態の要素でも、触れているあいだはこちらが勝つ */
export const GLOW_HOVER = 'hover:[--glow:var(--glow-hover)]! focus-visible:[--glow:var(--glow-hover)]!'

/** 選んでいる状態の光。いつもそれ自体が「今」を示すもの（タブの下線、hero のプログレス）に置く */
export const GLOW_SELECTED = '[--glow:var(--glow-selected)]'

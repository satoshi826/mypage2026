import {DevPanel, type Param} from './DevPanel'

// 部品の光（styles.css の --glow-*）を詰める開発用パネル。開発中だけ描かれる

/** 濃さは %、にじみは px、ホバーの強さは選んでいる状態に対する % */
type Glow = {
  nearBlur: number
  near: number
  farBlur: number
  far: number
  textBlur: number
  text: number
  weak: number
}

/** 既定値。styles.css の --glow-* と同じ値。決まったら両方を書き換える */
const DEFAULT_GLOW: Glow = {nearBlur: 3, near: 60, farBlur: 20, far: 80, textBlur: 12, text: 60, weak: 50}

const PARAMS: Param<Glow>[] = [
  {key: 'nearBlur', group: '線と記号', label: '近いにじみ', min: 0, max: 12, step: 0.5, hint: 'px'},
  {key: 'near', group: '線と記号', label: '近い濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {
    key: 'farBlur',
    group: '線と記号',
    label: '遠いにじみ',
    min: 0,
    max: 40,
    step: 1,
    hint: 'px。記号は文字のにじみを使う'
  },
  {key: 'far', group: '線と記号', label: '遠い濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'textBlur', group: '文字', label: 'にじみ', min: 0, max: 24, step: 1, hint: 'px'},
  {key: 'text', group: '文字', label: '濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'weak', label: 'ホバーの強さ', min: 0, max: 100, step: 5, hint: '選んでいる状態に対する %'}
]

/** 値を CSS 変数へ書く。パネルの onChange は描くたびに比べられるので、外に置いて同じ関数を渡す */
function apply(g: Glow) {
  const style = document.documentElement.style
  style.setProperty('--glow-near-blur', `${g.nearBlur}px`)
  style.setProperty('--glow-near', `${g.near / 100}`)
  style.setProperty('--glow-far-blur', `${g.farBlur}px`)
  style.setProperty('--glow-far', `${g.far / 100}`)
  style.setProperty('--glow-text-blur', `${g.textBlur}px`)
  style.setProperty('--glow-text', `${g.text / 100}`)
  style.setProperty('--glow-weak', `${g.weak / 100}`)
}

export function GlowPanel() {
  return (
    <DevPanel
      title="部品の光"
      typeName="Glow"
      constName="DEFAULT_GLOW"
      params={PARAMS}
      defaults={DEFAULT_GLOW}
      storageKey="mypage2026.glow"
      onChange={apply}
    />
  )
}

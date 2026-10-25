import {DevPanel, type Param} from './DevPanel'

// 地の粒（styles.css の --grain）を詰める開発用パネル。開発中だけ描かれる

type Grain = {amount: number; size: number}

/** 既定値。styles.css の --grain と同じ値。決まったら両方を書き換える */
const DEFAULT_GRAIN: Grain = {amount: 40, size: 1}

const PARAMS: Param<Grain>[] = [
  {key: 'amount', label: '濃さ', min: 0, max: 100, step: 5, hint: '%。0 で無地'},
  {key: 'size', label: '粒の大きさ', min: 0.5, max: 3, step: 0.25, hint: '倍'}
]

function apply(g: Grain) {
  const style = document.documentElement.style
  style.setProperty('--grain', `${g.amount / 100}`)
  style.setProperty('--grain-size', `${g.size}`)
}

export function GrainPanel() {
  return (
    <DevPanel
      title="地の粒"
      typeName="Grain"
      constName="DEFAULT_GRAIN"
      params={PARAMS}
      defaults={DEFAULT_GRAIN}
      storageKey="mypage2026.grain"
      onChange={apply}
    />
  )
}

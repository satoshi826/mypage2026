import {DevPanel, type Param} from './DevPanel'
import {GRAIN_KINDS, renderGrain, type GrainKind} from './grain'

// 地の粒（styles.css の --grain、app/grain.ts）を詰める開発用パネル。開発中だけ描かれる

type Grain = {kind: string; amount: number; size: number}

/** 既定値。styles.css の --grain と grain.ts の KIND と同じ値。決まったら両方を書き換える */
const DEFAULT_GRAIN: Grain = {kind: 'triangle', amount: 40, size: 2}

const PARAMS: Param<Grain>[] = [
  {key: 'kind', label: '種類', options: GRAIN_KINDS, hint: '粒の作り方（grain.ts の GRAIN_KINDS）'},
  {key: 'amount', label: '濃さ', min: 0, max: 100, step: 5, hint: '%。0 で無地'},
  {key: 'size', label: '粒の大きさ', min: 1, max: 4, step: 1, hint: '画面の画素いくつ分か'}
]

let kind = ''

function apply(g: Grain) {
  const style = document.documentElement.style
  style.setProperty('--grain', `${g.amount / 100}`)
  style.setProperty('--grain-size', `${g.size}`)
  // 種類が変わったときだけ画像を作り直す（作るのに少しかかるため）
  if (g.kind !== kind) {
    kind = g.kind
    renderGrain(g.kind as GrainKind)
  }
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

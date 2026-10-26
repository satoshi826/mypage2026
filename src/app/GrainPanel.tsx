import {DevPanel, type Param} from './DevPanel'
import {GRAIN_KINDS, renderGrain, type GrainKind} from './grain'
import {renderVignette} from './vignette'

// 地の色（--color-ground）、粒（styles.css の --grain、app/grain.ts）、周辺減光（--vignette、app/vignette.ts）を
// 詰める開発用パネル。開発中だけ描かれる

type Grain = {ground: number; kind: string; amount: number; size: number; vignette: number; vignetteStart: number}

/** 既定値。styles.css の --color-ground・--grain・--vignette と grain.ts の KIND と同じ値。決まったら両方を書き換える */
const DEFAULT_GRAIN: Grain = {ground: 30, kind: 'gauss', amount: 20, size: 1, vignette: 85, vignetteStart: 0}

const PARAMS: Param<Grain>[] = [
  {key: 'ground', label: '地の明るさ', min: 0, max: 48, step: 1, hint: '0〜255 の灰色'},
  {key: 'kind', label: '種類', options: GRAIN_KINDS, hint: '粒の作り方（grain.ts の GRAIN_KINDS）'},
  {key: 'amount', label: '濃さ', min: 0, max: 100, step: 5, hint: '%。0 で無地'},
  {key: 'size', label: '粒の大きさ', min: 1, max: 4, step: 1, hint: '画面の画素いくつ分か'},
  {key: 'vignette', group: '周辺減光', label: '端の暗さ', min: 0, max: 100, step: 5, hint: '%。0 でなし'},
  {
    key: 'vignetteStart',
    group: '周辺減光',
    label: '暗くなり始める位置',
    min: 0,
    max: 90,
    step: 5,
    hint: '% 。中心からの距離'
  }
]

let kind = ''
let vignette = [-1, -1, -1]

function apply(g: Grain) {
  const style = document.documentElement.style
  style.setProperty('--color-ground', `rgb(${g.ground} ${g.ground} ${g.ground})`)
  style.setProperty('--grain', `${g.amount / 100}`)
  style.setProperty('--grain-size', `${g.size}`)
  style.setProperty('--vignette', `${g.vignette / 100}`)
  style.setProperty('--vignette-start', `${g.vignetteStart}%`)
  // 周辺減光は画像なので、値が変わったら作り直す
  if (g.vignette !== vignette[0] || g.vignetteStart !== vignette[1] || g.ground !== vignette[2]) {
    vignette = [g.vignette, g.vignetteStart, g.ground]
    renderVignette()
  }
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

import {DevPanel, type Param} from './DevPanel'
import {GRAIN_KINDS, renderGrain, type GrainKind} from './grain'

// 地の色（--color-ground）と粒（app/grain.ts）を詰める開発用パネル。開発中だけ描かれる

type Grain = {ground: number; kind: string; amount: number}

/** 既定値。styles.css の --color-ground と grain.ts の KIND・AMOUNT と同じ値。決まったら両方を書き換える */
const DEFAULT_GRAIN: Grain = {ground: 18, kind: 'gauss', amount: 40}

const PARAMS: Param<Grain>[] = [
  {key: 'ground', label: '地の明るさ', min: 0, max: 48, step: 1, hint: '0〜255 の灰色'},
  {key: 'kind', label: '種類', options: GRAIN_KINDS, hint: '粒の作り方（grain.ts の GRAIN_KINDS）'},
  {key: 'amount', label: '濃さ', min: 0, max: 100, step: 5, hint: '%。0 で無地'}
]

let last = ''

function apply(g: Grain) {
  document.documentElement.style.setProperty('--color-ground', `rgb(${g.ground} ${g.ground} ${g.ground})`)
  // 粒は画像なので、種類か濃さが変わったときだけ作り直す（作るのに少しかかるため）
  const key = `${g.kind}:${g.amount}`
  if (key !== last) {
    last = key
    renderGrain(g.kind as GrainKind, g.amount / 100)
  }
}

export function GrainPanel() {
  return (
    <DevPanel
      site
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

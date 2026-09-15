import type {CSSProperties} from 'react'
import type {SliderParam} from './DevPanel'
import {SOURCE_H, SOURCE_W} from './table'

const ASPECT = SOURCE_W / SOURCE_H

/**
 * コントロールパネルの寸法。CSS 変数としてパネルのルートに書き込む。
 * 開発用パネルで詰めるあいだ変数にしているだけで、値が決まったら
 * ControlPanel の className に固定値として畳む。
 */
export type Layout = {
  /** マス（数字1つ）の一辺 px */
  cell: number
  /** マスの横方向の間隔 px */
  gapX: number
  /** マスの縦方向の間隔 px */
  gapY: number
  /** 列数。カレンダーの横幅はこれと cell / gapX から決まる */
  columns: number
  /** 選択中を囲む丸の線の太さ px */
  markerBorder: number
  /** 丸が隣のマスへ移る時間 ms */
  markerDuration: number
  /** カレンダー上部のプログレスバーの太さ px */
  progressHeight: number
  /** プログレスバーの未通過部分のうち、遷移帯ぶんの濃さ %。通過した部分は 100% */
  morphOpacity: number
  /** プログレスバーの未通過部分のうち、静止帯ぶんの濃さ %。遷移帯より薄くして段差をつける */
  dwellOpacity: number
  /** 非選択のマスの不透明度 % */
  idleOpacity: number
  /** カレンダー下の棒グラフの高さ px。0 で出さない。横並びのときだけ描く */
  eqHeight: number
  /** パネル内の各ブロックの間隔 px */
  blockGap: number
  /** 棒の本数 */
  eqBars: number
  /** 棒の高さのカーブ。1 で素のまま、上げるほど低い棒が持ち上がる */
  eqCurve: number
  /** 飛行中の棒をどれだけ明るくするか。0 で濃さが一定 */
  eqMotion: number
  /** 棒にホバーしたとき、そこをどこまで明るくするか %。0 で強調なし */
  hoverLift: number
  /** 強調が広がる幅。棒いくつ分か */
  hoverSpread: number
  /** 強調の裾の形。2 でガウス、下げるほど尖って裾が長く、上げるほど角ばる */
  hoverCurve: number
  /** ホバー中、帯の中心の粒子の大きさ（倍） */
  hoverNear: number
  /** ホバー中、帯から外れた粒子の大きさ（倍） */
  hoverFar: number
  /** ホバー中、帯の粒子の暗部をどれだけ持ち上げるか。1 でそのまま */
  hoverGamma: number
  /** ホバー中、帯から外れた粒子の暗さ %。100 でそのまま */
  hoverDim: number
  /** 棒グラフの横軸。1 で sRGB のまま、下げるほど暗部が広がる */
  eqAxis: number
  /** パネルの左右の余白 px。狭い画面ではここを削ると列数を稼げる */
  padding: number
}

/** 写真とパネルの並べ方 */
export type Direction = 'stacked' | 'side'

/** 写真の下にパネルを置く。縦長の画面ではこちらが有利 */
export const STACKED_LAYOUT: Layout = {
  cell: 44,
  gapX: 4,
  gapY: 4,
  columns: 7,
  markerBorder: 1,
  markerDuration: 500,
  progressHeight: 1,
  morphOpacity: 15,
  dwellOpacity: 8,
  idleOpacity: 35,
  eqHeight: 108,
  blockGap: 16,
  eqBars: 48,
  eqCurve: 1,
  eqMotion: 1,
  hoverLift: 100,
  hoverSpread: 2,
  hoverCurve: 2,
  hoverNear: 1,
  hoverFar: 2,
  hoverGamma: 2,
  hoverDim: 40,
  eqAxis: 1,
  padding: 16
}

/** 写真の横にパネルを置く。横長の画面ではこちらが有利 */
export const SIDE_LAYOUT: Layout = {
  cell: 28,
  gapX: 8,
  gapY: 12,
  columns: 7,
  markerBorder: 1,
  markerDuration: 800,
  progressHeight: 1,
  morphOpacity: 30,
  dwellOpacity: 16,
  idleOpacity: 20,
  eqHeight: 96,
  blockGap: 20,
  eqBars: 48,
  eqCurve: 2.5,
  eqMotion: 2.5,
  hoverLift: 100,
  hoverSpread: 2,
  hoverCurve: 2,
  hoverNear: 1,
  hoverFar: 2,
  hoverGamma: 2,
  hoverDim: 40,
  eqAxis: 0.8,
  padding: 32
}

export const LAYOUT_PRESETS: Record<Direction, Layout> = {stacked: STACKED_LAYOUT, side: SIDE_LAYOUT}

/**
 * パネルのうち、カレンダー以外が占める高さ px。
 * AUTO ボタン・プログレスバー・上下の余白の合計で、ControlPanel の className と
 * 手で合わせている。ずれても分岐点がわずかに動くだけで壊れはしない。
 */
const PANEL_CHROME = 108

export const panelWidth = (l: Layout) => l.columns * l.cell + (l.columns - 1) * l.gapX

export function panelHeight(l: Layout, count: number) {
  const rows = Math.ceil(count / l.columns)
  return PANEL_CHROME + rows * l.cell + (rows - 1) * l.gapY
}

/**
 * 並べ方を決める。写真が大きくなるほうを選ぶ。
 *
 * しきい値を定数にしないのは、パネルの寸法を変えると分岐点も動くため。
 * 面積で比べていれば、列数やマスの大きさを変えたときに自動で追従する。
 */
export function chooseDirection(width: number, height: number, count: number): Direction {
  const area = (w: number, h: number) => {
    const fitted = Math.max(0, Math.min(w, h * ASPECT))
    return (fitted * fitted) / ASPECT
  }
  const stacked = area(width - STACKED_LAYOUT.padding * 2, height - panelHeight(STACKED_LAYOUT, count))
  const side = area(width - panelWidth(SIDE_LAYOUT) - SIDE_LAYOUT.padding * 3, height)
  return side > stacked ? 'side' : 'stacked'
}

export const LAYOUT_PARAMS: SliderParam<Layout>[] = [
  {key: 'cell', label: 'マスの一辺', min: 20, max: 72, step: 1, hint: '数字1つぶんの大きさ(px)'},
  {key: 'gapX', label: 'マスの間隔（横）', min: 0, max: 32, step: 1, hint: 'px'},
  {key: 'gapY', label: 'マスの間隔（縦）', min: 0, max: 32, step: 1, hint: 'px'},
  {key: 'columns', label: '列数', min: 4, max: 20, step: 1, hint: 'カレンダーの横幅はこれと一辺・間隔で決まる'},
  {key: 'markerBorder', label: '丸の線の太さ', min: 1, max: 4, step: 1, hint: 'px'},
  {key: 'markerDuration', label: '丸の移動時間', min: 0, max: 1200, step: 50, hint: 'ms。0 で瞬間移動'},
  {key: 'progressHeight', label: 'バーの太さ', min: 1, max: 8, step: 1, hint: 'px'},
  {key: 'morphOpacity', label: 'バーの濃さ（遷移帯ぶん）', min: 0, max: 100, step: 1, hint: '%。通過ぶんは 100%'},
  {
    key: 'dwellOpacity',
    label: 'バーの濃さ（静止帯ぶん）',
    min: 0,
    max: 100,
    step: 1,
    hint: '%。遷移帯ぶんより薄くする'
  },
  {key: 'idleOpacity', label: '非選択の濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {key: 'eqHeight', label: 'スペクトラムの高さ', min: 0, max: 240, step: 4, hint: 'px。0 で出さない'},
  {
    key: 'blockGap',
    label: 'ブロックの間隔',
    min: 0,
    max: 80,
    step: 2,
    hint: 'px。操作・バー・カレンダー・スペクトラムのあいだ'
  },
  {key: 'eqBars', label: '棒の本数', min: 8, max: 96, step: 1, hint: '本'},
  {
    key: 'eqCurve',
    label: '棒のカーブ',
    min: 0.3,
    max: 3,
    step: 0.05,
    hint: '1 で素のまま。上げるほど低い棒が持ち上がる'
  },
  {key: 'eqMotion', label: '飛行中の明るさ', min: 0, max: 4, step: 0.1, hint: '0 で一定。上げると速い棒ほど明るくなる'},
  {key: 'hoverLift', label: 'ホバーの明るさ', min: 0, max: 100, step: 5, hint: '%。棒をどこまで持ち上げるか'},
  {key: 'hoverSpread', label: 'ホバーの広がり', min: 0.5, max: 12, step: 0.5, hint: '棒いくつ分に広がるか'},
  {
    key: 'hoverCurve',
    label: 'ホバーの裾',
    min: 0.5,
    max: 6,
    step: 0.1,
    hint: '2 でガウス。下げると尖り、上げると角ばる'
  },
  {key: 'hoverNear', label: 'ホバーの粒（対象）', min: 0.2, max: 8, step: 0.2, hint: '倍'},
  {key: 'hoverFar', label: 'ホバーの粒（対象外）', min: 0.2, max: 8, step: 0.2, hint: '倍。1px 未満には縮まない'},
  {key: 'hoverGamma', label: 'ホバーの持ち上げ', min: 1, max: 4, step: 0.1, hint: '対象の暗部。1 でそのまま'},
  {key: 'hoverDim', label: 'ホバーの暗さ（対象外）', min: 0, max: 100, step: 5, hint: '%。100 でそのまま'},
  {
    key: 'eqAxis',
    label: '横軸の引き伸ばし',
    min: 0.3,
    max: 2,
    step: 0.05,
    hint: '1 で sRGB のまま。下げると暗部が広がる'
  },
  {key: 'padding', label: '左右の余白', min: 8, max: 64, step: 4, hint: 'px'}
]

/** CSS 変数の形にする。ControlPanel のルートに style として渡す */
export const layoutVars = (l: Layout) =>
  ({
    '--cell': `${l.cell}px`,
    '--gap-x': `${l.gapX}px`,
    '--gap-y': `${l.gapY}px`,
    '--cols': l.columns,
    '--marker-border': `${l.markerBorder}px`,
    '--marker-duration': `${l.markerDuration}ms`,
    '--progress-height': `${l.progressHeight}px`,
    '--morph-opacity': `${l.morphOpacity}%`,
    '--dwell-opacity': `${l.dwellOpacity}%`,
    '--idle-opacity': `${l.idleOpacity}%`,
    '--eq-height': `${l.eqHeight}px`,
    '--block-gap': `${l.blockGap}px`,
    '--panel-padding': `${l.padding}px`
  }) as CSSProperties

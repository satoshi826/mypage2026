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
  /** 棒の本数 */
  eqBars: number
  /** 棒の高さのカーブ。1 で素のまま、上げるほど低い棒が持ち上がる */
  eqCurve: number
  /** 棒が表す値。0 = 輝度の分布、1 = 横方向の最大輝度 */
  eqSource: number
  /** 飛行中の棒をどれだけ明るくするか。0 で濃さが一定 */
  eqMotion: number
  /** 棒グラフの横軸。1 で sRGB のまま、下げるほど暗部が広がる */
  eqAxis: number
  /** 基準線が表す割合 %。全画素のこの割合が1本の棒に入る高さに線を引く */
  eqLevel: number
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
  eqBars: 48,
  eqCurve: 1,
  eqSource: 0,
  eqMotion: 1,
  eqAxis: 1,
  eqLevel: 0,
  padding: 16
}

/** 写真の横にパネルを置く。横長の画面ではこちらが有利 */
export const SIDE_LAYOUT: Layout = {
  cell: 32,
  gapX: 16,
  gapY: 5,
  columns: 7,
  markerBorder: 1,
  markerDuration: 800,
  progressHeight: 1,
  morphOpacity: 30,
  dwellOpacity: 20,
  idleOpacity: 35,
  eqHeight: 108,
  eqBars: 48,
  eqCurve: 1,
  eqSource: 0,
  eqMotion: 1,
  eqAxis: 1,
  eqLevel: 0,
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
  {key: 'eqHeight', label: '棒グラフの高さ', min: 0, max: 240, step: 4, hint: 'px。0 で出さない'},
  {key: 'eqBars', label: '棒の本数', min: 8, max: 96, step: 1, hint: '本'},
  {
    key: 'eqCurve',
    label: '棒のカーブ',
    min: 0.3,
    max: 3,
    step: 0.05,
    hint: '1 で素のまま。上げるほど低い棒が持ち上がる'
  },
  {key: 'eqSource', label: '棒が表す値', min: 0, max: 1, step: 1, hint: '0 = 輝度の分布、1 = 横方向の最大輝度'},
  {key: 'eqMotion', label: '飛行中の明るさ', min: 0, max: 4, step: 0.1, hint: '0 で一定。上げると速い棒ほど明るくなる'},
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
    '--panel-padding': `${l.padding}px`
  }) as CSSProperties

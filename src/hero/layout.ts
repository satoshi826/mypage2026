import type {CSSProperties} from 'react'
import type {Param} from '../app/DevPanel'
import {SOURCE_H, SOURCE_W} from './table'

const ASPECT = SOURCE_W / SOURCE_H

/**
 * コントロールパネルの寸法。CSS 変数としてパネルのルートに書き込む。
 * 開発用パネルで詰めるあいだ変数にしているだけで、値が決まったら
 * ControlPanel の className に固定値として畳む。
 */
export type Layout = {
  /** マス（数字1つ）の一辺 px。縦並びでは「写真の幅 ÷ 列数」がこれを下回ればそちらを使う */
  cell: number
  /** マスの横方向の間隔 px */
  gapX: number
  /** マスの縦方向の間隔 px */
  gapY: number
  /** 列数。カレンダーの横幅はこれと cell / gapX から決まる */
  columns: number
  /** 選択中を囲む丸が、マスより何 px 大きいか */
  markerGrow: number
  /** 選択中を囲む丸の線の太さ px */
  markerBorder: number
  /** 丸の線の濃さ % */
  markerOpacity: number
  /** 数字の大きさ px。選択・非選択で変えない */
  fontSize: number
  /** 丸が隣のマスへ移る時間 ms */
  markerDuration: number
  /** 非選択のマスの不透明度 % */
  idleOpacity: number
  /** 画面の外周の余白 px。狭い画面ではここを削るとマスを大きくできる */
  padding: number
  /** 写真とパネルのあいだ px */
  photoGap: number
}

/** 写真とパネルの並べ方 */
export type Direction = 'stacked' | 'side'

/** 写真の下にパネルを置く。縦長の画面ではこちらが有利 */
export const STACKED_LAYOUT: Layout = {
  padding: 12,
  photoGap: 32,
  cell: 38,
  fontSize: 10.8,
  gapX: 4,
  gapY: 3,
  columns: 7,
  idleOpacity: 25,
  markerGrow: 0,
  markerBorder: 1,
  markerOpacity: 50,
  markerDuration: 1000
}

/** 写真の横にパネルを置く。横長の画面ではこちらが有利 */
export const SIDE_LAYOUT: Layout = {
  padding: 36,
  photoGap: 32,
  cell: 24,
  fontSize: 11,
  gapX: 12,
  gapY: 24,
  columns: 7,
  idleOpacity: 25,
  markerGrow: 11,
  markerBorder: 1,
  markerOpacity: 50,
  markerDuration: 1000
}

export const LAYOUT_PRESETS: Record<Direction, Layout> = {stacked: STACKED_LAYOUT, side: SIDE_LAYOUT}

/** ナビとフッターの高さの合計 px。並べ方を選ぶときだけ使う概算で、実寸は section の padding が持つ */
const BARS_HEIGHT = 52 + 52

export const panelWidth = (l: Layout) => l.columns * l.cell + (l.columns - 1) * l.gapX

/**
 * 縦並びの寸法。カレンダーは写真と同じ幅に広げるので、マスの一辺は写真の幅で決まる。
 * つまり必要な高さは写真の幅の一次式になり、収まる最大の幅を解ける。
 *
 *   必要な高さ = 幅/ASPECT + 間隔 + 行数×(幅 - 列間)/列数 + 行間
 *
 * ただしマスは cell を上限にする。タブレットの縦持ちでは「写真の幅 ÷ 7」が
 * 100px を超え、数字の並びとして成立しなくなるため。上限に達したあとは
 * パネルの高さが動かないので、写真の高さだけで決まる。
 */
export function fitStacked(content: {width: number; height: number}, l: Layout, count: number) {
  const rows = Math.ceil(count / l.columns)
  // 写真の幅に比例しない縦
  const fixed = l.photoGap + (rows - 1) * l.gapY
  // マスが上限に達している場合に写真へ残る高さ
  const room = content.height - fixed - rows * l.cell
  const solved =
    room * ASPECT >= panelWidth(l)
      ? room * ASPECT
      : (content.height - fixed + (rows * (l.columns - 1) * l.gapX) / l.columns) / (1 / ASPECT + rows / l.columns)
  // 切り上げると1px はみ出すので切り下げる
  const width = Math.max(0, Math.min(content.width, Math.floor(solved)))
  return {width, height: Math.floor(width / ASPECT)}
}

/**
 * 並べ方を決める。写真が大きくなるほうを選ぶ。
 *
 * しきい値を定数にしないのは、パネルの寸法を変えると分岐点も動くため。
 * 写真は 3:2 固定なので、幅で比べれば面積で比べたことになる。
 */
export function chooseDirection(width: number, height: number, count: number): Direction {
  const inner = (l: Layout) => ({width: width - l.padding * 2, height: height - BARS_HEIGHT - l.padding * 2})
  const stacked = fitStacked(inner(STACKED_LAYOUT), STACKED_LAYOUT, count).width
  const room = inner(SIDE_LAYOUT)
  const side = Math.min(room.width - panelWidth(SIDE_LAYOUT) - SIDE_LAYOUT.photoGap, room.height * ASPECT)
  return side > stacked ? 'side' : 'stacked'
}

export const LAYOUT_PARAMS: Param<Layout>[] = [
  {group: '配置', key: 'padding', label: '画面の外周の余白', min: 8, max: 64, step: 4, hint: 'px'},
  {group: '配置', key: 'photoGap', label: '写真とパネルの間隔', min: 0, max: 80, step: 4, hint: 'px'},

  {
    group: 'カレンダー',
    key: 'cell',
    label: 'マスの一辺（上限）',
    min: 20,
    max: 72,
    step: 1,
    hint: 'px。縦並びでは写真の幅÷列数が小さければそちら'
  },
  {group: 'カレンダー', key: 'fontSize', label: '数字の大きさ', min: 8, max: 24, step: 0.2, hint: 'px'},
  {group: 'カレンダー', key: 'gapX', label: 'マスの間隔（横）', min: 0, max: 32, step: 1, hint: 'px'},
  {group: 'カレンダー', key: 'gapY', label: 'マスの間隔（縦）', min: 0, max: 32, step: 1, hint: 'px'},
  {
    group: 'カレンダー',
    key: 'columns',
    label: '列数',
    min: 4,
    max: 20,
    step: 1,
    hint: '横幅はこれと一辺・間隔で決まる'
  },
  {group: 'カレンダー', key: 'idleOpacity', label: '非選択の濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {
    group: 'カレンダー',
    key: 'markerGrow',
    label: '丸の大きさ',
    min: 0,
    max: 20,
    step: 1,
    hint: 'px。マスより何px大きいか'
  },
  {group: 'カレンダー', key: 'markerBorder', label: '丸の線の太さ', min: 1, max: 4, step: 1, hint: 'px'},
  {group: 'カレンダー', key: 'markerOpacity', label: '丸の線の濃さ', min: 0, max: 100, step: 5, hint: '%'},
  {
    group: 'カレンダー',
    key: 'markerDuration',
    label: '丸の移動時間',
    min: 0,
    max: 1200,
    step: 50,
    hint: 'ms。0 で瞬間移動'
  }
]

/** CSS 変数の形にする。ControlPanel のルートに style として渡す */
export const layoutVars = (l: Layout) =>
  ({
    '--gap-x': `${l.gapX}px`,
    '--gap-y': `${l.gapY}px`,
    '--cols': l.columns,
    '--marker-border': `${l.markerBorder}px`,
    '--marker-line': `color-mix(in srgb, var(--color-ink) ${l.markerOpacity}%, transparent)`,
    '--number-size': `${l.fontSize}px`,
    '--marker-duration': `${l.markerDuration}ms`,
    '--idle-opacity': `${l.idleOpacity}%`
  }) as CSSProperties

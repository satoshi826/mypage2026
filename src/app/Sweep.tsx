import type {ComponentChildren} from 'preact'
import {useEffect, useRef} from 'preact/hooks'
import {DevPanel} from './DevPanel'
import {DEFAULT_SWEEP, SWEEP_PARAMS, setSweepLook, watchSweep, type SweepKind} from './sweepReveal'

/** 画面に入ったら現す要素の ref。kind は現し方（sweepReveal.ts） */
function useSweep<T extends HTMLElement>(kind: SweepKind) {
  const ref = useRef<T>(null)
  // 隠して現すのは描いた最初の 1 回だけ
  useEffect(() => watchSweep(ref.current!, kind), [kind])
  return ref
}

/**
 * 文字のまとまりを、画面に入ったら現す（左から右へ光りながら現れる）。文字は内側の要素（data-sweep-body）で包み、
 * そこにマスクをかける。光は外側にかけるので、マスクに切られない（styles.css）。内側は文字の長さの幅にして
 * （inline-block）、マスクが文字の無いところを通る時間をなくす。上にそろえて、行の高さを変えない
 */
export function Sweep({
  as = 'span',
  className,
  children
}: {
  as?: 'span' | 'p' | 'h1' | 'h2' | 'dt' | 'dd'
  className?: string
  children: ComponentChildren
}) {
  // 要素の種類は as で替わる。型は同じ扱いでよい（ref で読むのは位置だけ）
  const Tag = as as 'span'
  const ref = useSweep<HTMLSpanElement>('text')
  return (
    <Tag ref={ref} className={className}>
      <span data-sweep-body className="inline-block max-w-full align-top">
        {children}
      </span>
    </Tag>
  )
}

/**
 * 線を、画面に入ったら左から右へ引くように現す。区切りの線は中身なしで線そのものとして置き、入力欄やボタンは
 * 包んで、枠ごと左から切り抜きを広げて現す
 */
export function Draw({className, children}: {className?: string; children?: ComponentChildren}) {
  const ref = useSweep<HTMLDivElement>('draw')
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** 見せ方を詰める開発用パネル。開発中だけ描かれる */
export function SweepPanel() {
  return (
    <DevPanel
      site
      title="文字と線の現れ方"
      typeName="SweepLook"
      constName="DEFAULT_SWEEP"
      params={SWEEP_PARAMS}
      defaults={DEFAULT_SWEEP}
      storageKey="mypage2026.sweep"
      onChange={setSweepLook}
    />
  )
}

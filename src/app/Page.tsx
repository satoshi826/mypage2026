import type {ComponentChildren} from 'preact'
import {Sweep} from './Sweep'

/**
 * hero 以外のページの外枠。余白と地の文の体裁をここに集約する。下の余白は、固定のフッターとホームインジケータ
 * （safe area）の下に隠れる分を足してから取る。
 * 見出しと本文は Heading / Text を使う（各ページに utility を撒かないため）。文字は画面に入ったら光の幕が通り過ぎるように現れる（Sweep）。
 */
export function Page({title, children}: {title: string; children: ComponentChildren}) {
  return (
    <div className="mx-auto min-h-[100svh] max-w-5xl px-8 pt-[calc(var(--spacing-nav)+3.5rem)] pb-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+4rem)]">
      <Sweep as="h1" className="mb-8 text-[1.75rem] tracking-[0.05em]">
        {title}
      </Sweep>
      {children}
    </div>
  )
}

export function Heading({children}: {children: ComponentChildren}) {
  return (
    <Sweep as="h2" className="mt-12 mb-4 text-base font-normal tracking-[0.1em] opacity-55">
      {children}
    </Sweep>
  )
}

export function Text({children}: {children: ComponentChildren}) {
  return (
    <Sweep as="p" className="mb-4 max-w-2xl">
      {children}
    </Sweep>
  )
}

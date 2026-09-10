import type {ReactNode} from 'react'

/**
 * hero 以外のページの外枠。余白と地の文の体裁をここに集約する。
 * 見出しと本文は Heading / Text を使う（各ページに utility を撒かないため）。
 */
export function Page({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="mx-auto min-h-[100svh] max-w-5xl px-8 pt-32 pb-24">
      <h1 className="mb-8 text-[1.75rem] font-normal tracking-[0.05em]">{title}</h1>
      {children}
    </div>
  )
}

export function Heading({children}: {children: ReactNode}) {
  return <h2 className="mt-12 mb-4 text-base font-normal tracking-[0.1em] opacity-55">{children}</h2>
}

export function Text({children}: {children: ReactNode}) {
  return <p className="mb-4 max-w-2xl">{children}</p>
}

import type {CSSProperties, ReactNode} from 'react'
import {progressLine, usePlayer} from './playback'

/** プログレスの未通過部分の濃さ %。遷移帯ぶんと静止帯ぶん。通過した部分は 100% */
const MORPH_OPACITY = 30
const DWELL_OPACITY = 16

/**
 * フッターの左に置く hero の再生操作と、次の写真までのプログレス。
 * 状態と操作は Hero が playback.ts に出したものを使う。hero がまだ無いあいだは何も描かず、
 * hero が画面外にあるあいだ（時計が止まっている）は隠す。
 */
export function HeroPlayer() {
  const player = usePlayer()
  if (!player) return null
  return (
    <div
      role="group"
      aria-label="再生操作"
      aria-hidden={!player.visible}
      className={`flex items-center gap-6 transition-opacity duration-700 ${player.visible ? '' : 'pointer-events-none opacity-0'}`}
    >
      <Transport label="Previous" onClick={player.prev}>
        <path d="M7 5h2v14H7zM19 5 10 12l9 7z" />
      </Transport>
      <Transport label={player.autoplay ? 'Pause' : 'Play'} onClick={player.toggle} size="size-5">
        {player.autoplay ? <path d="M8 5h3v14H8zM14 5h3v14h-3z" /> : <path d="M8 5 19 12 8 19z" />}
      </Transport>
      <Transport label="Next" onClick={player.next}>
        <path d="M5 5 14 12 5 19zM15 5h2v14h-2z" />
      </Transport>
      {/* 次の遷移までのプログレス。前の遷移の開始で 0、次の遷移の開始で 1。通過した部分は
          白一色にして、まだ通過していない部分を遷移ぶんと静止帯ぶんで塗り分け、どの地点で
          止まるかが先に見えるようにする。
          狭い画面ではフッターの上の線に重ね、広い画面では再生操作の後ろに長さを決めて置く。
          全幅の線だと、広い画面では進みが速すぎて落ち着かないため */}
      <div
        ref={progressLine}
        aria-hidden
        className="absolute inset-x-0 -top-px flex h-px sm:relative sm:inset-auto sm:top-auto sm:w-40"
        style={{'--morph-opacity': `${MORPH_OPACITY}%`, '--dwell-opacity': `${DWELL_OPACITY}%`} as CSSProperties}
      >
        <div className="shrink-0 bg-ink [opacity:var(--morph-opacity)] [width:var(--morph)]" />
        <div className="flex-1 bg-ink [opacity:var(--dwell-opacity)]" />
        <div
          className="absolute inset-0 bg-ink"
          style={{clipPath: 'inset(0 calc((1 - var(--progress, 0)) * 100%) 0 0)'}}
        />
      </div>
      {/* モードであるシャッフルは最後に置く */}
      <Transport label="Shuffle" onClick={player.toggleShuffle} pressed={player.shuffle}>
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h4l10 12h4M3 18h4l10-12h4" />
          <path d="M18 3l3 3-3 3M18 15l3 3-3 3" />
        </g>
      </Transport>
    </div>
  )
}

/** 再生操作の1ボタン。`pressed` を渡したときだけ入り切りのあるモードとして扱う */
function Transport({
  label,
  onClick,
  pressed,
  size = 'size-4',
  className = '',
  children
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  size?: string
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      // before は指の当たり判定。配置を変えずに 44px を確保する
      className={`relative flex cursor-pointer transition-opacity duration-300 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:opacity-60 ${className} ${
        pressed === false ? 'opacity-35' : ''
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={`${size} fill-current`}>
        {children}
      </svg>
    </button>
  )
}

import {useEffect, useRef} from 'preact/hooks'
import {type ComponentChildren} from 'preact'
import {progressLines, usePlayer} from './playback'
import {GLOW_HOVER, GLOW_SELECTED} from '../app/glow'

/**
 * フッターの左に置く hero の再生操作と、次の写真までのプログレス。
 * 状態と操作は Hero が playback.ts に出したものを使う。hero がまだ無いあいだは何も描かず、
 * hero の写真の 6 割が隠れたら（読み進めているあいだは）隠す。
 */
export function HeroPlayer() {
  const player = usePlayer()
  if (!player) return null
  return (
    <div
      role="group"
      aria-label="再生操作"
      aria-hidden={!player.visible}
      className={`flex items-center gap-6 transition-opacity duration-700 max-sm:gap-4 ${player.visible ? '' : 'pointer-events-none opacity-0'}`}
    >
      <Transport label={player.autoplay ? 'Pause' : 'Play'} onClick={player.toggle} size="size-5">
        {player.autoplay ? <path d="M8 5h3v14H8zM14 5h3v14h-3z" /> : <path d="M8 5 19 12 8 19z" />}
      </Transport>
      <HeroProgress />
    </div>
  )
}

/**
 * 次の遷移までのプログレス。前の遷移の開始で 0、次の遷移の開始で 1。通過した部分は白一色にして、
 * まだ通過していない部分を遷移ぶんと静止帯ぶんで塗り分け、どの地点で止まるかが先に見えるようにする。
 *
 * 再生操作の後ろに長さを決めて置く（全幅だと進みが速すぎて落ち着かないため）。狭い画面では短くする
 */
function HeroProgress() {
  const ref = useRef<HTMLDivElement>(null)
  // 再生操作と一緒に描かれる（hero が出てから）ので、描かれたときに登録する
  useEffect(() => {
    const el = ref.current!
    progressLines.add(el)
    return () => {
      progressLines.delete(el)
    }
  }, [])
  return (
    <div ref={ref} aria-hidden className="relative flex h-px w-64 max-sm:w-40">
      {/* 未通過部分の濃さ。遷移帯ぶん 30%、静止帯ぶん 16%。通過した部分は 100% */}
      <div className="shrink-0 bg-ink opacity-30 [width:var(--morph)]" />
      <div className="flex-1 bg-ink opacity-16" />
      {/* 通過した部分は、今の位置を示す線として光らせる。右端は今の位置で切るので、切り口が目立たないよう近い層だけにし、
          切り抜きは上下と左に光のぶんの余白を残す */}
      <div
        className={`glow-line glow-near absolute inset-0 bg-ink ${GLOW_SELECTED}`}
        style={{clipPath: 'inset(-8px calc((1 - var(--progress, 0)) * 100%) -8px -8px)'}}
      />
    </div>
  )
}

/** 再生操作の1ボタン */
function Transport({
  label,
  onClick,
  size = 'size-4',
  children
}: {
  label: string
  onClick: () => void
  size?: string
  children: ComponentChildren
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // before は指の当たり判定。配置を変えずに 44px を確保する
      className={`glow-mark relative flex cursor-pointer transition-[filter] duration-300 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] ${GLOW_HOVER}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={`${size} fill-current`}>
        {children}
      </svg>
    </button>
  )
}

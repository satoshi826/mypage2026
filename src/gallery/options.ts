import {useEffect, useState} from 'react'

/**
 * Photos の現れ方と見せ方の候補。仮決定は wipe と masonry（2026-10-01）。
 * 比べる余地を残すため候補と切り替えは残してある。確定したら1つに絞って消す。
 */
export const REVEAL_VARIANTS = ['fade', 'blur', 'wipe', 'bloom', 'scale', 'none'] as const
export type RevealVariant = (typeof REVEAL_VARIANTS)[number]

/** 見せ方。それぞれの形は layouts.tsx の各コンポーネントに書いてある */
export const LAYOUTS = ['column', 'alternate', 'grid2', 'grid3', 'masonry', 'full', 'scatter', 'twopane'] as const
export type Layout = (typeof LAYOUTS)[number]

/** 候補から1つ選ぶ状態。localStorage に残すのでリロードしても消えない */
export function useChoice<T extends string>(key: string, options: readonly T[], initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved && (options as readonly string[]).includes(saved)) return saved as T
    } catch {
      // 読めなければ既定値
    }
    return initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 保存できなくても動作には影響しない
    }
  }, [key, value])
  return [value, setValue] as const
}

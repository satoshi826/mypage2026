// 操作を出している写真（Tools.tsx）。マウスの端末は載せている写真にも出す。指の端末は触った写真にだけ出す

let current: string | null = null
const listeners = new Set<() => void>()

export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const selected = () => current

export function select(file: string | null) {
  current = file
  for (const listener of listeners) listener()
}

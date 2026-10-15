// トップの hero のパネル（HeroPanel.tsx）を開いているか。操作バーの「hero を編集」で開く

let open = false
const listeners = new Set<() => void>()

export const subscribePanel = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const isPanelOpen = () => open

export function setPanelOpen(next: boolean) {
  open = next
  for (const listener of listeners) listener()
}

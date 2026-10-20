/**
 * サイトのロゴ。白い面に、下から 2 本（m の山の内側）、上から 1 本（u の谷）の切り込みを入れたもの。
 * 横を 12 等分した格子で組む（柱 2・切れ目 1・溝 2）。この 24 × 22 は格子 1 つが 2px にあたり、
 * 線が画素にそろう。ファビコン（public/favicon.svg）も同じ形
 */
export function Logo({className = ''}: {className?: string}) {
  return (
    <svg viewBox="0 0 24 22" width="24" height="22" aria-hidden className={className}>
      <path d="M0 0H16V18H20V0H24V22H12V4H10V22H6V4H4V22H0Z" fill="currentColor" />
    </svg>
  )
}

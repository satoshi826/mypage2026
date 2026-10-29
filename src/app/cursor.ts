import {isEditing} from './editing'

// マウスのカーソル。ふだんは小さな丸（線）で、リンクやボタンの上では上向きの正三角形（線）に、スライダーの上
// では左右に動かせることを示す横長の塗りに、つかんで動かせる物（data-grab。トップのロゴ）の上では縦横に動かせることを
// 示す小さな四角の塗りに（つかんでいるあいだは縮む）、Photos の写真の上ではカメラのピントを合わせる枠（四隅だけ）になる。
// 広げた写真の上では、四隅を中心へ向けた「小さくする」形になる。
// hero の上は粒子で遊ぶ場所なので丸のまま。
// 見た目は styles.css の #cursor。
// マウスのある環境だけで動かす（指で触る端末では何もしない）。入力欄の上と、サイトの上での編集中は
// OS のカーソルに戻す（文字を打つ・写真をつかむカーソルが要るため）。

/** 状態ごとの大きさ px */
const SIZES = {
  idle: [16, 16],
  // 正三角形（高さは幅の √3/2 ≈ 0.87）
  link: [12, 10],
  slider: [14, 6],
  grab: [10, 10],
  grabbing: [6, 6],
  photo: [28, 28],
  'photo-out': [28, 28]
} as const

const LINK_TARGET = 'a, button:not(:disabled), [role="button"], summary'
const SLIDER_TARGET = 'input[type="range"]'
const GRAB_TARGET = '[data-grab]'
const PHOTO_TARGET = 'figure[data-file]:not([data-still])'
const TEXT = 'input:not([type="range"]), textarea, select, [contenteditable]'

export function startCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return

  const root = document.documentElement
  const cursor = document.createElement('div')
  cursor.id = 'cursor'
  cursor.setAttribute('aria-hidden', 'true')
  document.body.append(cursor)

  let x = 0
  let y = 0
  let over: Element | null = null
  /** つかんでドラッグしているスライダーかつかめる物。指が外れても、離すまで同じ形のままにする */
  let dragging: Element | null = null
  let frame = 0

  const update = () => {
    frame = 0
    root.classList.toggle('custom-cursor', !isEditing())
    cursor.style.opacity = isEditing() || !over || over.closest(TEXT) ? '0' : '1'

    const state = dragging?.matches(GRAB_TARGET)
      ? 'grabbing'
      : dragging || over?.closest(SLIDER_TARGET)
        ? 'slider'
        : over?.closest(GRAB_TARGET)
          ? 'grab'
          : over?.closest(LINK_TARGET)
            ? 'link'
            : over?.closest(PHOTO_TARGET)
              ? over.closest('[data-expanded]')
                ? 'photo-out'
                : 'photo'
              : 'idle'
    const [width, height] = SIZES[state]
    cursor.dataset.state = state
    cursor.style.width = `${width}px`
    cursor.style.height = `${height}px`
    // 1px の線が画素の境目にかかってにじまないよう、整数にそろえる
    cursor.style.transform = `translate(${Math.round(x - width / 2)}px, ${Math.round(y - height / 2)}px)`
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }

  addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    x = event.clientX
    y = event.clientY
    over = event.target as Element
    schedule()
  })
  addEventListener('pointerdown', (event) => {
    dragging = (event.target as Element).closest(`${SLIDER_TARGET}, ${GRAB_TARGET}`)
  })
  addEventListener('pointerup', () => {
    dragging = null
    schedule()
  })
  // スクロールで下の要素が入れ替わったら、止まったところで測り直す。スクロール中に毎フレーム測ると、
  // 要素の当たり判定でスクロールが重くなるので、止まるまで待つ
  addEventListener(
    'scrollend',
    () => {
      if (!over) return
      over = document.elementFromPoint(x, y)
      schedule()
    },
    {passive: true}
  )
  // 画面の外へ出たら隠す
  root.addEventListener('pointerleave', () => {
    over = null
    schedule()
  })
}

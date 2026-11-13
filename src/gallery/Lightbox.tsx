import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks'
import type {Ref} from 'preact'
import {DevPanel} from '../app/DevPanel'
import {useExternal} from '../app/useExternal'
import {pickSource, type Photo} from '../photos'
import {boxOf, getOpened, lightboxSource, look, setLook, setOpened, subscribe, type Box, type Opened} from './lifted'
import {DEFAULT_LIGHTBOX, EASINGS, LIGHTBOX_PARAMS} from './tuning'

// 一覧の写真を押したときに、画面の中央へ重ねて見せる（Works）。押した写真が一覧の位置から形を保ったまま
// 中央へ移り、閉じると同じ道筋で一覧の位置へ戻る（docs/design.md の連続性）。一覧の元の位置は空けておき、
// 写真がそこから持ち上がったように見せる。
//
// - 開いているあいだはページをスクロールさせない。戻る先の一覧の位置を動かさないため
// - 押す・背景を押す・Esc で閉じる。左右の矢印キーで同じ一覧の前後の写真へ替える（溶け合う）
// - 最初は一覧に出ていた画像をそのまま引き伸ばし、拡大用の画像が届いたら上に溶け込ませる

/** 一覧の中の写真の要素 */
const figureOf = (file: string) => document.querySelector<HTMLElement>(`figure[data-file="${CSS.escape(file)}"]`)

/**
 * 一覧の写真から、中央の写真へ動かすときの始まりの形。一覧で見えている枠の位置と大きさへ縮め、
 * マウスを載せたズームで枠からはみ出していた分は切り抜く（clip-path は縮める前の大きさで効く）
 */
function liftedFrom(file: string, box: Box): Keyframe | null {
  const figure = figureOf(file)
  if (!figure) return null
  const rect = figure.getBoundingClientRect()
  const img = figure.querySelector('img')
  const zoom = img ? Number(getComputedStyle(img).scale) || 1 : 1
  const width = rect.width * zoom
  const left = rect.left - (rect.width * (zoom - 1)) / 2
  const top = rect.top - (rect.height * (zoom - 1)) / 2
  const inset = ((1 - 1 / zoom) / 2) * 100
  return {
    transform: `translate(${left - box.left}px, ${top - box.top}px) scale(${width / box.width})`,
    clipPath: `inset(${inset}%)`
  }
}

/** 一覧のどの段の画像を、中央の写真の最初の画像に使うか。一覧に出ているものがあればそれ */
function shownSource(photo: Photo) {
  const img = figureOf(photo.file)?.querySelector('img')
  return img?.currentSrc || pickSource(photo, 400, false).src
}

/** 開いているあいだに読み流すキー。矢印キー以外のスクロールのキーは止める */
const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'])

/** 一覧を持つページに 1 つ置く。開いていないあいだは何も描かない */
export function Lightbox() {
  const current = useExternal(subscribe, getOpened, null)
  // ページを離れたら閉じる。持ち上げた写真が次のページの一覧で隠れたままにならないように
  useEffect(() => () => setOpened(null), [])
  return (
    <>
      {import.meta.env.DEV && (
        <DevPanel
          title="Works の拡大"
          typeName="LightboxLook"
          constName="DEFAULT_LIGHTBOX"
          params={LIGHTBOX_PARAMS}
          defaults={DEFAULT_LIGHTBOX}
          storageKey="mypage2026.lightbox"
          onChange={setLook}
        />
      )}
      {current && <Overlay opened={current} />}
    </>
  )
}

function Overlay({opened: {photos, file, label}}: {opened: Opened}) {
  const index = Math.max(
    0,
    photos.findIndex((photo) => photo.file === file)
  )
  const photo = photos[index]
  const backdrop = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  // 開く動き。閉じるときに動いている最中なら、その場から逆にたどる
  const opening = useRef<Animation[]>([])
  const closing = useRef(false)
  // 前後の写真へ替えたとき、溶けて消えていく前の写真
  const [leaving, setLeaving] = useState<{photo: Photo; base: string} | null>(null)
  const leavingFrame = useRef<HTMLDivElement>(null)
  const [base, setBase] = useState(() => shownSource(photo))
  const [, setSize] = useState(0)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const timing = (seconds: number): KeyframeAnimationOptions => ({
    duration: still ? 0 : seconds * 1000,
    easing: EASINGS[look.easing].css,
    fill: 'both'
  })

  // 開く。一覧の位置から中央へ
  useLayoutEffect(() => {
    const from = liftedFrom(file, boxOf(photo))
    opening.current = [
      backdrop.current!.animate([{opacity: 0}, {opacity: 1}], timing(look.seconds)),
      ...(from
        ? [frame.current!.animate([from, {transform: 'none', clipPath: 'inset(0%)'}], timing(look.seconds))]
        : [])
    ]
    // 開いたときの 1 回だけ。前後の写真へ替えたときは溶け合わせる（下）
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    if (closing.current) return
    closing.current = true
    const running = opening.current.some((animation) => animation.playState === 'running')
    let animations: Animation[]
    if (running) {
      // 開いている途中なら、来た道をその場から戻る
      for (const animation of opening.current) animation.reverse()
      animations = opening.current
    } else {
      const to = liftedFrom(file, boxOf(photo))
      animations = [
        backdrop.current!.animate([{opacity: 1}, {opacity: 0}], timing(look.seconds)),
        ...(to ? [frame.current!.animate([{transform: 'none', clipPath: 'inset(0%)'}, to], timing(look.seconds))] : [])
      ]
    }
    void Promise.all(animations.map((animation) => animation.finished)).then(() => setOpened(null))
  }

  const step = (by: -1 | 1) => {
    const next = photos[index + by]
    if (!next || closing.current || opening.current.some((animation) => animation.playState === 'running')) return
    setLeaving({photo, base})
    setBase(shownSource(next))
    setOpened({photos, file: next.file, label})
  }

  // 前後の写真へ替えたとき、新しい写真を溶け込ませ、前の写真を溶かして消す
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const fade = {...timing(look.fadeSeconds), easing: 'linear'}
    frame.current!.animate([{opacity: 0}, {opacity: 1}], fade)
    leavingFrame.current?.animate([{opacity: 1}, {opacity: 0}], fade)
    const timer = setTimeout(() => setLeaving(null), fade.duration as number)
    return () => clearTimeout(timer)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // 閉じるキー、替えるキー。開いているあいだは、ほかのキーでもスクロールさせない
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else if (!SCROLL_KEYS.has(event.key)) return
      event.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // 画面の大きさが変わったら置き直す
  useEffect(() => {
    const onResize = () => setSize(innerWidth * 10000 + innerHeight)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} photograph ${index + 1}`}
      className="fixed inset-0 z-30 touch-none"
      onClick={close}
      // ページの慣性スクロール（useSmoothScroll）まで届かせない
      onWheel={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        ref={backdrop}
        className="absolute inset-0"
        style={{opacity: 0, background: `color-mix(in srgb, var(--color-ground) ${look.dim * 100}%, transparent)`}}
      />
      {leaving && (
        <Frame key={leaving.photo.file} frameRef={leavingFrame} photo={leaving.photo} base={leaving.base} alt="" />
      )}
      <Frame key={file} frameRef={frame} photo={photo} base={base} alt={`${label} photograph ${index + 1}`} />
    </div>
  )
}

/** 中央の写真。最初は一覧の画像（base）を見せ、拡大用の画像が届いたら上に溶け込ませる */
function Frame({photo, base, alt, frameRef}: {photo: Photo; base: string; alt: string; frameRef: Ref<HTMLDivElement>}) {
  const box = boxOf(photo)
  const large = lightboxSource(photo)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const loader = new Image()
    loader.src = large
    loader
      .decode()
      .catch(() => {})
      .then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [large])
  const fade = `opacity ${look.fadeSeconds}s linear`
  return (
    <div
      ref={frameRef}
      // マウスのカーソル（src/app/cursor.ts）が「小さくする」形になる
      data-lightbox
      className="fixed origin-top-left"
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`
      }}
    >
      <img src={base} alt={alt} draggable={false} className="absolute inset-0 block h-full w-full" />
      <img
        src={large}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 block h-full w-full"
        style={{opacity: ready ? 1 : 0, transition: fade}}
      />
    </div>
  )
}

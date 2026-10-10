import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {matchRoute, useLocation, useRouter} from 'wouter'
import type {Param} from './DevPanel'
import {resetScroll} from './useSmoothScroll'
import {EASINGS, type Easing} from '../gallery/tuning'

/*
 * ページの移動。URL（実際の場所）と、画面に出している中身（表示中の場所）を分けて持つ。
 * 移動すると URL はすぐ変わり、ナビの下線はすぐ滑り始める。中身は
 *   消える（今のページ）→ 見えないあいだに差し替えて先頭へ戻す → 現れる（次のページ）
 * の順に入れ替える。先頭への跳びは中身が見えていないあいだに済むので見えない（docs/design.md の連続性）。
 *
 * 動かすのは 2 組で、演出を別々に選べる。
 * - ページの中身: [data-page]（main）
 * - フッターの操作: [data-page-footer]（フッターの左側、Photos のスクロールの線）
 * 差し替えは 1 回なので、両方が消えきるのを待ってから差し替え、それぞれの設定で現れる。
 * Photos のカテゴリの切り替えでは、フッターは残す（カテゴリの下線が滑り、スクロールの線も続く）。
 *
 * 演出は開発用パネル（PageTransition.tsx）で切り替えて詰める。決まったら既定値に書き戻す。
 */

/** ページの中身の演出 */
export const VARIANTS = ['sink-rise', 'fade', 'blur', 'exposure', 'breathe', 'stagger', 'wipe', 'none'] as const
export type Variant = (typeof VARIANTS)[number]

/** フッターの操作の演出 */
export const FOOTER_VARIANTS = ['fade', 'sink', 'lift', 'slide', 'blur', 'clip', 'none'] as const
export type FooterVariant = (typeof FOOTER_VARIANTS)[number]

export type PageMotion = {
  variant: Variant
  /** 消える秒数 */
  exitSeconds: number
  /** 消えきってから現れ始めるまでの秒数 */
  pauseSeconds: number
  /** 現れる秒数 */
  enterSeconds: number
  /** 現れるときのイージング（ページとフッターに共通）。消えるときは加速する曲線で固定 */
  enterEasing: Easing
  /** 沈む・浮かぶ距離 px（sink-rise、stagger） */
  distance: number
  /** ぼけの量 px（blur。フッターの blur にも使う） */
  blur: number
  /** ブロックごとの時間差 秒（stagger） */
  stagger: number
  /** Photos のカテゴリの切り替えも中身が消えて現れるか。no なら一瞬で入れ替える。フッターはどちらでも残す */
  categories: 'yes' | 'no'
  footerVariant: FooterVariant
  /** フッターが消える秒数 */
  footerExitSeconds: number
  /** 差し替えてからフッターが現れ始めるまでの秒数 */
  footerDelay: number
  /** フッターが現れる秒数 */
  footerEnterSeconds: number
  /** フッターが動く距離 px（sink / lift / slide） */
  footerDistance: number
}

export const DEFAULT_PAGE_MOTION: PageMotion = {
  variant: 'stagger',
  exitSeconds: 0.35,
  pauseSeconds: 0.05,
  enterSeconds: 0.9,
  enterEasing: 'easeOutQuint',
  distance: 16,
  blur: 8,
  stagger: 0.06,
  categories: 'yes',
  footerVariant: 'blur',
  footerExitSeconds: 0.3,
  footerDelay: 0.15,
  footerEnterSeconds: 0.8,
  footerDistance: 8
}

const FOOTER = 'フッター'

export const PAGE_MOTION_PARAMS: Param<PageMotion>[] = [
  {key: 'variant', label: '演出', options: VARIANTS, hint: 'ページの中身の消え方と現れ方'},
  {key: 'exitSeconds', label: '消える', min: 0.05, max: 1.5, step: 0.05, hint: '秒'},
  {key: 'pauseSeconds', label: '間', min: 0, max: 1, step: 0.05, hint: '秒。消えてから現れるまで'},
  {key: 'enterSeconds', label: '現れる', min: 0.1, max: 2.5, step: 0.05, hint: '秒'},
  {key: 'enterEasing', label: '現れ方の曲線', options: Object.keys(EASINGS), hint: 'ページとフッターに共通'},
  {key: 'distance', label: '距離', min: 0, max: 64, step: 2, hint: 'px。sink-rise / stagger'},
  {key: 'blur', label: 'ぼけ', min: 0, max: 24, step: 1, hint: 'px。blur（フッターの blur にも）'},
  {key: 'stagger', label: '時間差', min: 0, max: 0.3, step: 0.01, hint: '秒。stagger のブロックごと'},
  {
    key: 'categories',
    label: 'カテゴリ切替も',
    options: ['yes', 'no'],
    hint: 'Photos のカテゴリの切り替えも中身が消えて現れるか'
  },
  {
    group: FOOTER,
    key: 'footerVariant',
    label: '演出',
    options: FOOTER_VARIANTS,
    hint: 'フッターの操作の消え方と現れ方'
  },
  {group: FOOTER, key: 'footerExitSeconds', label: '消える', min: 0.05, max: 1.5, step: 0.05, hint: '秒'},
  {
    group: FOOTER,
    key: 'footerDelay',
    label: '遅れ',
    min: 0,
    max: 1.5,
    step: 0.05,
    hint: '秒。差し替えてから現れ始めるまで'
  },
  {group: FOOTER, key: 'footerEnterSeconds', label: '現れる', min: 0.1, max: 2.5, step: 0.05, hint: '秒'},
  {group: FOOTER, key: 'footerDistance', label: '距離', min: 0, max: 40, step: 1, hint: 'px。sink / lift / slide'}
]

/** 消えるときの曲線。だんだん速く引いていく（easeInCubic） */
const EXIT_EASING = 'cubic-bezier(0.32, 0, 0.67, 0)'

type Frames = {exit: [Keyframe, Keyframe]; enter: [Keyframe, Keyframe]}

/** ページの中身の、消える・現れるときの始まりと終わり。wipe は中身ではなく幕を動かすので別扱い */
function pageFrames(m: PageMotion): Frames {
  const shown = {opacity: 1, transform: 'none', filter: 'none'}
  switch (m.variant) {
    case 'fade':
      return {exit: [{opacity: 1}, {opacity: 0}], enter: [{opacity: 0}, {opacity: 1}]}
    case 'blur':
      return {
        exit: [shown, {opacity: 0, transform: 'none', filter: `blur(${m.blur}px)`}],
        enter: [{opacity: 0, transform: 'none', filter: `blur(${m.blur}px)`}, shown]
      }
    case 'exposure':
      // 消えるときは暗く落ち、現れるときは明るく飛んだところから適正に戻る
      return {
        exit: [shown, {opacity: 0, transform: 'none', filter: 'brightness(0.2)'}],
        enter: [{opacity: 0, transform: 'none', filter: 'brightness(3)'}, shown]
      }
    case 'breathe':
      return {
        exit: [shown, {opacity: 0, transform: 'scale(0.985)', filter: 'none'}],
        enter: [{opacity: 0, transform: 'scale(1.015)', filter: 'none'}, shown]
      }
    case 'sink-rise':
    case 'stagger':
    default:
      // 沈みながら引き、浮かび上がりながら現れる（docs/design.md の心地よさ）
      return {
        exit: [shown, {opacity: 0, transform: `translateY(${m.distance / 2}px)`, filter: 'none'}],
        enter: [{opacity: 0, transform: `translateY(${m.distance}px)`, filter: 'none'}, shown]
      }
  }
}

/** フッターの操作の、消える・現れるときの始まりと終わり */
function footerFrames(m: PageMotion): Frames {
  const d = m.footerDistance
  const shown = {opacity: 1, transform: 'none', filter: 'none', clipPath: 'inset(0 0 0 0)'}
  const at = (frame: Partial<typeof shown>) => ({...shown, opacity: 0, ...frame})
  switch (m.footerVariant) {
    case 'sink':
      // バーの下辺を出入りする
      return {
        exit: [shown, at({transform: `translateY(${d}px)`})],
        enter: [at({transform: `translateY(${d}px)`}), shown]
      }
    case 'lift':
      // 上へ抜けて、下から入ってくる。上向きの一方通行
      return {
        exit: [shown, at({transform: `translateY(${-d}px)`})],
        enter: [at({transform: `translateY(${d}px)`}), shown]
      }
    case 'slide':
      // 左へ抜けて、右から入ってくる。横向きの一方通行
      return {
        exit: [shown, at({transform: `translateX(${-d}px)`})],
        enter: [at({transform: `translateX(${d}px)`}), shown]
      }
    case 'blur':
      return {exit: [shown, at({filter: `blur(${m.blur}px)`})], enter: [at({filter: `blur(${m.blur}px)`}), shown]}
    case 'clip':
      // 左から右へ削れて消え、左から右へ描かれて現れる。濃さは変えない
      return {
        exit: [shown, {...shown, clipPath: 'inset(0 0 0 100%)'}],
        enter: [{...shown, clipPath: 'inset(0 100% 0 0)'}, shown]
      }
    case 'fade':
    case 'none':
    default:
      return {exit: [{opacity: 1}, {opacity: 0}], enter: [{opacity: 0}, {opacity: 1}]}
  }
}

/** ページの中身の動かす要素。stagger では main の中身をブロックごとに分ける */
function pageTargets(m: PageMotion): HTMLElement[] {
  const all = [...document.querySelectorAll<HTMLElement>('[data-page]')]
  if (m.variant !== 'stagger') return all
  return all.flatMap((el) => {
    // main → ページの外枠 → ブロック（見出し、段落、節、一覧）
    const blocks = [...el.children].flatMap((page) => [...page.children]) as HTMLElement[]
    return blocks.length > 0 ? blocks : [el]
  })
}

const footerTargets = () => [...document.querySelectorAll<HTMLElement>('[data-page-footer]')]

/** 同じページの中の移動か（Photos のカテゴリの切り替え） */
const samePage = (parser: Parameters<typeof matchRoute>[0], a: string, b: string) =>
  matchRoute(parser, '/photos/:category?', a)[0] && matchRoute(parser, '/photos/:category?', b)[0]

/**
 * 表示中の場所を返す。App はこれで中身（Switch とフッター）を描き、ナビだけ実際の URL を使う
 */
export function usePageTransition(motion: PageMotion) {
  const [location] = useLocation()
  const {parser} = useRouter()
  const [displayed, setDisplayed] = useState(location)
  // 入れ替えの回数。消えている途中で元の場所へ戻ったときも、現れる処理を必ず走らせるため
  const [swaps, setSwaps] = useState(0)
  // 消えているあいだに URL がさらに変わったら、最後の行き先へ向かう
  const target = useRef(location)
  const leaving = useRef<Animation[] | null>(null)
  // 差し替えた直後に現れさせるもの
  const entering = useRef<{footer: boolean} | null>(null)
  const motionRef = useRef(motion)
  useEffect(() => {
    motionRef.current = motion
  })

  useEffect(() => {
    target.current = location
    if (location === displayed || leaving.current) return
    const m = motionRef.current
    const inPage = samePage(parser, location, displayed)
    const page = m.variant !== 'none' && !(inPage && m.categories === 'no')
    const footer = m.footerVariant !== 'none' && !inPage
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || (!page && !footer)) {
      resetScroll()
      setDisplayed(location)
      return
    }

    const timing = (seconds: number) => ({duration: seconds * 1000, easing: EXIT_EASING, fill: 'forwards' as const})
    const cover = document.querySelector<HTMLElement>('[data-page-cover]')
    const animations: Animation[] = []
    if (page && m.variant === 'wipe') {
      // 地の色の幕が下から上がって覆う
      if (cover)
        animations.push(cover.animate([{transform: 'scaleY(0)'}, {transform: 'scaleY(1)'}], timing(m.exitSeconds)))
    } else if (page) {
      const {exit} = pageFrames(m)
      pageTargets(m).forEach((el, i, all) =>
        animations.push(
          el.animate(exit, {
            ...timing(m.exitSeconds),
            delay: m.variant === 'stagger' ? (all.length - 1 - i) * m.stagger * 500 : 0
          })
        )
      )
    }
    if (footer) {
      const {exit} = footerFrames(m)
      for (const el of footerTargets()) animations.push(el.animate(exit, timing(m.footerExitSeconds)))
    }
    leaving.current = animations
    Promise.all(animations.map((a) => a.finished))
      .catch(() => {})
      .then(() => {
        entering.current = {footer}
        setDisplayed(target.current)
        setSwaps((n) => n + 1)
      })
  }, [location, displayed, parser])

  // 差し替えた直後。先頭へ戻し、消えた状態から現れさせる。消えたときの状態を残したまま
  // 現れる側を重ねるので、そのあいだに中身がちらつくことはない
  useLayoutEffect(() => {
    const enter = entering.current
    if (!enter) return
    entering.current = null
    const exits = leaving.current ?? []
    leaving.current = null
    resetScroll()
    const m = motionRef.current
    const easing = EASINGS[m.enterEasing].css
    const timing = (seconds: number, delay: number) => ({
      duration: seconds * 1000,
      delay: delay * 1000,
      easing,
      fill: 'backwards' as const
    })
    if (m.variant === 'wipe') {
      // 幕は上へ引いて、下から現れる（写真の「現れる」と同じ向き）
      document.querySelector<HTMLElement>('[data-page-cover]')?.animate(
        [
          {transform: 'scaleY(1)', transformOrigin: 'top'},
          {transform: 'scaleY(0)', transformOrigin: 'top'}
        ],
        {...timing(m.enterSeconds, m.pauseSeconds), fill: 'both'}
      )
    } else if (m.variant !== 'none') {
      const {enter: frames} = pageFrames(m)
      pageTargets(m).forEach((el, i) =>
        el.animate(frames, timing(m.enterSeconds, m.pauseSeconds + (m.variant === 'stagger' ? i * m.stagger : 0)))
      )
    }
    if (enter.footer) {
      const {enter: frames} = footerFrames(m)
      for (const el of footerTargets()) el.animate(frames, timing(m.footerEnterSeconds, m.footerDelay))
    }
    for (const a of exits) a.cancel()
  }, [swaps])

  return displayed
}

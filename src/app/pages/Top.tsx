import {useEffect, useRef, useState} from 'preact/hooks'
import {NAME} from '../routes'
import {heroesOf, heroSrc, usePhotos} from '../../photos'
import {onScrollFrame} from '../scrollFrame'
import {SCENE_SCREENS, advanceGather, type Stage} from '../stage'
import {Tabs} from '../Tabs'

type HeroComponent = typeof import('../../hero/Hero').Hero
let loaded: HeroComponent | null = null
type LightComponent = typeof import('../../light/Light').Light
let lightLoaded: LightComponent | null = null

/**
 * Hero は Worker と OffscreenCanvas を使うのでサーバーでは動かせない。描いたあと（ブラウザで）初めて import
 * することで、プリレンダ時に worker のモジュールグラフに触れずに済む。読み込むまで null。2 回目からはすぐ返す
 */
function useHero() {
  const [Hero, setHero] = useState(() => loaded)
  useEffect(() => {
    if (!Hero) void import('../../hero/Hero').then((module) => setHero(() => (loaded = module.Hero)))
  }, [Hero])
  return Hero
}

/** 光の段（試し）。hero と同じく worker を使うので、ブラウザで初めて import する */
function useLight() {
  const [Light, setLight] = useState(() => lightLoaded)
  useEffect(() => {
    if (!Light) void import('../../light/Light').then((module) => setLight(() => (lightLoaded = module.Light)))
  }, [Light])
  return Light
}

export function Top() {
  const Hero = useHero()
  const Light = useLight()
  const photos = usePhotos()
  const heroPhotos = photos ? heroesOf(photos).map(heroSrc) : []
  const stage = useStage()
  const room = useRef<HTMLDivElement>(null)

  return (
    <div className="relative">
      <h1 className="sr-only">{NAME}</h1>
      {/* 舞台。hero と光の層を重ねて画面に貼りつけ、スクロールで場面を進める（src/app/stage.ts）。
          プリレンダの HTML から先に 1 画面ぶん空けておく。hero は JS が動いてから差し込まれる */}
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* hero と光の層は読み込んだ 1 つの部品で、描くたびに作り直すものではない */}
        {/* oxlint-disable-next-line react/static-components */}
        {Light && <Light stage={stage} room={room} />}
        {/* hero は起動時に写真をまとめて読み込むので、並びが変わったら作り直す（編集で hero を選び直したとき。
            訪問者には起きない） */}
        {/* oxlint-disable-next-line react/static-components */}
        {Hero && heroPhotos.length > 0 && <Hero key={heroPhotos.join()} photos={heroPhotos} stage={stage} />}
      </div>
      {/* ロゴと導線の段。ふつうのページの中身として舞台の上を下から上がってきて、ページの一番下で画面に収まる。
          ロゴは光の層が段の中央に描き、段の左・右・下の辺を光を返す壁にする（部屋）。舞台に重ねて始め、
          一番下までのスクロールを SCENE_SCREENS にする */}
      <div
        ref={room}
        className="pointer-events-none relative h-[100svh]"
        style={{marginTop: `${(SCENE_SCREENS - 1) * 100}svh`}}
      >
        <div className="absolute inset-x-0 top-[68%] flex justify-center">
          <div className="pointer-events-auto h-12">
            <Tabs items={LINKS} />
          </div>
        </div>
      </div>
    </div>
  )
}

const LINKS = [
  {href: '/photos/street', label: 'Photos', current: false},
  {href: '/works', label: 'Works', current: false},
  {href: '/contact', label: 'Contact', current: false}
]

/**
 * 舞台の state。hero と光の段が毎フレーム読む。進み具合（スクロール量を画面の高さで割った値）はスクロールのたびに書き、
 * 粒子が集まった割合は時間で進める
 */
function useStage() {
  const state = useRef<Stage>({progress: 0, rise: Infinity, gather: 0, source: {x: 0, y: 0}})
  useEffect(() => {
    const current = state.current
    const measure = () => {
      current.progress = scrollY / innerHeight
    }
    measure()
    const stop = onScrollFrame(measure)
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      advanceGather(current, Math.min((now - last) / 1000, 0.1))
      last = now
      frame = requestAnimationFrame(tick)
    })
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [])
  return state
}

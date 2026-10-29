import {useEffect, useRef, useState} from 'preact/hooks'
import {NAME} from '../routes'
import {heroesOf, heroSrc, usePhotos} from '../../photos'
import {onScrollFrame} from '../scrollFrame'
import {STAGE_SCREENS, type Stage} from '../stage'
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
  const [stageRef, stage] = useStage()

  return (
    <div ref={stageRef} className="relative">
      <h1 className="sr-only">{NAME}</h1>
      {/* 舞台。hero と光の段を重ねて画面に貼りつけ、スクロールで場面を進める（src/app/stage.ts）。
          プリレンダの HTML から先に 1 画面ぶん空けておく。hero は JS が動いてから差し込まれる */}
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* hero と光の段は読み込んだ 1 つの部品で、描くたびに作り直すものではない */}
        {/* oxlint-disable-next-line react/static-components */}
        {Light && <Light stage={stage} />}
        {/* hero は起動時に写真をまとめて読み込むので、並びが変わったら作り直す（編集で hero を選び直したとき。
            訪問者には起きない） */}
        {/* oxlint-disable-next-line react/static-components */}
        {Hero && heroPhotos.length > 0 && <Hero key={heroPhotos.join()} photos={heroPhotos} stage={stage} />}
        {/* 下へ続くことを示す目盛り（試し）。短い縦線の中を、小さな点がゆっくり下へ流れる。styles.css の [data-scroll-cue]。
            中央へ寄せる translate は付けない。半画素にかかって線がにじむため。スクロールし始めると薄れて消える */}
        <div
          data-scroll-cue
          aria-hidden
          className="pointer-events-none absolute bottom-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+12px)] left-1/2 h-10 w-px opacity-[clamp(0,calc(1-var(--stage,0)*4),1)]"
        />
      </div>
      <div style={{height: `${STAGE_SCREENS * 100}svh`}} />
      {/* 導線。舞台の上を下から上がってきて、ロゴの下で止まる */}
      <div className="relative flex h-[100svh] justify-center pt-[78svh]">
        <div className="h-12">
          <Tabs items={LINKS} />
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
 * 舞台の進み具合（スクロール量を画面の高さで割った値）を、hero と光の段が毎フレーム読む state に書き、CSS からも
 * 使えるよう ref の要素に --stage として書く
 */
function useStage() {
  const ref = useRef<HTMLDivElement>(null)
  const state = useRef<Stage>({progress: 0, source: {x: 0, y: 0}})
  useEffect(() => {
    const el = ref.current
    const current = state.current
    const measure = () => {
      const progress = scrollY / innerHeight
      return () => {
        current.progress = progress
        el?.style.setProperty('--stage', String(progress))
      }
    }
    measure()()
    return onScrollFrame(measure)
  }, [])
  return [ref, state] as const
}

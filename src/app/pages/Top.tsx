import {useEffect, useRef, useState} from 'preact/hooks'
import {NAME} from '../routes'
import {heroesOf, heroSrc, usePhotos} from '../../photos'
import {onScrollFrame} from '../scrollFrame'
import {SCENE_SCREENS, advanceGather, type Stage} from '../stage'
import {TabLink, Tabs} from '../Tabs'
import {DevPanel, type Param} from '../DevPanel'

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
  // 導線の置き方は、幅の狭い画面（スマホ）と広い画面で別に決める。開発用パネルで触っているあいだだけ上書きする
  const narrow = useNarrow()
  const preset = narrow ? NARROW_PLACEMENT : WIDE_PLACEMENT
  const [override, setOverride] = useState<Placement | null>(null)
  const placement = override ?? preset

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
          段は光の層にとっての部屋で、段の中央にロゴを、床の上に棒の光を描く。舞台に重ねて始め、
          一番下までのスクロールを SCENE_SCREENS にする */}
      <div
        ref={room}
        className="pointer-events-none relative h-[100svh]"
        style={{marginTop: `${(SCENE_SCREENS - 1) * 100}svh`}}
      >
        {/* 導線の高さの半分だけ上げて、中心を links の位置に置く（translate は使わない。半画素にかかって文字がにじむ）。
            左右に寄せるときはナビと同じ余白にそろえる */}
        <div
          className={`absolute inset-x-0 flex px-8 max-sm:px-5 ${JUSTIFY[placement.align]}`}
          style={{
            top: `calc(${placement.links}% - ${(placement.direction === 'row' ? ROW_HEIGHT : LINKS.length * ROW_HEIGHT) / 2}px)`
          }}
        >
          {placement.direction === 'row' ? (
            <div className="pointer-events-auto" style={{height: `${ROW_HEIGHT}px`}}>
              <Tabs items={LINKS} />
            </div>
          ) : (
            // 縦に並べるときは、寄せた側に文字の端をそろえる。文字の大きさと字間は Tabs と同じ
            <div
              className={`pointer-events-auto flex flex-col text-sm tracking-[0.12em] max-sm:text-xs ${ITEMS[placement.align]}`}
            >
              {LINKS.map((link) => (
                <div key={link.href} className="flex" style={{height: `${ROW_HEIGHT}px`}}>
                  <TabLink {...link} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {import.meta.env.DEV && (
        <DevPanel<Placement>
          key={narrow ? 'narrow' : 'wide'}
          title={narrow ? 'ロゴの段の配置（スマホ）' : 'ロゴの段の配置（PC）'}
          typeName="Placement"
          constName={narrow ? 'NARROW_PLACEMENT' : 'WIDE_PLACEMENT'}
          params={PLACEMENT_PARAMS}
          defaults={preset}
          storageKey={`mypage2026.placement.${narrow ? 'narrow' : 'wide'}`}
          onChange={setOverride}
        />
      )}
    </div>
  )
}

/** ロゴと導線の段の中の配置。ロゴは段の中央に置く */
type Placement = {
  /** 導線の中心の高さ。段の上端からの %（段は一番下までスクロールすると画面にちょうど収まる） */
  links: number
  /** 導線を左右どちらに寄せるか、中央に置くか */
  align: (typeof ALIGNS)[number]
  /** 導線を横に並べるか、縦に並べるか */
  direction: (typeof DIRECTIONS)[number]
}

const ALIGNS = ['left', 'center', 'right'] as const
const DIRECTIONS = ['row', 'column'] as const
const JUSTIFY = {left: 'justify-start', center: 'justify-center', right: 'justify-end'}
const ITEMS = {left: 'items-start', center: 'items-center', right: 'items-end'}

/** 導線 1 行（横並びなら全体）の高さ px */
const ROW_HEIGHT = 48

const WIDE_PLACEMENT: Placement = {links: 50, align: 'left', direction: 'row'}
const NARROW_PLACEMENT: Placement = {links: 78, align: 'right', direction: 'column'}

const PLACEMENT_PARAMS: Param<Placement>[] = [
  {key: 'links', label: '導線の高さ', min: 5, max: 95, step: 1, hint: '%。中心の位置。段（最後の画面）の上端から'},
  {key: 'align', label: '導線の横の位置', options: ALIGNS, hint: '左右はナビと同じ余白に寄せる'},
  {key: 'direction', label: '導線の並べ方', options: DIRECTIONS, hint: 'row は横、column は縦'}
]

/** 幅の狭い画面（Tailwind の sm 未満）か。プリレンダでは広い画面として描き、ブラウザで測り直す */
function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const media = matchMedia('(max-width: 639px)')
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
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

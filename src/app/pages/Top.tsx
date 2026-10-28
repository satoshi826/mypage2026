import {useEffect, useState} from 'preact/hooks'
import {Link} from 'wouter-preact'
import {NAME} from '../routes'
import {heroesOf, heroSrc, usePhotos} from '../../photos'
import {Page, Text} from '../Page'

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

/** 光とロゴの段（試し）。hero と同じく worker を使うので、ブラウザで初めて import する */
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

  return (
    <>
      {/* hero の場所は、プリレンダの HTML から先に 1 画面ぶん空けておく。hero は JS が動いてから
          差し込まれるので、空けておかないと下の紹介文が画面の外へ押し出される（レイアウトのずれ）。
          写真の一覧を読み終えて hero に使う写真が無かったときだけ詰める */}
      {(photos === null || heroPhotos.length > 0) && (
        <div className="relative h-[100svh]">
          {/* Hero は読み込んだ 1 つの部品で、描くたびに作り直すものではない。hero は起動時に写真をまとめて
              読み込むので、並びが変わったら作り直す（編集で hero を選び直したとき。訪問者には起きない） */}
          {/* oxlint-disable-next-line react/static-components */}
          {Hero && heroPhotos.length > 0 && <Hero key={heroPhotos.join()} photos={heroPhotos} />}
          {/* 下へ続くことを示す目盛り（試し）。短い縦線の中を、小さな点がゆっくり下へ流れる。styles.css の [data-scroll-cue]。
              中央へ寄せる translate は付けない。半画素にかかって線がにじむため */}
          <div
            data-scroll-cue
            aria-hidden
            className="pointer-events-none absolute bottom-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+12px)] left-1/2 h-10 w-px"
          />
        </div>
      )}
      {/* 光とロゴの段も、読み込んだ 1 つの部品で、描くたびに作り直すものではない */}
      {/* oxlint-disable-next-line react/static-components */}
      {Light ? <Light /> : <div className="h-[100svh]" />}
      <Page title={NAME}>
        <Text>street / architecture を撮っています。Web エンジニアでもあります。</Text>
        <Text>
          <Link href="/photos/street">写真を見る</Link>
          {' / '}
          <Link href="/works">撮影実績</Link>
          {' / '}
          <Link href="/contact">撮影のご依頼</Link>
        </Text>
      </Page>
    </>
  )
}

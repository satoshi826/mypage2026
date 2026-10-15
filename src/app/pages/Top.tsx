import {useEffect, useState} from 'preact/hooks'
import {Link} from 'wouter-preact'
import {NAME} from '../routes'
import {heroesOf, heroSrc, usePhotos} from '../../photos'
import {Page, Text} from '../Page'

type HeroComponent = typeof import('../../hero/Hero').Hero
let loaded: HeroComponent | null = null

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

export function Top() {
  const Hero = useHero()
  const photos = usePhotos()
  const heroPhotos = photos ? heroesOf(photos).map(heroSrc) : []

  return (
    <>
      {/* hero の場所は、プリレンダの HTML から先に 1 画面ぶん空けておく。hero は JS が動いてから
          差し込まれるので、空けておかないと下の紹介文が画面の外へ押し出される（レイアウトのずれ）。
          写真の一覧を読み終えて hero に使う写真が無かったときだけ詰める */}
      {(photos === null || heroPhotos.length > 0) && (
        <div className="h-[100svh]">
          {/* Hero は読み込んだ 1 つの部品で、描くたびに作り直すものではない */}
          {/* oxlint-disable-next-line react/static-components */}
          {Hero && heroPhotos.length > 0 && <Hero photos={heroPhotos} />}
        </div>
      )}
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

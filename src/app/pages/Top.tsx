import {lazy, Suspense, useSyncExternalStore} from 'react'
import {Link} from 'wouter'
import {NAME} from '../routes'
import {heroSrc, usePhotos} from '../../photos'
import {Page, Text} from '../Page'

// Hero は Worker と OffscreenCanvas を使うのでサーバーでは動かせない。
// クライアントでマウントされてから初めて import することで、プリレンダ時に
// worker のモジュールグラフに触れずに済む。
const Hero = lazy(() => import('../../hero/Hero').then(({Hero}) => ({default: Hero})))

const subscribe = () => () => {}
/** サーバーでは false、クライアントでは true。hydration を壊さずに切り替わる */
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )

export function Top() {
  const isClient = useIsClient()
  const photos = usePhotos()
  const heroPhotos = photos?.filter((photo) => photo.hero).map(heroSrc) ?? []

  return (
    <>
      {/* hero の場所は、プリレンダの HTML から先に 1 画面ぶん空けておく。hero は JS が動いてから
          差し込まれるので、空けておかないと下の紹介文が画面の外へ押し出される（レイアウトのずれ）。
          写真の一覧を読み終えて hero に使う写真が無かったときだけ詰める */}
      {(photos === null || heroPhotos.length > 0) && (
        <div className="h-[100svh]">
          {isClient && heroPhotos.length > 0 && (
            <Suspense fallback={null}>
              <Hero photos={heroPhotos} />
            </Suspense>
          )}
        </div>
      )}
      <Page title={NAME}>
        <Text>street / architecture を撮っています。Web エンジニアでもあります。</Text>
        <Text>
          <Link href="/photos">写真を見る</Link>
          {' / '}
          <Link href="/works">撮影実績</Link>
          {' / '}
          <Link href="/contact">撮影のご依頼</Link>
        </Text>
      </Page>
    </>
  )
}

import {lazy, Suspense, useSyncExternalStore} from 'react'
import {Link} from 'wouter'
import {NAME} from '../routes'
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

  return (
    <>
      {isClient && (
        <Suspense fallback={null}>
          <Hero />
        </Suspense>
      )}
      <Page title={NAME}>
        <Text>
          モノクロームの street / architecture を撮っています。あわせて WebGL を中心に Web の実装をしています。
        </Text>
        <Text>
          <Link href="/photos">写真を見る</Link>
          {' / '}
          <Link href="/works">実装を見る</Link>
          {' / '}
          <Link href="/contact">撮影のご依頼</Link>
        </Text>
      </Page>
    </>
  )
}

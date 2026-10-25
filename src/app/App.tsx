import {useEffect, useState} from 'preact/hooks'
import {Redirect, Route, Switch, useLocation} from 'wouter-preact'
import {Nav} from './Nav'
import {Footer} from './Footer'
import {Page} from './Page'
import {findRoute} from './routes'
import {langOf} from './lang'
import {Top} from './pages/Top'
import {Photos} from './pages/Photos'
import {Works} from './pages/Works'
import {About} from './pages/About'
import {Contact} from './pages/Contact'
import {Login} from './pages/Login'
import {useSmoothScroll} from './useSmoothScroll'
import {Scrollbar} from './Scrollbar'
import {DEFAULT_PAGE_MOTION, usePageTransition} from './pageMotion'
import {PageCover, PageMotionPanel} from './PageTransition'
import {DevDock} from './DevPanel'
import {GlowPanel} from './GlowPanel'

export function App() {
  const [location] = useLocation()
  // プリレンダされた HTML には正しい title と言語が入っているが、クライアント遷移では変わらないので追随させる
  useEffect(() => {
    const route = findRoute(location)
    if (route) document.title = route.title
    document.documentElement.lang = langOf(location)
  }, [location])
  useSmoothScroll()
  const [motion, setMotion] = useState(DEFAULT_PAGE_MOTION)
  // 中身（main とフッター）は表示中の場所で描く。ナビは実際の URL で、下線がすぐ滑り始める
  const displayed = usePageTransition(motion)
  return (
    <>
      <Nav />
      {/* 中身の文字は 300。小見出しだけ 400 に戻す（Page の Heading、About の欄見出し） */}
      <main data-page className="font-light">
        <Switch location={displayed}>
          <Route path="/" component={Top} />
          {/* 本番は Worker が転送する。開発中と、サイト内の履歴（戻る・進む）で来たとき用 */}
          <Route path="/photos">
            <Redirect to="/photos/street" replace />
          </Route>
          <Route path="/photos/:category" component={Photos} />
          <Route path="/works" component={Works} />
          <Route path="/about">
            <About lang="ja" />
          </Route>
          <Route path="/en/about">
            <About lang="en" />
          </Route>
          <Route path="/contact">
            <Contact lang="ja" />
          </Route>
          <Route path="/en/contact">
            <Contact lang="en" />
          </Route>
          <Route path="/admin" component={Login} />
          <Route>
            <Page title="Not found">{null}</Page>
          </Route>
        </Switch>
      </main>
      <PageCover />
      <Footer location={displayed} />
      <Scrollbar />
      {import.meta.env.DEV && <DevDock />}
      {import.meta.env.DEV && <PageMotionPanel onChange={setMotion} />}
      {import.meta.env.DEV && <GlowPanel />}
    </>
  )
}

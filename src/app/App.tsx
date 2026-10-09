import {useEffect} from 'react'
import {Route, Switch, useLocation} from 'wouter'
import {Nav} from './Nav'
import {Footer} from './Footer'
import {Page} from './Page'
import {findRoute} from './routes'
import {Top} from './pages/Top'
import {Photos} from './pages/Photos'
import {Works} from './pages/Works'
import {About} from './pages/About'
import {Contact} from './pages/Contact'
import {Admin} from '../admin/Admin'
import {useSmoothScroll} from './useSmoothScroll'

export function App() {
  useDocumentTitle()
  useSmoothScroll()
  return (
    <>
      <Nav />
      {/* 中身の文字は 300。小見出しだけ 400 に戻す（Page の Heading、About の欄見出し） */}
      <main className="font-light">
        <Switch>
          <Route path="/" component={Top} />
          <Route path="/photos" component={Photos} />
          <Route path="/photos/:category" component={Photos} />
          <Route path="/works" component={Works} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/admin" component={Admin} />
          <Route>
            <Page title="Not found">{null}</Page>
          </Route>
        </Switch>
      </main>
      <Footer />
    </>
  )
}

// プリレンダされた HTML には正しい title が入っているが、クライアント遷移では
// 変わらないのでここで追随させる
function useDocumentTitle() {
  const [location] = useLocation()
  useEffect(() => {
    const route = findRoute(location)
    if (route) document.title = route.title
  }, [location])
}

import {useEffect} from 'react'
import {Route, Switch, useLocation} from 'wouter'
import {Nav} from './Nav'
import {Page} from './Page'
import {findRoute} from './routes'
import {Top} from './pages/Top'
import {Photos} from './pages/Photos'
import {Works} from './pages/Works'
import {About} from './pages/About'
import {Contact} from './pages/Contact'

export function App() {
  useDocumentTitle()
  return (
    <>
      <Nav />
      <main>
        <Switch>
          <Route path="/" component={Top} />
          <Route path="/photos" component={Photos} />
          <Route path="/works" component={Works} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route>
            <Page title="Not found">{null}</Page>
          </Route>
        </Switch>
      </main>
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

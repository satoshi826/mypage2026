import {renderToString} from 'preact-render-to-string'
import {Router} from 'wouter-preact'
import {App} from './app/App'

/** プリレンダ用。指定パスでアプリを描画して HTML 文字列を返す */
export function render(path: string) {
  return renderToString(
    <Router ssrPath={path}>
      <App />
    </Router>
  )
}

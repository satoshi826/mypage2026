import {renderToString} from 'react-dom/server'
import {Router} from 'wouter'
import {App} from './app/App'

/** プリレンダ用。指定パスでアプリを描画して HTML 文字列を返す */
export function render(path: string) {
  return renderToString(
    <Router ssrPath={path}>
      <App />
    </Router>
  )
}

import {StrictMode} from 'react'
import {createRoot, hydrateRoot} from 'react-dom/client'
import {App} from './app/App'
import './styles.css'

// 本番の本文の書体はビルドが文字を絞って HTML に差し込む（scripts/fonts.js）。開発中は元のフォントを使う
if (import.meta.env.DEV) import('./dev-fonts.css')

const container = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// プリレンダ済みの HTML があれば hydrate、dev のように空なら通常のマウント
if (container.hasChildNodes()) hydrateRoot(container, app)
else createRoot(container).render(app)

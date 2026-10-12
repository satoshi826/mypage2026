import {hydrate, render} from 'preact'
import {App} from './app/App'
import {hydrated} from './app/useExternal'
import {registerServiceWorker} from './sw/register'
import './styles.css'

// 本番の本文の書体はビルドが文字を絞って HTML に差し込む（scripts/fonts.js）。開発中は元のフォントを使う
if (import.meta.env.DEV) import('./dev-fonts.css')

const container = document.getElementById('root')!
// プリレンダ済みの HTML があれば hydrate、dev のように空なら通常のマウント
if (container.hasChildNodes()) hydrate(<App />, container)
else render(<App />, container)
hydrated()

// 2 回目以降の訪問と、列数の切り替えで読み込みを待たせない（src/sw/）。開発中は古いファイルが残るので使わない
if (import.meta.env.PROD) registerServiceWorker()

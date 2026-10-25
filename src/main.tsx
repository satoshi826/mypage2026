import {hydrate, render} from 'preact'
import {App} from './app/App'
import {hydrated} from './app/useExternal'
import {startEditing} from './app/editing'
import {startCursor} from './app/cursor'
import {startGrain} from './app/grain'
import {startVignette} from './app/vignette'
import {registerServiceWorker} from './sw/register'
import './styles.css'

// 本番の本文の書体はビルドが文字を絞って HTML に差し込む（scripts/fonts.js）。開発中は元のフォントを使う
if (import.meta.env.DEV) import('./dev-fonts.css')

const container = document.getElementById('root')!
// プリレンダ済みの HTML があれば hydrate、dev のように空なら通常のマウント
if (container.hasChildNodes()) hydrate(<App />, container)
else render(<App />, container)
hydrated()

// ログインしている人にだけ、サイトの上で編集する UI を読み込む（訪問者は何もしない）
startEditing()

// マウスのある環境では、カーソルを場面ごとに形の変わる自前のものにする（src/app/cursor.ts）
startCursor()

// 地の周辺減光と粒の画像を作る（src/app/vignette.ts、src/app/grain.ts）
startVignette()
startGrain()

// 写真（img と hero の canvas）の上では右クリックのメニュー（画像を保存）を出さない。styles.css の誤操作の手当てと対
addEventListener('contextmenu', (event) => {
  if ((event.target as Element).closest('img, canvas')) event.preventDefault()
})

// 2 回目以降の訪問と、列数の切り替えで読み込みを待たせない（src/sw/）。開発中は古いファイルが残るので使わない
if (import.meta.env.PROD) registerServiceWorker()

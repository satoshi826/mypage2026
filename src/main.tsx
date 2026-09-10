import {StrictMode} from 'react'
import {createRoot, hydrateRoot} from 'react-dom/client'
import {App} from './app/App'
import './styles.css'

const container = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// プリレンダ済みの HTML があれば hydrate、dev のように空なら通常のマウント
if (container.hasChildNodes()) hydrateRoot(container, app)
else createRoot(container).render(app)

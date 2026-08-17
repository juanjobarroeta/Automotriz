import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSentry } from './sentry'
import './styles.css'

// Antes de montar React, para que un error durante el primer render —el caso
// que deja la pantalla en blanco— también quede reportado.
initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

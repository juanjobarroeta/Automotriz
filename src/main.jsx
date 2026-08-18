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

// Service worker: sólo en producción. En dev un SW registrado se queda cacheando
// el shell entre recargas y hace perder media hora persiguiendo un cambio que sí
// se guardó. Se registra tras `load` para no competir con el arranque de la app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Si falla, la app funciona igual: se pierde el instalable, no el producto.
    })
  })
}

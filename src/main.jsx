import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSentry } from './sentry'
import { aplicarTema, temaGuardado } from './lib/tema'
import './styles.css'

// El tema se aplica ANTES del primer render: si se aplicara dentro de React,
// la app pintaría un frame con el tema equivocado y se vería el parpadeo.
aplicarTema(temaGuardado())

// Antes de montar React, para que un error durante el primer render —el caso
// que deja la pantalla en blanco— también quede reportado.
initSentry()

// Cada deploy renombra los chunks. Una pestaña —o la app instalada— abierta
// desde antes pide un archivo que ya no existe y recibe HTML en su lugar; el
// import dinámico truena con «not a valid JavaScript MIME type». Recargar trae
// el shell nuevo con los nombres vigentes. El candado de 60s evita un ciclo de
// recargas cuando la causa es otra (sin red, proxy que responde HTML a todo).
window.addEventListener('vite:preloadError', (event) => {
  const ultima = Number(sessionStorage.getItem('recargaPorDeploy') || 0)
  if (Date.now() - ultima < 60_000) return
  sessionStorage.setItem('recargaPorDeploy', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

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

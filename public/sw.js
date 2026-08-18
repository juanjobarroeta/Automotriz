/*
 * Service worker de Automotriz PRO.
 *
 * LO QUE NO HACE, Y ES LO IMPORTANTE: no cachea páginas ni respuestas de la
 * API. Es la misma política que el hub (contabilidad-os/public/sw.js) y por la
 * misma razón, que aquí incluso pesa más: un saldo rancio es peligroso, y un
 * INVENTARIO rancio también. Enseñar «Disponible» una unidad que se vendió hace
 * dos horas es cómo se aparta dos veces la misma camioneta y se queda mal con
 * un cliente. Mejor no decir nada que decir algo viejo.
 *
 * Entonces sólo hace dos cosas: permite instalar la app (un SW con manejador
 * de `fetch` es requisito para el prompt de instalación) y, cuando no hay red
 * en una navegación, sirve una página propia en vez del dinosaurio.
 */

const CACHE = 'automotriz-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Sólo navegaciones de primer nivel. Todo lo demás —la API, los assets— va a
  // la red tal cual, sin pasar por aquí.
  if (req.mode !== 'navigate') return
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)))
})

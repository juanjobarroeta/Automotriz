import { Sentry } from '../sentry'

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:3000'

const TOKEN_KEY = 'automotriz.token' // único por satélite

// ── Reporte de fallos de API ─────────────────────────────────────────────────
// Sentry solo ve, por su cuenta, tres cosas: excepciones NO atrapadas, promesas
// rechazadas sin catch, y errores de render (la ErrorBoundary). Un try/catch
// que pinta el mensaje en pantalla no es ninguna de las tres.
//
// Y este SPA atrapa TODO: 58 de sus 59 bloques catch terminan en
// `setError(err.message)`. O sea que el modo de falla más común del producto
// —el hub responde 500 y la pantalla muestra el aviso en rojo— era
// perfectamente invisible en Sentry. El usuario ve el error, nosotros no.
//
// Por eso el reporte se hace AQUÍ, en el único punto por el que pasan todas
// las llamadas, en vez de pedirle a 58 catch que se acuerden de reportar.
//
// OJO con el agrupamiento: se sintetiza un Error con el método, la ruta y el
// status como mensaje, en vez de usar el texto que devolvió el servidor. Si se
// usara el del servidor, "No existe la unidad VIN123" y "No existe la unidad
// VIN456" serían dos issues distintos, y un mismo endpoint roto se vería como
// cientos de problemas sueltos.
//
// OJO también con `ignoreErrors` (src/sentry.js): filtra /Failed to fetch/i
// para no reportar a cada usuario que pierde el wifi. Un fallo de red que se
// reportara con su mensaje original quedaría filtrado ahí; por eso el mensaje
// sintetizado —que no coincide con ningún patrón— es lo que se envía.

/** La ruta sin query string: /api/vehiculos/123?x=1 → /api/vehiculos/123 */
function rutaLimpia(path) {
  const s = String(path)
  const i = s.indexOf('?')
  return i === -1 ? s : s.slice(0, i)
}

/**
 * Reporta un fallo de API a Sentry. `status` ausente = la petición ni siquiera
 * salió (red caída, DNS, CORS).
 *
 * No se reporta el 401: es la expiración normal de sesión, la maneja el propio
 * apiFetch mandando al login, y reportarlo llenaría Sentry de ruido diario.
 */
function reportarFalloApi({ method, path, status, causa }) {
  const ruta = rutaLimpia(path)
  if (status === 401) return

  const etiqueta = status ? `HTTP ${status}` : 'sin respuesta'
  const err = new Error(`API ${method} ${ruta} — ${etiqueta}`)
  err.name = 'ApiError'
  if (causa) err.cause = causa

  Sentry.withScope((scope) => {
    // 5xx y caídas de red son fallas nuestras; 4xx suele ser el cliente
    // mandando algo inválido, útil de ver pero no una alarma.
    scope.setLevel(!status || status >= 500 ? 'error' : 'warning')
    scope.setTag('api.method', method)
    scope.setTag('api.path', ruta)
    if (status) scope.setTag('api.status', String(status))
    // Un issue por (método, ruta, status) — no uno por mensaje del servidor.
    scope.setFingerprint(['api', method, ruta, String(status ?? 'network')])
    if (causa?.message) scope.setExtra('mensajeDelServidor', causa.message)
    Sentry.captureException(err)
  })
}

export const tokenStorage = {
  get:   () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set:   (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch {} },
  clear: ()  => { try { localStorage.removeItem(TOKEN_KEY) } catch {} },
}

export const api = (endpoint) => {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${API_URL}${clean}`
}

// ── Portal de clientes ───────────────────────────────────────────────────────
// Sesión SEPARADA de la de la agencia: otro token (audiencia automotriz:portal)
// y sin el redirect a /login del apiFetch de la app.
const PORTAL_TOKEN_KEY = 'automotriz.portal.token'
export const portalTokenStorage = {
  get:   () => { try { return localStorage.getItem(PORTAL_TOKEN_KEY) } catch { return null } },
  set:   (t) => { try { localStorage.setItem(PORTAL_TOKEN_KEY, t) } catch {} },
  clear: ()  => { try { localStorage.removeItem(PORTAL_TOKEN_KEY) } catch {} },
}

export async function portalFetch(path, opts = {}) {
  const { method = 'GET', body } = opts
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = portalTokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(api(path), {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = null
  const text = await res.text()
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  if (!res.ok) {
    if (res.status === 401) portalTokenStorage.clear()
    const err = new Error((data && data.error && (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))) || `Request failed: ${res.status}`)
    err.status = res.status
    reportarFalloApi({ method, path, status: res.status, causa: err })
    throw err
  }
  return data
}

export async function portalDownload(path, filename) {
  const headers = {}
  const token = portalTokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(api(path), { headers })
  if (!res.ok) throw new Error(`Descarga falló: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Descarga autenticada (el endpoint exige bearer, así que no sirve un <a href>):
// baja el archivo como blob y dispara el guardado con el nombre dado.
export async function apiDownload(path, filename) {
  const headers = {}
  const token = tokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(api(path), { headers })
  if (!res.ok) {
    let msg = `Descarga falló: ${res.status}`
    try { msg = (await res.json()).error ?? msg } catch { /* cuerpo no-JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function apiFetch(path, opts = {}) {
  const { method = 'GET', body, headers = {}, skipAuth = false } = opts
  const finalHeaders = { Accept: 'application/json', ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  if (!skipAuth) {
    const token = tokenStorage.get()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(api(path), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (causa) {
    // La petición no llegó a salir: red caída, DNS, CORS mal configurado.
    // Sin este catch el fallo viajaba como "Failed to fetch" y `ignoreErrors`
    // lo descartaba, así que un hub caído se veía como silencio.
    reportarFalloApi({ method, path, causa })
    throw causa
  }

  let data = null
  const text = await res.text()
  if (text) { try { data = JSON.parse(text) } catch { data = text } }

  if (!res.ok) {
    if (res.status === 401 && !skipAuth) {
      tokenStorage.clear()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    const err = new Error((data && data.error && (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))) || `Request failed: ${res.status}`)
    err.status = res.status
    err.data = data
    // El error se sigue lanzando IGUAL que antes —los 58 catch que pintan
    // err.message en pantalla no cambian— pero ahora además queda reportado.
    reportarFalloApi({ method, path, status: res.status, causa: err })
    throw err
  }

  return data
}

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:3000'

const TOKEN_KEY = 'automotriz.token' // único por satélite

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

  const res = await fetch(api(path), {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

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
    throw err
  }

  return data
}

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

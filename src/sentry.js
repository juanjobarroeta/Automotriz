/**
 * Sentry del satélite Automotriz.
 *
 * Este SPA no tiene backend propio: todo lo resuelve el hub contabilidad-os.
 * Por eso lo importante aquí no es solo "capturar el error del navegador", sino
 * PROPAGAR LA TRAZA hacia el hub. Con `tracePropagationTargets` apuntando a la
 * URL del hub, el SDK agrega los headers `sentry-trace` y `baggage` a cada
 * fetch; el hub los lee en su `onRequestError` y cuelga su excepción de la
 * misma traza. Resultado: en Sentry, el error que ve el vendedor en la pantalla
 * de Inventario y la excepción de Prisma que lo causó son UN solo hilo, aunque
 * vivan en dos proyectos y dos repos distintos.
 *
 * Sin VITE_SENTRY_DSN todo esto es un no-op silencioso: el SPA corre igual en
 * local sin cuenta de Sentry.
 */
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')

/** 10% por default; ajustable sin tocar código. Ver .env.example. */
function tracesSampleRate() {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return import.meta.env.PROD ? 0.1 : 0
}

/**
 * Ruido que no vale la cuota: cancelaciones del propio usuario, extensiones
 * del navegador y chunks viejos pedidos por una pestaña abierta durante un
 * deploy (Vite hornea hashes nuevos en cada build).
 */
const IGNORED_ERRORS = [
  /^AbortError/,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Load failed/i,
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /ChunkLoadError/,
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  /^chrome-extension:/,
  /^moz-extension:/,
]

const SENSITIVE_KEY_PATTERNS = [
  'password', 'contrasena', 'contraseña', 'secret', 'token',
  'authorization', 'cookie', 'apikey', 'api_key', 'credential',
]

function isSensitiveKey(key) {
  const k = String(key).toLowerCase()
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p))
}

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? '[Filtrado]' : redact(v, depth + 1)
  }
  return out
}

/**
 * Última barrera antes de que un evento salga del navegador. El token de sesión
 * vive en localStorage y se manda como header `Authorization` en cada llamada:
 * si no lo filtramos aquí, acabaría en Sentry en el breadcrumb de cada fetch.
 */
function scrubEvent(event) {
  if (event.request) {
    if (event.request.headers) event.request.headers = redact(event.request.headers, 1)
    if (event.request.cookies) event.request.cookies = '[Filtrado]'
    if (event.request.data) event.request.data = redact(event.request.data, 1)
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = '[Filtrado]'
    }
  }
  if (event.extra) event.extra = redact(event.extra, 1)
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) {
      if (b && b.data) b.data = redact(b.data, 1)
    }
  }
  return event
}

export function initSentry() {
  if (!DSN) return

  const replayEnabled = import.meta.env.VITE_SENTRY_REPLAY === '1'

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || (import.meta.env.PROD ? 'production' : 'development'),
    // El SHA del commit desplegado, inyectado en el build (ver vite.config.js).
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: tracesSampleRate(),
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    integrations: [
      Sentry.browserTracingIntegration(),
      ...(replayEnabled
        ? [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })]
        : []),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replayEnabled ? 1.0 : 0,
    // EL punto clave del montaje entre proyectos: a estas URLs se les agregan
    // los headers de traza. El hub debe permitir `sentry-trace` y `baggage` en
    // su CORS (ya lo hace: ver src/middleware.ts en contabilidad-os).
    tracePropagationTargets: [API_URL, /^\//],
  })
}

/**
 * Marca quién y en qué empresa está operando. No es PII de más: sin esto, un
 * error dice "algo falló" y con esto dice "le falla a esta agencia", que es la
 * diferencia entre un bug ignorable y uno urgente. Se llama desde AuthContext.
 */
export function setSentryUser(user) {
  if (!DSN) return
  if (!user) {
    Sentry.setUser(null)
    return
  }
  Sentry.setUser({ id: user.id ? String(user.id) : undefined, username: user.email })
  if (user.companyId) Sentry.setTag('company_id', String(user.companyId))
}

export { Sentry }

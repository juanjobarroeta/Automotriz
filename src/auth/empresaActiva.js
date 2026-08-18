/**
 * Qué agencia se abre al entrar.
 *
 * Antes esto vivía dentro del login y era una sola línea: agarrar la primera
 * empresa con módulo AUTOMOTRIZ. El problema es que "la primera" no significa
 * nada: el hub arma la lista con un Map sin `orderBy`, así que el orden es el
 * que devuelva Postgres. Para quien trabaja todo el día en una agencia y tiene
 * otras dos en la cuenta, eso se siente como que el sistema se le olvida —
 * cada login lo deja parado en la agencia equivocada.
 *
 * Aquí se resuelve con dos reglas: se recuerda la última agencia usada (por
 * usuario, no por navegador), y el orden de la lista se vuelve estable.
 */

export const PREFERRED_MODULE = 'AUTOMOTRIZ'

// Mapa { [userId]: companyId }. Sobrevive al cierre de sesión A PROPÓSITO: es
// una preferencia de trabajo, no una credencial. Indexado por usuario para que
// dos personas en la misma computadora no hereden la agencia de la otra.
const ULTIMA_EMPRESA_KEY = 'automotriz.ultimaEmpresaPorUsuario'

function leerMapa() {
  try {
    const raw = localStorage.getItem(ULTIMA_EMPRESA_KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

export function recordarEmpresa(userId, companyId) {
  if (!userId || !companyId) return
  try {
    localStorage.setItem(ULTIMA_EMPRESA_KEY, JSON.stringify({ ...leerMapa(), [userId]: companyId }))
  } catch {}
}

export function empresaRecordada(userId) {
  if (!userId) return null
  return leerMapa()[userId] ?? null
}

/** Orden estable para el selector de agencia y para el "primera de la lista". */
export const porNombre = (a, b) =>
  String(a?.razonSocial ?? '').localeCompare(String(b?.razonSocial ?? ''), 'es')

export function ordenarEmpresas(companies) {
  return [...(companies ?? [])].sort(porNombre)
}

/**
 * La agencia a activar: la última donde estuvo este usuario si sigue en su
 * lista; si no, la primera con el módulo Automotriz (en orden estable).
 *
 * Validar contra `companies` es lo que hace segura la memoria: si le quitaron
 * el acceso a esa agencia, o si quien entra es otra persona, el id recordado
 * simplemente no aparece y se cae al default.
 */
export function elegirEmpresa(companies, userId) {
  const lista = companies ?? []
  const conModulo = lista.filter((c) => c?.modulos?.includes(PREFERRED_MODULE))
  const candidatas = conModulo.length ? conModulo : lista
  const recordada = empresaRecordada(userId)
  return candidatas.find((c) => c.id === recordada) ?? candidatas[0] ?? null
}

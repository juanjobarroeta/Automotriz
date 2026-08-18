import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  apiFetch,
  guardarSesion,
  limpiarSesion,
  refreshTokenStorage,
  renovarSesion,
  sesionPorExpirar,
  tokenStorage,
} from '../config/api'
import { elegirEmpresa, ordenarEmpresas, recordarEmpresa } from './empresaActiva'
import { setSentryUser } from '../sentry'

const USER_KEY      = 'automotriz.user'
const COMPANIES_KEY = 'automotriz.companies'
const ACTIVE_KEY    = 'automotriz.activeCompanyId'

// Etiqueta con la que esta sesión aparece en el hub (Configuración → Mi cuenta
// → Accesos de API). Sin ella el acceso se lista con el User-Agent del
// navegador, que no distingue este satélite de ningún otro.
const CLIENTE = 'automotriz-spa'

const AuthContext = createContext(null)

function readJson(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}
function writeJson(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser]              = useState(() => readJson(USER_KEY))
  const [companies, setCompanies]    = useState(() => readJson(COMPANIES_KEY) ?? [])
  const [activeCompanyId, setActive] = useState(() => { try { return localStorage.getItem(ACTIVE_KEY) } catch { return null } })
  const [booting, setBooting]        = useState(true)

  // Arranque: si el access token guardado ya venció, se renueva ANTES del
  // primer render. Sin esto la primera llamada de la primera pantalla contesta
  // 401 y expulsa al login — que es como se veía "me sacó otra vez" al volver
  // a la pestaña al día siguiente.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      if (!user || !companies.length) {
        limpiarSesion()
        if (!cancelado) setBooting(false)
        return
      }

      if ((!tokenStorage.get() || sesionPorExpirar()) && refreshTokenStorage.get()) {
        await renovarSesion()
      }

      // Sin token utilizable y sin forma de renovarlo: la sesión terminó.
      if (!tokenStorage.get()) {
        limpiarSesion()
        writeJson(USER_KEY, null)
        writeJson(COMPANIES_KEY, null)
        if (!cancelado) { setUser(null); setCompanies([]); setActive(null) }
      }

      if (!cancelado) setBooting(false)
    })()
    return () => { cancelado = true }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async ({ email, password }) => {
    const data = await apiFetch('/api/auth/token', {
      method: 'POST',
      body: { email, password, cliente: CLIENTE },
      skipAuth: true,
    })
    // Guarda el PAR (access + refresh) y la fecha de expiración. Guardar sólo
    // `data.token`, como antes, es lo que hacía que la sesión durara una hora.
    guardarSesion(data)

    const empresas = ordenarEmpresas(data.companies)
    writeJson(USER_KEY, data.user)
    writeJson(COMPANIES_KEY, empresas)
    setUser(data.user)
    setCompanies(empresas)

    const pick = elegirEmpresa(empresas, data.user?.id)
    if (pick) {
      localStorage.setItem(ACTIVE_KEY, pick.id)
      setActive(pick.id)
      recordarEmpresa(data.user?.id, pick.id)
    }
    return { ...data, companies: empresas }
  }, [])

  const logout = useCallback(() => {
    limpiarSesion()
    localStorage.removeItem(ACTIVE_KEY)
    writeJson(USER_KEY, null)
    writeJson(COMPANIES_KEY, null)
    // La última agencia usada (ver empresaActiva.js) NO se borra: es la
    // preferencia que hace que el próximo login vuelva a donde estabas.
    setUser(null); setCompanies([]); setActive(null)
  }, [])

  const selectCompany = useCallback((id) => {
    localStorage.setItem(ACTIVE_KEY, id)
    setActive(id)
    recordarEmpresa(user?.id, id)
  }, [user?.id])

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  )

  // Red de seguridad: si el id activo no corresponde a ninguna empresa de la
  // lista (se revocó el acceso, cambió de usuario, quedó basura vieja), se
  // vuelve a elegir. Sin esto `activeCompany` queda en null y las pantallas se
  // quedan vacías para siempre, porque todas arrancan con `if (!activeCompany?.id) return`.
  useEffect(() => {
    if (!companies.length) return
    if (companies.some((c) => c.id === activeCompanyId)) return
    const pick = elegirEmpresa(companies, user?.id)
    if (pick) { localStorage.setItem(ACTIVE_KEY, pick.id); setActive(pick.id) }
  }, [companies, activeCompanyId, user?.id])

  // Un solo lugar para decirle a Sentry quién opera: cubre el login, el logout,
  // la sesión restaurada de localStorage y el cambio de empresa. Sin esto, un
  // error dice "algo falló"; con esto dice a QUÉ agencia le falla, que es la
  // diferencia entre un bug que puede esperar y uno que no.
  useEffect(() => {
    setSentryUser(user ? { ...user, companyId: activeCompanyId } : null)
  }, [user, activeCompanyId])

  const value = useMemo(
    () => ({ user, companies, activeCompany, activeCompanyId, isAuthenticated: !!user, booting, login, logout, selectCompany }),
    [user, companies, activeCompany, activeCompanyId, booting, login, logout, selectCompany]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStorage } from '../config/api'
import { setSentryUser } from '../sentry'

const PREFERRED_MODULE = 'AUTOMOTRIZ'
const USER_KEY      = 'automotriz.user'
const COMPANIES_KEY = 'automotriz.companies'
const ACTIVE_KEY    = 'automotriz.activeCompanyId'

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

  useEffect(() => {
    const token = tokenStorage.get()
    if (!token || !user || !companies.length) { tokenStorage.clear(); setBooting(false); return }
    setBooting(false)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async ({ email, password }) => {
    const data = await apiFetch('/api/auth/token', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    })
    tokenStorage.set(data.token)
    writeJson(USER_KEY, data.user)
    writeJson(COMPANIES_KEY, data.companies)
    setUser(data.user)
    setCompanies(data.companies)

    const preferred = data.companies.find((c) => c.modulos?.includes(PREFERRED_MODULE))
    const pick = preferred ?? data.companies[0]
    if (pick) { localStorage.setItem(ACTIVE_KEY, pick.id); setActive(pick.id) }
    return data
  }, [])

  const logout = useCallback(() => {
    tokenStorage.clear()
    localStorage.removeItem(ACTIVE_KEY)
    writeJson(USER_KEY, null)
    writeJson(COMPANIES_KEY, null)
    setUser(null); setCompanies([]); setActive(null)
  }, [])

  const selectCompany = useCallback((id) => {
    localStorage.setItem(ACTIVE_KEY, id); setActive(id)
  }, [])

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  )

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

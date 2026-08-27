import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { PAGINAS } from '../auth/paginas'

const ROLES = { ADMIN: 'Admin', ACCOUNTANT: 'Operativo', VIEWER: 'Sólo lectura' }
const chk = { width: 'auto', margin: 0 }

// Usuarios del ERP y su rejilla de permisos: qué PÁGINAS ve cada quien.
// La lista vive en el hub (CompanyMember.automotrizPaginas); vacío = ve todas.
// El dueño (OWNER) se administra en contabilidadOS, no desde aquí; nadie se
// edita a sí mismo (para no quedarse fuera) — mismas reglas que el hub impone.
export default function Usuarios() {
  const { activeCompany, user } = useAuth()
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [guardando, setGuardando] = useState(null) // membershipId en vuelo
  const [dirty, setDirty] = useState(() => new Set())
  const [alta, setAlta] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', password: '', role: 'ACCOUNTANT', paginas: [] })

  const esAdmin = activeCompany?.role === 'OWNER' || activeCompany?.role === 'ADMIN'

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const d = await apiFetch(`/api/automotriz/usuarios?companyId=${activeCompany.id}`)
      setFilas(d)
      setDirty(new Set())
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const marcar = (id) => setDirty((s) => new Set(s).add(id))

  const toggleTodas = (fila) => {
    // «Todas» = sin restricción (arreglo vacío). Al quitarla se precargan
    // todas las llaves para que el admin DESmarque lo que quiere ocultar.
    const paginas = fila.paginas.length === 0 ? PAGINAS.map((p) => p.key) : []
    setFilas((fs) => fs.map((f) => (f.membershipId === fila.membershipId ? { ...f, paginas } : f)))
    marcar(fila.membershipId)
  }

  const togglePagina = (fila, key) => {
    let paginas = fila.paginas.includes(key)
      ? fila.paginas.filter((k) => k !== key)
      : [...fila.paginas, key]
    // Marcarlas todas equivale a «todas»: se normaliza a vacío.
    if (paginas.length === PAGINAS.length) paginas = []
    setFilas((fs) => fs.map((f) => (f.membershipId === fila.membershipId ? { ...f, paginas } : f)))
    marcar(fila.membershipId)
  }

  const cambiarRol = (fila, role) => {
    setFilas((fs) => fs.map((f) => (f.membershipId === fila.membershipId ? { ...f, role } : f)))
    marcar(fila.membershipId)
  }

  const guardar = async (fila) => {
    setGuardando(fila.membershipId); setError(null); setAviso(null)
    try {
      await apiFetch(`/api/automotriz/usuarios/${fila.membershipId}`, {
        method: 'PATCH',
        body: { action: 'permisos', role: fila.role, paginas: fila.paginas },
      })
      setDirty((s) => { const n = new Set(s); n.delete(fila.membershipId); return n })
      setAviso(`Permisos de ${fila.nombre || fila.email} guardados.`)
    } catch (err) { setError(err.message) } finally { setGuardando(null) }
  }

  const eliminar = async (fila) => {
    if (!window.confirm(`¿Quitarle el acceso a ${fila.nombre || fila.email}? Su cuenta no se borra; deja de poder entrar a esta agencia.`)) return
    setError(null); setAviso(null)
    try {
      await apiFetch(`/api/automotriz/usuarios/${fila.membershipId}`, { method: 'DELETE' })
      setAviso(`${fila.nombre || fila.email} ya no tiene acceso.`)
      cargar()
    } catch (err) { setError(err.message) }
  }

  const crear = async (e) => {
    e.preventDefault(); setError(null); setAviso(null)
    try {
      await apiFetch('/api/automotriz/usuarios', {
        method: 'POST',
        body: { companyId: activeCompany.id, ...nuevo },
      })
      setAviso(`${nuevo.nombre} creado — ya puede entrar con su correo y contraseña.`)
      setNuevo({ nombre: '', email: '', password: '', role: 'ACCOUNTANT', paginas: [] })
      setAlta(false)
      cargar()
    } catch (err) { setError(err.message) }
  }

  const bloqueada = useCallback(
    (f) => f.role === 'OWNER' || f.userId === user?.id,
    [user?.id],
  )
  const motivoBloqueo = (f) =>
    f.role === 'OWNER' ? 'El dueño se administra en contabilidadOS' : 'Tu propia cuenta se administra en contabilidadOS'

  const columnas = useMemo(() => PAGINAS, [])

  if (!esAdmin) {
    return (
      <div>
        <header className="page-head"><h1>Usuarios</h1></header>
        <p className="muted">Sólo el dueño o un administrador pueden administrar usuarios.</p>
      </div>
    )
  }

  return (
    <div>
      <header className="page-head">
        <h1>Usuarios</h1>
        <span className="glosa">quién entra al ERP y qué páginas ve cada quien</span>
        <div className="head-actions" style={{ alignSelf: 'center' }}>
          <button type="button" onClick={() => setAlta((v) => !v)}>{alta ? 'Cancelar' : 'Nuevo usuario'}</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {aviso && <div className="ok" role="status">{aviso}</div>}

      {alta && (
        <section className="card" style={{ marginBottom: 14 }}>
          <form onSubmit={crear} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ flex: '1 1 180px' }}>Nombre
              <input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </label>
            <label style={{ flex: '1 1 220px' }}>Correo
              <input required type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
            </label>
            <label style={{ flex: '1 1 180px' }}>Contraseña
              <input required type="password" minLength={8} value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} />
            </label>
            <label>Rol
              <select value={nuevo.role} onChange={(e) => setNuevo({ ...nuevo, role: e.target.value })} style={{ width: 'auto' }}>
                <option value="ACCOUNTANT">Operativo</option>
                <option value="VIEWER">Sólo lectura</option>
              </select>
            </label>
            <button type="submit">Crear</button>
            <span className="muted" style={{ flexBasis: '100%', fontSize: 12 }}>
              Se crea viendo TODAS las páginas; recórtale en la rejilla después. Sólo puede usar AutomotrizPro, no contabilidadOS.
            </span>
          </form>
        </section>
      )}

      {!filas && !error && <p className="muted">Leyendo usuarios…</p>}

      {filas && (
        <section className="card">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--card, inherit)' }}>Usuario</th>
                  <th>Rol</th>
                  <th title="Sin restricción: ve todas las páginas">Todas</th>
                  {columnas.map((p) => (
                    <th key={p.key} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{p.label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const lock = bloqueada(f)
                  const todas = f.paginas.length === 0
                  return (
                    <tr key={f.membershipId} style={lock ? { opacity: 0.6 } : undefined} title={lock ? motivoBloqueo(f) : undefined}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--card, inherit)', whiteSpace: 'nowrap' }}>
                        {f.nombre || f.email}
                        {f.role === 'OWNER' && <span className="badge" style={{ marginLeft: 6 }}>dueño</span>}
                        {f.userId === user?.id && <span className="badge" style={{ marginLeft: 6 }}>tú</span>}
                        <div className="muted" style={{ fontSize: 11 }}>{f.email}</div>
                      </td>
                      <td>
                        {f.role === 'OWNER' ? 'Dueño' : (
                          <select value={f.role} disabled={lock} style={{ width: 'auto' }}
                            onChange={(e) => cambiarRol(f, e.target.value)}>
                            {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" style={chk} checked={todas} disabled={lock} onChange={() => toggleTodas(f)} />
                      </td>
                      {columnas.map((p) => (
                        <td key={p.key} style={{ textAlign: 'center' }}>
                          <input type="checkbox" style={chk} disabled={lock || todas}
                            checked={todas || f.paginas.includes(p.key)}
                            onChange={() => togglePagina(f, p.key)} />
                        </td>
                      ))}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!lock && (
                          <>
                            <button type="button" disabled={!dirty.has(f.membershipId) || guardando === f.membershipId}
                              onClick={() => guardar(f)}>
                              {guardando === f.membershipId ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button type="button" className="ghost" style={{ marginLeft: 6 }} onClick={() => eliminar(f)}>
                              Quitar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="glosa" style={{ marginTop: 10 }}>
            «Todas» = sin restricción. Al restringir, el usuario sólo ve las páginas marcadas — la
            navegación y las rutas se filtran al entrar (aplica en su siguiente inicio de sesión).
            El rol manda sobre la escritura: «Sólo lectura» no captura nada aunque vea la página.
          </p>
        </section>
      )}
    </div>
  )
}

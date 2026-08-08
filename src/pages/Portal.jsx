import { useCallback, useEffect, useState } from 'react'
import { BrandLockup } from '../components/Layout'
import { portalDownload, portalFetch, portalTokenStorage } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

// Portal del cliente de la agencia (público, fuera del layout de la app):
// su estado de cuenta, sus facturas con XML descargable y sus unidades.
// Sesión propia (automotriz:portal) — jamás toca datos de otros clientes.
export default function Portal() {
  const [sesion, setSesion] = useState(() => !!portalTokenStorage.get())
  const [form, setForm] = useState({ email: '', password: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try { setData(await portalFetch('/api/automotriz/portal/resumen')) }
    catch (err) {
      setError(err.message)
      if (err.status === 401) setSesion(false)
    }
  }, [])

  useEffect(() => { if (sesion) cargar() }, [sesion, cargar])

  const entrar = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await portalFetch('/api/automotriz/portal/login', { method: 'POST', body: form })
      portalTokenStorage.set(r.token)
      setForm({ email: '', password: '' })
      setSesion(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const salir = () => { portalTokenStorage.clear(); setData(null); setSesion(false) }

  const descargarXml = async (f) => {
    setError(null)
    const nombre = `${[f.serie, f.folio].filter(Boolean).join('-') || f.uuid || f.id}.xml`
    try { await portalDownload(`/api/automotriz/portal/facturas/${f.id}/download`, nombre) }
    catch (err) { setError(err.message) }
  }

  if (!sesion) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <BrandLockup />
          <p className="muted" style={{ marginTop: 4 }}>Portal de clientes</p>
          <form onSubmit={entrar}>
            <label>Correo electrónico
              <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>Contraseña
              <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="muted" style={{ fontSize: 12 }}>El acceso te lo da tu agencia. Aquí ves tus facturas, tu estado de cuenta y tus unidades.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-wrap" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
      <header className="page-head">
        <BrandLockup />
        <button className="ghost" onClick={salir}>Salir</button>
      </header>
      {error && <div className="error">{error}</div>}
      {!data ? <p className="muted">Cargando tu estado de cuenta…</p> : (
        <>
          <h1 style={{ marginTop: 12 }}>{data.cliente.razonSocial}</h1>
          <p className="muted">RFC {data.cliente.rfc}</p>

          <div className="cards">
            <section className="card"><h2>Facturado</h2><p className="kpi">{mxn(data.resumen.totalFacturado)}</p><p className="muted">{data.resumen.numFacturas} factura(s)</p></section>
            <section className="card"><h2>Pagado</h2><p className="kpi">{mxn(data.resumen.totalPagado)}</p><p className="muted">Saldo: {mxn(data.resumen.saldo)}</p></section>
            <section className="card">
              <h2>Complementos de pago</h2>
              {data.resumen.repPendienteFacturas > 0
                ? <><p className="kpi">{data.resumen.repPendienteFacturas}</p><p className="muted">pago(s) en proceso de complemento</p></>
                : <p className="kpi pos">✓ al día</p>}
            </section>
          </div>

          <section className="card">
            <h2>Tus facturas</h2>
            <table>
              <thead><tr><th>Folio</th><th>Fecha</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>CFDI</th></tr></thead>
              <tbody>
                {data.facturas.map((f) => (
                  <tr key={f.id}>
                    <td>{[f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8)}</td>
                    <td>{fecha(f.fecha)}</td>
                    <td className="num">{mxn(f.total)}</td>
                    <td className="num">{mxn(f.pagado)}</td>
                    <td className="num">{mxn(f.saldo)}</td>
                    <td><button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => descargarXml(f)}>XML</button></td>
                  </tr>
                ))}
                {data.facturas.length === 0 && <tr><td colSpan={6} className="muted">Sin facturas aún.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Tus unidades</h2>
            <table>
              <thead><tr><th>VIN</th><th>Unidad</th><th>Fecha</th></tr></thead>
              <tbody>
                {data.unidades.map((u) => (
                  <tr key={u.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{u.vin}</td>
                    <td>{u.marca} {u.modelo} {u.anio}</td>
                    <td>{fecha(u.fechaVenta)}</td>
                  </tr>
                ))}
                {data.unidades.length === 0 && <tr><td colSpan={3} className="muted">Sin unidades registradas.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

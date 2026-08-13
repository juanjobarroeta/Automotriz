import { useCallback, useEffect, useState } from 'react'
import { BrandLockup } from '../components/Layout'
import { portalDownload, portalFetch, portalTokenStorage } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

// Portal del cliente de la agencia (público, fuera del layout de la app):
// su estado de cuenta, sus facturas con XML descargable y sus unidades.
// Sesión propia (automotriz:portal) — jamás toca datos de otros clientes.
//
// Es la ÚNICA pantalla responsive del sistema: la franja de KPIs y las tarjetas
// se reacomodan solas, las tablas se recorren en horizontal dentro de su caja y
// los paddings usan clamp() para no ahogar la pantalla en un teléfono.
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
          <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
            <label>Correo electrónico
              <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>Contraseña
              <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="card-note" style={{ marginTop: 4 }}>
            El acceso te lo da tu agencia. Aquí ves tus facturas, tu estado de cuenta y tus unidades.
          </p>
        </div>
      </div>
    )
  }

  const r = data?.resumen

  return (
    <div className="portal-wrap" style={{ display: 'block', background: 'var(--surface-subtle)' }}>
      <header
        style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: '12px clamp(14px, 4vw, 28px)',
        }}
      >
        <BrandLockup />
        <button className="ghost" style={{ marginLeft: 'auto' }} onClick={salir}>Salir</button>
      </header>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px clamp(14px, 4vw, 24px) 48px' }}>
        {error && <div className="error">{error}</div>}
        {!data ? <p className="muted">Cargando tu estado de cuenta…</p> : (
          <>
            <h1 style={{ fontWeight: 700, fontSize: 25, margin: '0 0 4px', letterSpacing: '-0.025em' }}>
              {data.cliente.razonSocial}
            </h1>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted-2)', marginBottom: 26 }}>
              RFC {data.cliente.rfc}
            </div>

            <div className="kpi-strip">
              <div className="kpi-item">
                <span className="kpi-label">Facturado</span>
                <span className="kpi">{mxn(r.totalFacturado)}</span>
                <span className="kpi-sub">{r.numFacturas} factura(s)</span>
              </div>
              <div className="kpi-item">
                <span className="kpi-label">Pagado</span>
                <span className="kpi">{mxn(r.totalPagado)}</span>
                <span className="kpi-sub">saldo {mxn(r.saldo)}</span>
              </div>
              <div className="kpi-item">
                <span className="kpi-label">Complementos de pago</span>
                <span className="kpi" style={{ color: r.repPendienteFacturas > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                  {r.repPendienteFacturas > 0 ? r.repPendienteFacturas : 'al día'}
                </span>
                <span className="kpi-sub">
                  {r.repPendienteFacturas > 0 ? 'pago(s) en proceso de complemento' : 'sin REP pendientes'}
                </span>
              </div>
            </div>

            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
                <h2>Estado de tu cuenta</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                  {r.saldo > 0 ? `saldo por pagar ${mxn(r.saldo)}` : 'sin saldo por pagar'}
                </span>
              </div>
              <Proceso pasos={pasosCuenta(r)} />
            </section>

            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ marginBottom: 14 }}>
                <h2>Tus facturas</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{data.facturas.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Fecha</th>
                      <th className="num">Total</th>
                      <th className="num">Pagado</th>
                      <th className="num">Saldo</th>
                      <th className="num">CFDI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.facturas.map((f) => (
                      <tr key={f.id}>
                        <td className="mono">{[f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8)}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{fecha(f.fecha)}</td>
                        <td className="num">{mxn(f.total)}</td>
                        <td className="num">{mxn(f.pagado)}</td>
                        <td className="num" style={{ color: f.saldo > 0 ? 'var(--danger)' : 'var(--muted-2)' }}>{mxn(f.saldo)}</td>
                        <td className="num">
                          <button type="button" style={enlace} onClick={() => descargarXml(f)}>XML</button>
                        </td>
                      </tr>
                    ))}
                    {data.facturas.length === 0 && <tr><td colSpan={6} className="muted">Sin facturas aún.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-head" style={{ marginBottom: 14 }}>
                <h2>Tus unidades</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{data.unidades.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>VIN</th><th>Unidad</th><th>Fecha</th></tr></thead>
                  <tbody>
                    {data.unidades.map((u) => (
                      <tr key={u.id}>
                        <td className="mono">{u.vin}</td>
                        <td style={{ fontSize: 13 }}>{u.marca} {u.modelo} {u.anio}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{fecha(u.fechaVenta)}</td>
                      </tr>
                    ))}
                    {data.unidades.length === 0 && <tr><td colSpan={3} className="muted">Sin unidades registradas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', marginTop: 26 }}>
              Automotriz PRO · powered by Contabilidad OS
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Acción de texto dentro de una celda (el mockup pone «XML · PDF» como enlace,
// no como botón sólido).
const enlace = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer',
  color: 'var(--ink)', fontSize: 12, fontWeight: 400,
}

// El portal no recibe órdenes de servicio del hub todavía, así que el timeline
// del mockup cuenta el proceso que SÍ tenemos en los datos: la vida del cobro.
function pasosCuenta(r) {
  const facturado = r.numFacturas > 0
  const pagado = r.totalPagado > 0
  const liquidado = r.saldo <= 0
  const repAlDia = !(r.repPendienteFacturas > 0)
  return [
    { n: 'Facturado', estado: facturado ? 'done' : 'now' },
    { n: 'Pagos recibidos', estado: pagado ? 'done' : facturado ? 'now' : 'pend' },
    { n: 'Liquidado', estado: liquidado ? 'done' : pagado ? 'now' : 'pend' },
    { n: 'Complementos', estado: repAlDia && liquidado ? 'done' : repAlDia ? 'pend' : 'now' },
  ]
}

// Timeline de proceso del mockup: punto de 13px, línea de 1px entre pasos,
// etiqueta de 11.5px. El paso en curso late con la animación `pulse` global.
function Proceso({ pasos }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {pasos.map((p, i) => (
        <div key={p.n} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          {i < pasos.length - 1 && (
            <div style={{
              position: 'absolute', top: 6, left: '50%', width: '100%', height: 1,
              background: p.estado === 'done' ? 'var(--ink)' : 'var(--border)',
            }} />
          )}
          <span style={{
            width: 13, height: 13, borderRadius: '50%', position: 'relative', zIndex: 1,
            background: p.estado === 'done' ? 'var(--ink)' : p.estado === 'now' ? 'var(--surface)' : 'var(--surface-soft)',
            border: `1.5px solid ${p.estado === 'pend' ? 'var(--border-strong)' : 'var(--ink)'}`,
            animation: p.estado === 'now' ? 'pulse 1.8s infinite' : 'none',
          }} />
          <span style={{
            fontSize: 11.5, marginTop: 8, textAlign: 'center',
            color: p.estado === 'pend' ? 'var(--faint)' : 'var(--ink)',
          }}>{p.n}</span>
        </div>
      ))}
    </div>
  )
}

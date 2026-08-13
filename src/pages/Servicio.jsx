import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'
import OrdenesTaller from '../components/OrdenesTaller'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Servicio/Taller: dos caras de la misma operación —
//   Órdenes  (fase 5b): el workflow diario — recepción → técnico → entrega;
//            la factura llega por el sync y se liga sola.
//   Reportes (fase 5): la historia reconstruida desde CFDIs — venta por mes,
//            ticket promedio, top clientes y los que dejaron de venir.
const TABS = [['ORDENES', 'Órdenes'], ['REPORTES', 'Reportes']]

export default function Servicio() {
  const [tab, setTab] = useState('ORDENES')
  return (
    <div>
      <header className="page-head">
        <h1>Servicio</h1>
        <span className="glosa">El taller del día y la historia reconstruida desde los CFDI</span>
        <div className="head-actions">
          <div className="tabs" role="tablist">
            {TABS.map(([k, etiqueta]) => (
              <span key={k} role="tab" tabIndex={0} aria-selected={tab === k}
                className={tab === k ? 'activo' : ''}
                onClick={() => setTab(k)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(k) } }}>
                {etiqueta}
              </span>
            ))}
          </div>
        </div>
      </header>
      {tab === 'ORDENES' ? <OrdenesTaller /> : <ReportesTaller />}
    </div>
  )
}

function ReportesTaller() {
  const { activeCompany } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cfdiVista, setCfdiVista] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try { setData(await apiFetch(`/api/automotriz/servicio?companyId=${activeCompany.id}&year=${year}`)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, year])

  useEffect(() => { cargar() }, [cargar])

  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      <div className="head-actions" style={{ marginBottom: 14 }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Reconstruyendo el taller desde los CFDIs…</p> : data && (
        <>
          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="kpi-label">Órdenes facturadas</span>
              <span className="kpi">{data.resumen.facturas.toLocaleString('es-MX')}</span>
              <span className="kpi-sub">en {data.year}</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Venta de taller</span>
              <span className="kpi">{mxn(data.resumen.total)}</span>
              <span className="kpi-sub">M.O. {mxn(data.resumen.manoObra)} · Refacciones {mxn(data.resumen.refacciones)}</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Ticket promedio</span>
              <span className="kpi">{mxn(data.resumen.ticketPromedio)}</span>
              <span className="kpi-sub">por orden facturada</span>
            </div>
          </div>

          <div className="cards">
            <section className="card">
              <h2>Por mes</h2>
              <table>
                <thead><tr><th>Mes</th><th className="num">Órdenes</th><th className="num">Venta</th><th className="num">M.O.</th><th className="num">Refacc.</th></tr></thead>
                <tbody>
                  {data.porMes.map((m) => (
                    <tr key={m.mes}><td>{MESES[m.mes - 1]}</td><td className="num">{m.facturas}</td><td className="num">{mxn(m.total)}</td><td className="num">{mxn(m.manoObra)}</td><td className="num">{mxn(m.refacciones)}</td></tr>
                  ))}
                  {data.porMes.length === 0 && <tr><td colSpan={5} className="muted">Sin servicio en {data.year} — corre el backfill de servicio.</td></tr>}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>Top clientes de taller ({data.year})</h2>
              <table>
                <thead><tr><th>Cliente</th><th className="num">Servicios</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {data.topClientes.map((c) => (
                    <tr key={c.clienteId}><td><Link to={`/contactos/${c.clienteId}`}>{c.razonSocial}</Link></td><td className="num">{c.servicios}</td><td className="num">{mxn(c.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>Dejaron de venir</h2>
              {data.noRegresan.length === 0 ? <p className="muted">Nadie con ≥2 servicios lleva más de 6 meses sin venir.</p> : (
                <table>
                  <thead><tr><th>Cliente</th><th className="num">Servicios</th><th>Última visita</th></tr></thead>
                  <tbody>
                    {data.noRegresan.map((c) => (
                      <tr key={c.clienteId}><td><Link to={`/contactos/${c.clienteId}`}>{c.razonSocial}</Link></td><td className="num">{c.servicios}</td><td className="neg">{fecha(c.ultimaVisita)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="card-note">≥2 servicios históricos y +6 meses sin regresar — la lista de llamadas del asesor (y del bot de WhatsApp en fase 2).</div>
            </section>
          </div>

          <section className="card">
            <div className="card-head"><span>Últimas órdenes facturadas</span><span className="muted" style={{ fontWeight: 400 }}>{data.year}</span></div>
            <table>
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Cliente</th><th>Unidad</th><th className="num">Total</th><th>CFDI</th></tr></thead>
              <tbody>
                {data.ultimas.map((s) => (
                  <tr key={s.id}>
                    <td>{fecha(s.fecha)}</td>
                    <td>{s.concepto ?? '—'}</td>
                    <td>{s.cliente ? <Link to={`/contactos/${s.cliente.id}`}>{s.cliente.razonSocial}</Link> : <span className="muted">Público en general</span>}</td>
                    <td>{s.vehiculo ? <Link to={`/vehiculos/${s.vehiculo.id}`}>{s.vehiculo.marca} {s.vehiculo.modelo} {s.vehiculo.anio}</Link> : '—'}</td>
                    <td className="num">{mxn(s.total)}</td>
                    <td><button className="ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => setCfdiVista(s.invoice.id)}>Ver</button></td>
                  </tr>
                ))}
                {data.ultimas.length === 0 && <tr><td colSpan={6} className="muted">Sin órdenes derivadas aún.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

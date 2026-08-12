import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Rentabilidad: dos lecturas del mismo negocio —
//   Por unidad     : utilidad por VIN (precio − costo real − interés − comisión).
//   Por línea      : el estado de resultados como lo lee un distribuidor —
//                    nuevas, seminuevos, mano de obra y refacciones (taller vs
//                    mostrador), cada una con su margen.
export default function Rentabilidad() {
  const [vista, setVista] = useState('LINEAS')
  return (
    <div>
      <header className="page-head">
        <h1>Rentabilidad</h1>
        <div className="head-actions">
          <button className={vista === 'LINEAS' ? '' : 'ghost'} onClick={() => setVista('LINEAS')}>Por línea de negocio</button>
          <button className={vista === 'UNIDAD' ? '' : 'ghost'} onClick={() => setVista('UNIDAD')}>Por unidad</button>
        </div>
      </header>
      {vista === 'LINEAS' ? <PorLinea /> : <PorUnidad />}
    </div>
  )
}

// Estado de resultados por línea de negocio (vista de operación, derivada de
// CFDIs). Las notas del endpoint se muestran tal cual: dicen qué NO tiene costo
// asignado y qué es estimado, para que nadie lea el margen de más.
function PorLinea() {
  const { activeCompany } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try { setData(await apiFetch(`/api/automotriz/resultados?companyId=${activeCompany.id}&year=${year}`)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, year])

  useEffect(() => { cargar() }, [cargar])
  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <div className="head-actions" style={{ marginBottom: 14 }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Armando el estado de resultados…</p> : data && (
        <>
          <div className="cards">
            <section className="card"><h2>Ingreso {data.year}</h2><p className="kpi">{mxn(data.totales.ingreso)}</p>
              <p className="muted">de las líneas con costo conocido</p></section>
            <section className="card"><h2>Utilidad bruta</h2>
              <p className={`kpi ${data.totales.utilidadBruta >= 0 ? 'pos' : 'neg'}`}>{mxn(data.totales.utilidadBruta)}</p>
              <p className="muted">margen {pct(data.totales.margenBruto)} · antes de estructura</p></section>
            <section className="card"><h2>Utilidad de operación</h2>
              <p className={`kpi ${data.totales.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(data.totales.utilidad)}</p>
              <p className="muted">después de la nómina de ventas, refacciones y administración</p></section>
            {data.totales.ingresoSinCosto > 0 && (
              <section className="card"><h2>Fuera del margen</h2>
                <p className="kpi neg">{mxn(data.totales.ingresoSinCosto)}</p>
                <p className="muted">unidades vendidas cuyo costo de compra no se conoce</p></section>
            )}
          </div>

          <section className="card">
            <h2>Por línea de negocio</h2>
            <table>
              <thead><tr><th>Línea</th><th className="num">Ingreso</th><th className="num">Costo</th><th className="num">Utilidad</th><th className="num">Margen</th><th>Detalle</th></tr></thead>
              <tbody>
                {data.lineas.map((l) => (
                  <tr key={l.clave}>
                    <td>{l.nombre}</td>
                    <td className="num">{mxn(l.ingreso)}</td>
                    <td className="num">{l.costo == null ? <span className="muted">n/d</span> : mxn(l.costo)}</td>
                    <td className={`num ${l.utilidad != null && l.utilidad < 0 ? 'neg' : ''}`}>
                      {l.utilidad == null ? <span className="muted">n/d</span> : mxn(l.utilidad)}
                    </td>
                    <td className="num">{pct(l.margen)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {l.unidades != null ? `${l.unidades} unidad(es)${l.sinCosto ? ` · ${l.sinCosto} sin costo` : ''}` : ''}
                      {l.ordenes != null ? `${l.ordenes} orden(es)` : ''}
                      {l.piezas != null ? `${l.piezas} piezas` : ''}
                      {l.costoEstimado ? ' · costo estimado' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.gastos?.some((g) => g.monto > 0) && (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Estructura (bajo el margen bruto)</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {data.gastos.filter((g) => g.monto > 0).map((g) => (
                    <tr key={g.clave}><td>{g.nombre}</td><td className="num neg">−{mxn(g.monto)}</td></tr>
                  ))}
                  <tr>
                    <td><b>Utilidad de operación</b></td>
                    <td className={`num ${data.totales.utilidad >= 0 ? 'pos' : 'neg'}`}><b>{mxn(data.totales.utilidad)}</b></td>
                  </tr>
                </tbody>
              </table>
            )}
            <ul className="muted" style={{ fontSize: 12, marginTop: 10, paddingLeft: 18 }}>
              {data.notas.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </section>

          {data.nomina?.recibos > 0 && (
            <div className="cards">
              <section className="card">
                <h2>Nómina por línea</h2>
                <p className="muted">{mxn(data.nomina.total)} en {data.nomina.recibos.toLocaleString('es-MX')} recibos</p>
                <table>
                  <thead><tr><th>Línea</th><th className="num">Nómina</th><th className="num">Recibos</th></tr></thead>
                  <tbody>
                    {data.nomina.porLinea.map((n) => (
                      <tr key={n.linea}>
                        <td>{n.linea}</td>
                        <td className="num">{mxn(n.monto)}</td>
                        <td className="num">{n.recibos.toLocaleString('es-MX')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="card">
                <h2>Nómina por plaza</h2>
                <p className="muted">del atributo Departamento del CFDI de nómina</p>
                <table>
                  <thead><tr><th>Plaza</th><th className="num">Nómina</th></tr></thead>
                  <tbody>
                    {data.nomina.porSucursal.map((s) => (
                      <tr key={s.sucursal}><td>{s.sucursal}</td><td className="num">{mxn(s.monto)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          <section className="card">
            <h2>Mes a mes</h2>
            <table>
              <thead><tr><th>Mes</th><th className="num">Nuevas</th><th className="num">Seminuevos</th><th className="num">Mano de obra</th><th className="num">Refacciones</th></tr></thead>
              <tbody>
                {data.porMes.map((m) => (
                  <tr key={m.mes}>
                    <td>{MESES[m.mes - 1]}</td>
                    <td className="num">{mxn(m.nuevas)}</td>
                    <td className="num">{mxn(m.seminuevas)}</td>
                    <td className="num">{mxn(m.manoObra)}</td>
                    <td className="num">{mxn(m.refacciones)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

function PorUnidad() {
  const { activeCompany } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try { setData(await apiFetch(`/api/automotriz/rentabilidad?companyId=${activeCompany.id}&year=${year}`)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, year])

  useEffect(() => { cargar() }, [cargar])

  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <div className="head-actions" style={{ marginBottom: 14 }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Reconstruyendo la utilidad por VIN…</p> : data && (
        <>
          <div className="cards">
            <section className="card"><h2>Unidades vendidas</h2><p className="kpi">{data.resumen.unidades}</p><p className="muted">en {data.year}</p></section>
            <section className="card"><h2>Venta</h2><p className="kpi">{mxn(data.resumen.venta)}</p><p className="muted">sin IVA</p></section>
            <section className="card">
              <h2>Utilidad</h2>
              <p className={`kpi ${data.resumen.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(data.resumen.utilidad)}</p>
              <p className="muted">
                margen {pct(data.resumen.margen)}{data.resumen.notasCredito > 0 ? ` · incluye ${mxn(data.resumen.notasCredito)} de notas de crédito` : ''}
                {data.resumen.incompletas?.unidades > 0 && (
                  <> · <span className="neg">{data.resumen.incompletas.unidades} unidad(es) con costo incompleto ({mxn(data.resumen.incompletas.venta)} de venta) excluidas</span></>
                )}
              </p>
            </section>
          </div>

          <div className="cards">
            <section className="card">
              <h2>Por mes</h2>
              <table>
                <thead><tr><th>Mes</th><th className="num">Uds.</th><th className="num">Venta</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {data.porMes.map((m) => (
                    <tr key={m.clave}>
                      <td>{MESES[Number(m.clave.slice(5)) - 1]}</td>
                      <td className="num">{m.unidades}</td>
                      <td className="num">{mxn(m.venta)}</td>
                      <td className={`num ${m.utilidad < 0 ? 'neg' : ''}`}>{mxn(m.utilidad)}</td>
                      <td className="num">{pct(m.margen)}</td>
                    </tr>
                  ))}
                  {data.porMes.length === 0 && <tr><td colSpan={5} className="muted">Sin ventas en {data.year}.</td></tr>}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>Por marca</h2>
              <table>
                <thead><tr><th>Marca</th><th className="num">Uds.</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {data.porMarca.slice(0, 10).map((m) => (
                    <tr key={m.clave}><td>{m.clave}</td><td className="num">{m.unidades}</td><td className={`num ${m.utilidad < 0 ? 'neg' : ''}`}>{mxn(m.utilidad)}</td><td className="num">{pct(m.margen)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>Por vendedor</h2>
              {data.porVendedor.length === 0 ? <p className="muted">Aún sin vendedores asignados en las ventas — asígnalos en el detalle de cada unidad para ver comisiones y utilidad por persona.</p> : (
                <table>
                  <thead><tr><th>Vendedor</th><th className="num">Uds.</th><th className="num">Utilidad</th></tr></thead>
                  <tbody>
                    {data.porVendedor.map((m) => (
                      <tr key={m.clave}><td>{m.clave}</td><td className="num">{m.unidades}</td><td className="num">{mxn(m.utilidad)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card">
            <h2>Unidades vendidas en {data.year}</h2>
            <table>
              <thead><tr><th>VIN</th><th>Unidad</th><th>Cliente</th><th className="num">Venta</th><th className="num">Costo</th><th className="num">Costos +</th><th className="num">NC −</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
              <tbody>
                {data.unidades.map((u) => (
                  <tr key={u.id}>
                    <td><Link to={`/vehiculos/${u.id}`} className="mono" style={{ fontSize: 11 }}>{u.vin}</Link></td>
                    <td>{u.unidad}</td>
                    <td>{u.cliente ?? '—'}</td>
                    <td className="num">{mxn(u.precioVenta)}</td>
                    <td className="num">{u.costoIncompleto ? <span className="badge badge-CANCELADO">sin costo</span> : mxn(u.costoCompra)}</td>
                    <td className="num">{u.costosAdicionales + u.interesPiso > 0 ? mxn(u.costosAdicionales + u.interesPiso) : '—'}</td>
                    <td className="num">{u.notasCredito > 0 ? <span className="pos">{mxn(u.notasCredito)}</span> : '—'}</td>
                    <td className={`num ${u.utilidad < 0 ? 'neg' : ''}`}><strong>{mxn(u.utilidad)}</strong></td>
                    <td className="num">{pct(u.margen)}</td>
                  </tr>
                ))}
                {data.unidades.length === 0 && <tr><td colSpan={9} className="muted">Sin ventas registradas en {data.year}.</td></tr>}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>Utilidad = venta − costo de compra − fletes/costos + notas de crédito − interés piso − comisión. Las unidades "sin costo" se compraron antes del archivo de 5 años del SAT: captura su costo real desde el detalle de la unidad para que entren a la utilidad.</p>
          </section>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Rentabilidad de las ventas: la síntesis de todo lo derivado de los CFDIs —
// precio de venta − costo real (compra + fletes − notas de crédito) − interés
// piso − comisión, por unidad y agregado por mes / marca / vendedor.
export default function Rentabilidad() {
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
      <header className="page-head">
        <h1>Rentabilidad</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </header>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Reconstruyendo la utilidad por VIN…</p> : data && (
        <>
          <div className="cards">
            <section className="card"><h2>Unidades vendidas</h2><p className="kpi">{data.resumen.unidades}</p><p className="muted">en {data.year}</p></section>
            <section className="card"><h2>Venta</h2><p className="kpi">{mxn(data.resumen.venta)}</p><p className="muted">sin IVA</p></section>
            <section className="card">
              <h2>Utilidad</h2>
              <p className={`kpi ${data.resumen.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(data.resumen.utilidad)}</p>
              <p className="muted">margen {pct(data.resumen.margen)}{data.resumen.notasCredito > 0 ? ` · incluye ${mxn(data.resumen.notasCredito)} de notas de crédito` : ''}</p>
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
                    <td className="num">{mxn(u.costoCompra)}</td>
                    <td className="num">{u.costosAdicionales + u.interesPiso > 0 ? mxn(u.costosAdicionales + u.interesPiso) : '—'}</td>
                    <td className="num">{u.notasCredito > 0 ? <span className="pos">{mxn(u.notasCredito)}</span> : '—'}</td>
                    <td className={`num ${u.utilidad < 0 ? 'neg' : ''}`}><strong>{mxn(u.utilidad)}</strong></td>
                    <td className="num">{pct(u.margen)}</td>
                  </tr>
                ))}
                {data.unidades.length === 0 && <tr><td colSpan={9} className="muted">Sin ventas registradas en {data.year}.</td></tr>}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>Utilidad = venta − costo de compra − fletes/costos + notas de crédito − interés piso − comisión. Las unidades con costo $0 aún esperan su CFDI de compra (fuera del rango descargado del SAT).</p>
          </section>
        </>
      )}
    </div>
  )
}

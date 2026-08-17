import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const per = (p) => `${MESES[p.mes - 1]} ${p.anio}`

// Contabilidad (CE): la balanza PRESENTADA al SAT, tal cual — lo que el
// contador declaró, no lo que el motor derivó (plan CE-first del hub). El
// selector sólo ofrece períodos que EXISTEN presentados; cada cuenta drillea a
// su serie mensual completa (saldoIni/debe/haber/saldoFin).
export default function ContabilidadCE() {
  const { activeCompany } = useAuth()
  const [periodos, setPeriodos] = useState(null)
  const [sel, setSel] = useState(null) // { anio, mes }
  const [balanza, setBalanza] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [cuenta, setCuenta] = useState(null) // drill-down: { cuenta, serie }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // 1. Los períodos presentados — el último es el default.
  useEffect(() => {
    if (!activeCompany?.id) return
    setError(null)
    apiFetch(`/api/contabilidad/ce-serie?companyId=${activeCompany.id}&periodos=1`)
      .then((d) => {
        setPeriodos(d.periodos)
        if (d.periodos.length > 0) setSel(d.periodos[d.periodos.length - 1])
        else setLoading(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [activeCompany?.id])

  // 2. La balanza del período elegido.
  const cargar = useCallback(async () => {
    if (!activeCompany?.id || !sel) return
    setLoading(true); setError(null); setCuenta(null)
    try {
      setBalanza(await apiFetch(`/api/contabilidad/ce-serie?companyId=${activeCompany.id}&anio=${sel.anio}&mes=${sel.mes}`))
    } catch (err) { setError(err.message); setBalanza(null) } finally { setLoading(false) }
  }, [activeCompany?.id, sel])

  useEffect(() => { cargar() }, [cargar])

  // 3. Drill-down: la serie mensual de una cuenta.
  const abrirCuenta = async (numCta) => {
    setError(null)
    try {
      setCuenta(await apiFetch(`/api/contabilidad/ce-serie?companyId=${activeCompany.id}&cuenta=${encodeURIComponent(numCta)}`))
    } catch (err) { setError(err.message) }
  }

  const filas = useMemo(() => {
    if (!balanza) return []
    const f = filtro.trim().toUpperCase()
    if (!f) return balanza.cuentas
    return balanza.cuentas.filter((c) => c.numCta.includes(f) || (c.nombre ?? '').toUpperCase().includes(f))
  }, [balanza, filtro])

  const totales = useMemo(() => {
    if (!balanza) return null
    let debe = 0, haber = 0, conMovimiento = 0
    for (const c of balanza.cuentas) {
      debe += c.debe; haber += c.haber
      if (Math.abs(c.debe) > 0.005 || Math.abs(c.haber) > 0.005) conMovimiento++
    }
    return { debe, haber, conMovimiento, cuentas: balanza.cuentas.length }
  }, [balanza])

  const nombreDe = (numCta) =>
    balanza?.cuentas.find((c) => c.numCta === numCta)?.nombre ?? null

  return (
    <div>
      <header className="page-head">
        <h1>Contabilidad (CE)</h1>
        <span className="glosa">
          la balanza presentada al SAT, al centavo — lo declarado, no lo derivado
          {periodos?.length > 0 && ` · ${periodos.length} períodos presentados (${per(periodos[0])} → ${per(periodos[periodos.length - 1])})`}
        </span>
        <div className="head-actions">
          {periodos?.length > 0 && sel && (
            <select
              value={`${sel.anio}-${sel.mes}`}
              onChange={(e) => {
                const [anio, mes] = e.target.value.split('-').map(Number)
                setSel({ anio, mes })
              }}
              style={{ width: 'auto' }}
            >
              {periodos.map((p) => (
                <option key={`${p.anio}-${p.mes}`} value={`${p.anio}-${p.mes}`}>{per(p)}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo la balanza presentada…</p>}
      {periodos?.length === 0 && !loading && (
        <p className="muted">
          Esta empresa no tiene balanzas de Contabilidad Electrónica importadas todavía.
        </p>
      )}

      {/* ── Drill-down: la serie mensual de UNA cuenta ── */}
      {cuenta && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0 }}>
              {cuenta.cuenta}
              {nombreDe(cuenta.cuenta) && <span className="muted" style={{ fontWeight: 400 }}> · {nombreDe(cuenta.cuenta)}</span>}
            </h2>
            <button type="button" className="ghost" onClick={() => setCuenta(null)}>Cerrar serie</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th style={{ textAlign: 'right' }}>Saldo inicial</th>
                  <th style={{ textAlign: 'right' }}>Cargos</th>
                  <th style={{ textAlign: 'right' }}>Abonos</th>
                  <th style={{ textAlign: 'right' }}>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {cuenta.serie.map((s) => (
                  <tr key={`${s.anio}-${s.mes}`}
                      style={sel && s.anio === sel.anio && s.mes === sel.mes ? { background: 'var(--row-hover, rgba(0,0,0,.04))' } : undefined}>
                    <td>{per(s)}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(s.saldoIni)}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(s.debe)}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(s.haber)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{mxn(s.saldoFin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {balanza && !loading && (
        <>
          <div className="kpi-strip densa" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="kpi-item">
              <span className="kpi-label">Cuentas presentadas</span>
              <span className="kpi">{totales.cuentas.toLocaleString('es-MX')}</span>
              <span className="kpi-sub">hojas de la balanza · {totales.conMovimiento.toLocaleString('es-MX')} con movimiento</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Cargos del período</span>
              <span className="kpi">{mxn(totales.debe)}</span>
              <span className="kpi-sub">suma de debe</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Abonos del período</span>
              <span className="kpi">{mxn(totales.haber)}</span>
              <span className="kpi-sub">suma de haber</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Cargos − abonos</span>
              <span className="kpi" style={{ color: Math.abs(totales.debe - totales.haber) < 1 ? 'var(--ok)' : 'var(--danger)' }}>
                {mxn(totales.debe - totales.haber)}
              </span>
              <span className="kpi-sub">una balanza presentada cuadra en cero</span>
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <input
              type="search"
              placeholder="Filtrar por número o nombre de cuenta…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Nombre</th>
                  <th style={{ textAlign: 'right' }}>Saldo inicial</th>
                  <th style={{ textAlign: 'right' }}>Cargos</th>
                  <th style={{ textAlign: 'right' }}>Abonos</th>
                  <th style={{ textAlign: 'right' }}>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.numCta} onClick={() => abrirCuenta(c.numCta)} style={{ cursor: 'pointer' }}
                      title="Ver la serie mensual completa">
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.numCta}</td>
                    <td>{c.nombre ?? <span className="muted">— sin nombre en el catálogo —</span>}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(c.saldoIni)}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(c.debe)}</td>
                    <td style={{ textAlign: 'right' }}>{mxn(c.haber)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{mxn(c.saldoFin)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={6} className="muted">Ninguna cuenta coincide con «{filtro}».</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

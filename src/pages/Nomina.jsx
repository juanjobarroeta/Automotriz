import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—')
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

// El periodo viene como "2024-01-01/2024-01-15"; se muestra legible.
const periodo = (p) => {
  if (!p) return '—'
  const [a, b] = p.split('/')
  return b ? `${dia(a)} → ${dia(b)}` : dia(a)
}
const REGIMEN = { '02': 'Sueldos', '05': 'Asimilados' }
const PERIODICIDAD = { '04': 'Quincenal', '05': 'Mensual', '02': 'Semanal', '03': 'Catorcenal' }
const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
// Ejercicios seleccionables en la pestaña IMSS: desde el primer año con volumen
// real de nómina hasta el actual (el endpoint elige el más reciente por default).
const ANIOS = (() => { const y = new Date().getUTCFullYear(); const a = []; for (let i = 2023; i <= y; i++) a.push(i); return a })()

// Nómina en AutomotrizPro: la agencia ya tiene todo su histórico de nómina
// derivado de los CFDIs en el hub (empleados, corridas), pero no se veía aquí.
// Esta pantalla lo surfacea — plantilla y corridas — sobre las APIs del hub.
export default function Nomina() {
  const { activeCompany } = useAuth()
  const [tab, setTab] = useState('empleados')
  const [roster, setRoster] = useState(null)
  const [corridas, setCorridas] = useState(null)
  const [incluirBajas, setIncluirBajas] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imss, setImss] = useState(null)
  const [imssAnio, setImssAnio] = useState(null)
  const [imssLoading, setImssLoading] = useState(false)
  const [imssErr, setImssErr] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const [r, c] = await Promise.all([
        apiFetch(`/api/nomina/empleado?companyId=${activeCompany.id}${incluirBajas ? '&incluirBajas=1' : ''}`),
        apiFetch(`/api/nomina/run?companyId=${activeCompany.id}`),
      ])
      setRoster(r); setCorridas(Array.isArray(c) ? c : [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, incluirBajas])

  useEffect(() => { cargar() }, [cargar])

  const cargarImss = useCallback(async (anio) => {
    if (!activeCompany?.id) return
    setImssLoading(true); setImssErr(null)
    try {
      const d = await apiFetch(`/api/nomina/imss?companyId=${activeCompany.id}${anio ? `&anio=${anio}` : ''}`)
      setImss(d); setImssAnio(d.anio)
    } catch (err) { setImssErr(err.message) } finally { setImssLoading(false) }
  }, [activeCompany?.id])

  // Cambiar de empresa invalida el IMSS cargado; se re-lee al abrir la pestaña.
  useEffect(() => { setImss(null); setImssAnio(null) }, [activeCompany?.id])
  // Carga perezosa: sólo al entrar a la pestaña IMSS o al cambiar de ejercicio
  // (el año se cambia poniendo imss en null, y este efecto lo vuelve a pedir).
  useEffect(() => {
    if (tab === 'imss' && !imss && !imssLoading) cargarImss(imssAnio)
  }, [tab, imss, imssLoading, imssAnio, cargarImss])

  const empleados = useMemo(() => {
    if (!roster?.empleados) return []
    const f = q.trim().toUpperCase()
    if (!f) return roster.empleados
    return roster.empleados.filter((e) =>
      `${e.nombreCompleto} ${e.rfc} ${e.puesto ?? ''} ${e.departamento ?? ''} ${e.numEmpleado ?? ''}`.toUpperCase().includes(f))
  }, [roster, q])

  const kpiCorridas = useMemo(() => {
    if (!corridas?.length) return null
    const ult = corridas[0]
    const nomAnual = corridas
      .filter((c) => new Date(c.fechaPago).getUTCFullYear() === new Date(ult.fechaPago).getUTCFullYear())
      .reduce((a, c) => a + (c.totalNeto ?? 0), 0)
    return { ultima: ult, corridas: corridas.length, nomAnual }
  }, [corridas])

  return (
    <div>
      <header className="page-head">
        <h1>Nómina</h1>
        <span className="glosa">
          plantilla y corridas derivadas de tus CFDIs de nómina
          {roster && ` · ${roster.activos} activos${roster.total > roster.activos ? ` de ${roster.total}` : ''}`}
        </span>
        <div className="head-actions" style={{ alignSelf: 'center' }}>
          <div style={{ display: 'flex' }}>
            <button type="button" className={tab === 'empleados' ? undefined : 'ghost'}
              onClick={() => setTab('empleados')}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>Empleados</button>
            <button type="button" className={tab === 'corridas' ? undefined : 'ghost'}
              onClick={() => setTab('corridas')}
              style={{ borderRadius: 0, marginLeft: -1 }}>Corridas</button>
            <button type="button" className={tab === 'imss' ? undefined : 'ghost'}
              onClick={() => setTab('imss')}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}>IMSS</button>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo la nómina…</p>}

      {kpiCorridas && tab !== 'imss' && (
        <div className="kpi-strip densa">
          <div className="kpi-item">
            <div className="kpi-label">Empleados activos</div>
            <div className="kpi">{roster?.activos ?? '—'}</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Última corrida</div>
            <div className="kpi">{mxn(kpiCorridas.ultima.totalNeto)}</div>
            <div className="kpi-sub">{periodo(kpiCorridas.ultima.periodo)}</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Corridas registradas</div>
            <div className="kpi">{kpiCorridas.corridas}</div>
          </div>
        </div>
      )}

      {/* ── Empleados ── */}
      {!loading && tab === 'empleados' && roster && (
        <section className="card">
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
            <input placeholder="Buscar por nombre, RFC, puesto, depto…" value={q}
              onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} />
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={incluirBajas}
                onChange={(e) => setIncluirBajas(e.target.checked)} /> incluir bajas
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Empleado</th><th>RFC</th><th>Puesto</th><th>Departamento</th>
                  <th>Régimen</th><th>Periodicidad</th><th style={num}>Salario diario</th><th>Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((e) => (
                  <tr key={e.id} style={!e.isActive ? { opacity: 0.55 } : undefined}>
                    <td>
                      {e.nombreCompleto}
                      {!e.isActive && <span className="badge" style={{ marginLeft: 6 }}>baja {dia(e.fechaBaja)}</span>}
                    </td>
                    <td className="mono">{e.rfc}</td>
                    <td>{e.puesto ?? '—'}</td>
                    <td>{e.departamento ?? '—'}</td>
                    <td>{REGIMEN[e.tipoRegimen] ?? e.tipoRegimen}</td>
                    <td>{PERIODICIDAD[e.periodicidadPago] ?? e.periodicidadPago}</td>
                    <td style={num}>{mxn(e.salarioDiario)}</td>
                    <td>{dia(e.fechaIngreso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {empleados.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Sin empleados que coincidan.</p>}
        </section>
      )}

      {/* ── Corridas ── */}
      {!loading && tab === 'corridas' && corridas && (
        <section className="card">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Periodo</th><th>Fecha de pago</th><th style={num}>Recibos</th>
                  <th style={num}>Percepciones</th><th style={num}>Deducciones</th><th style={num}>Neto</th><th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => (
                  <tr key={c.id}>
                    <td>{periodo(c.periodo)}</td>
                    <td>{dia(c.fechaPago)}</td>
                    <td style={num}>{c._count?.items ?? '—'}</td>
                    <td style={num}>{mxn(c.totalPercepciones)}</td>
                    <td style={num}>{mxn(c.totalDeducciones)}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{mxn(c.totalNeto)}</td>
                    <td>{c.origen === 'SAT' ? <span className="badge">del SAT</span> : c.origen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {corridas.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Sin corridas registradas.</p>}
        </section>
      )}

      {/* ── IMSS ── */}
      {tab === 'imss' && (
        <section className="card">
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Ejercicio
              <select value={imssAnio ?? ANIOS[ANIOS.length - 1]} style={{ width: 'auto' }}
                onChange={(e) => { setImssAnio(Number(e.target.value)); setImss(null) }}>
                {ANIOS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <span className="glosa">obrero se retiene del recibo · patronal es costo del patrón (calculado)</span>
          </div>

          {imssErr && <div className="error">{imssErr}</div>}
          {imssLoading && <p className="muted">Calculando IMSS…</p>}

          {imss && !imssLoading && (
            <>
              <div className="kpi-strip densa">
                <div className="kpi-item">
                  <div className="kpi-label">Obrero (retenido)</div>
                  <div className="kpi">{mxn(imss.totales.obrero)}</div>
                </div>
                <div className="kpi-item">
                  <div className="kpi-label">Patronal (costo)</div>
                  <div className="kpi">{mxn(imss.totales.patronal)}</div>
                  {imss.reconciliacion?.patronalSinPoblar && <div className="kpi-sub">falta poblar</div>}
                </div>
                <div className="kpi-item">
                  <div className="kpi-label">INFONAVIT</div>
                  <div className="kpi">{mxn(imss.totales.infonavit)}</div>
                </div>
                <div className="kpi-item">
                  <div className="kpi-label">vs CE (lado IMSS)</div>
                  <div className="kpi">{imss.reconciliacion?.ratio ? `${imss.reconciliacion.ratio.toFixed(2)}×` : '—'}</div>
                  <div className="kpi-sub">decl. {mxn(imss.declarado?.ladoImssPatronal)}</div>
                </div>
              </div>

              {imss.reconciliacion?.patronalSinPoblar && (
                <div className="muted" style={{ margin: '8px 0' }}>
                  El costo patronal aún no está calculado en la base — se puebla corriendo{' '}
                  <span className="mono">scripts/backfill-imss-patronal.ts</span> en el hub.
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Mes</th><th style={num}>Recibos</th><th style={num}>Obrero</th>
                      <th style={num}>Patronal</th><th style={num}>INFONAVIT</th><th style={num}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imss.meses.map((m) => (
                      <tr key={m.mes}>
                        <td>{MES[m.mes] ?? m.mes}</td>
                        <td style={num}>{m.recibos}</td>
                        <td style={num}>{mxn(m.obrero)}</td>
                        <td style={num}>{mxn(m.patronal)}</td>
                        <td style={num}>{mxn(m.infonavit)}</td>
                        <td style={{ ...num, fontWeight: 600 }}>{mxn(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {imss.meses.length > 0 && (
                    <tfoot>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total {imss.anio}</td>
                        <td style={num}>{imss.totales.recibos}</td>
                        <td style={num}>{mxn(imss.totales.obrero)}</td>
                        <td style={num}>{mxn(imss.totales.patronal)}</td>
                        <td style={num}>{mxn(imss.totales.infonavit)}</td>
                        <td style={{ ...num, fontWeight: 700 }}>{mxn(imss.totales.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {imss.meses.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Sin recibos en {imss.anio}.</p>}

              <p className="glosa" style={{ marginTop: 10 }}>
                «vs CE» compara el patronal calculado contra lo declarado en la Contabilidad Electrónica
                (cuotas IMSS + SAR). La cuenta 2407 «Retención IMSS» ({mxn(imss.declarado?.clearingRetencionImss)})
                es el paso de la liquidación SUA, no la cuota obrera.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  )
}

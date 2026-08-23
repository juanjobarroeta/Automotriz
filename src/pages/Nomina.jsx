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
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}>Corridas</button>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo la nómina…</p>}

      {kpiCorridas && (
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
    </div>
  )
}

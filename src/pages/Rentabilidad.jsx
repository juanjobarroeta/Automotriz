import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Barra de herramientas de la pantalla (año, periodo): controles alineados a la
// izquierda, bajo el encabezado. Ver DESIGN.md §6 «Barra de herramientas».
const barra = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }
// Columna secundaria de una tabla: el dato de apoyo va en tinta más clara.
const sec = { color: 'var(--ink-3)' }
// Notas al pie de una tarjeta: renglones de 11.5px, sin caja.
const notas = { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }
const nota = { fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }
// Tab segmentado (DESIGN.md §6): activo en tinta, inactivo en blanco.
const tab = (activo) => ({ background: activo ? 'var(--ink)' : 'var(--surface)', color: activo ? '#FFFFFF' : 'var(--ink-3)' })

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
        <span className="glosa">venta − costo de compra − costos + notas de crédito − interés de piso − comisión</span>
        <div className="head-actions">
          <div className="tabs">
            {/* El fondo va en línea para que el hover del botón primario no
                repinte la pestaña inactiva: el tab segmentado no tiene hover. */}
            <button className={vista === 'LINEAS' ? 'activo' : ''} style={tab(vista === 'LINEAS')} onClick={() => setVista('LINEAS')}>Por línea de negocio</button>
            <button className={vista === 'UNIDAD' ? 'activo' : ''} style={tab(vista === 'UNIDAD')} onClick={() => setVista('UNIDAD')}>Por unidad</button>
          </div>
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
  // periodo: 'ANIO' (ejercicio completo) | 'YTD' (al día) | '1'..'12' (un mes)
  const [periodo, setPeriodo] = useState('ANIO')
  const [abierto, setAbierto] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    const extra = periodo === 'ANIO' ? '' : periodo === 'YTD' ? '&ytd=1' : `&month=${periodo}`
    try { setData(await apiFetch(`/api/automotriz/resultados?companyId=${activeCompany.id}&year=${year}${extra}`)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, year, periodo])

  useEffect(() => { cargar() }, [cargar])
  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)
  const toggle = (k) => setAbierto((a) => (a === k ? null : k))
  // Las líneas de unidades comparten un mismo detalle: las ventas del periodo.
  const detalleDe = (clave) =>
    clave === 'unidades_nuevas' ? 'NUEVO' : clave === 'unidades_seminuevas' ? 'SEMINUEVO' : null

  return (
    <div>
      <div style={barra}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }}>
          <option value="ANIO">Ejercicio completo</option>
          <option value="YTD">Al día (YTD)</option>
          {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
        {data?.periodo && <span className="muted">{data.periodo}</span>}
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Armando el estado de resultados…</p> : data && (
        <>
          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="kpi-label">Ingreso {data.year}</span>
              <span className="kpi">{mxn(data.totales.ingreso)}</span>
              <span className="kpi-sub">de las líneas con costo conocido</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Utilidad bruta</span>
              <span className={`kpi ${data.totales.utilidadBruta >= 0 ? 'pos' : 'neg'}`}>{mxn(data.totales.utilidadBruta)}</span>
              <span className="kpi-sub">margen {pct(data.totales.margenBruto)} · antes de estructura</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Utilidad de operación</span>
              <span className={`kpi ${data.totales.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(data.totales.utilidad)}</span>
              <span className="kpi-sub">después de la nómina de ventas, refacciones y administración</span>
            </div>
            {data.totales.ingresoSinCosto > 0 && (
              <div className="kpi-item">
                <span className="kpi-label">Fuera del margen</span>
                <span className="kpi neg">{mxn(data.totales.ingresoSinCosto)}</span>
                <span className="kpi-sub">unidades vendidas cuyo costo de compra no se conoce</span>
              </div>
            )}
          </div>

          <section className="card">
            <div className="card-head">Por línea de negocio</div>
            <table>
              <thead><tr><th>Línea</th><th className="num">Ingreso</th><th className="num">Costo</th><th className="num">Utilidad</th><th className="num">Margen</th><th>Detalle</th></tr></thead>
              <tbody>
                {data.lineas.map((l) => {
                  const tipo = detalleDe(l.clave)
                  const ventas = tipo ? (data.detalle?.ventas ?? []).filter((v) => v.tipo === tipo) : []
                  const abre = tipo && ventas.length > 0
                  return (
                    <Fragment key={l.clave}>
                      <tr
                        onClick={abre ? () => toggle(l.clave) : undefined}
                        style={abre ? { cursor: 'pointer' } : undefined}
                      >
                        <td style={{ fontSize: 13 }}>{abre ? `${abierto === l.clave ? '▾' : '▸'} ` : ''}{l.nombre}</td>
                        <td className="num">{mxn(l.ingreso)}</td>
                        <td className="num" style={sec}>{l.costo == null ? <span className="muted">n/d</span> : mxn(l.costo)}</td>
                        <td className={`num ${l.utilidad != null && l.utilidad < 0 ? 'neg' : ''}`}>
                          {l.utilidad == null ? <span className="muted">n/d</span> : mxn(l.utilidad)}
                        </td>
                        <td className="num" style={sec}>{pct(l.margen)}</td>
                        <td className="muted">
                          {l.unidades != null ? `${l.unidades} unidad(es)${l.sinCosto ? ` · ${l.sinCosto} sin costo` : ''}` : ''}
                          {l.ordenes != null ? `${l.ordenes} orden(es)` : ''}
                          {l.piezas != null ? `${l.piezas} piezas` : ''}
                          {l.costoEstimado ? ' · costo estimado' : ''}
                          {l.sinCostoDirecto ? 'sin costo directo · front end, fuera de absorción' : ''}
                        </td>
                      </tr>
                      {abierto === l.clave && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <VentasDetalle ventas={ventas} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {data.gastos?.some((g) => g.monto > 0) && (
              <div className="card-divider">
                <table>
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
              </div>
            )}
            <div style={notas}>
              {data.notas.map((n, i) => <div key={i} style={nota}>{n}</div>)}
            </div>
          </section>

          {data.nomina?.recibos > 0 && (
            <div className="cards">
              <section className="card">
                <div className="card-head">Nómina por línea</div>
                <p className="muted" style={{ margin: '0 0 10px' }}>
                  {mxn(data.nomina.total)} en {data.nomina.recibos.toLocaleString('es-MX')} recibos ·
                  percepciones {mxn(data.nomina.percepciones)} + cuotas patronales estimadas{' '}
                  {mxn(data.nomina.cuotasPatronales)}
                </p>
                <table>
                  <thead><tr><th>Línea</th><th className="num">Percepciones</th><th className="num">Cuotas patr.</th><th className="num">Costo total</th></tr></thead>
                  <tbody>
                    {data.nomina.porLinea.map((n) => {
                      const gente = (data.detalle?.nomina ?? []).filter((e) => e.linea === n.linea)
                      const clave = `nom_${n.linea}`
                      return (
                        <Fragment key={n.linea}>
                          <tr
                            onClick={gente.length ? () => toggle(clave) : undefined}
                            style={gente.length ? { cursor: 'pointer' } : undefined}
                          >
                            <td style={{ fontSize: 13 }}>{gente.length ? `${abierto === clave ? '▾' : '▸'} ` : ''}{n.linea}
                              {gente.length > 0 && <span className="muted"> · {gente.length} persona(s)</span>}
                            </td>
                            <td className="num" style={sec}>{mxn(n.percepciones)}</td>
                            <td className="num" style={sec}>{mxn(n.cuotasPatronales)}</td>
                            <td className="num">{mxn(n.monto)}</td>
                          </tr>
                          {abierto === clave && (
                            <tr><td colSpan={4} style={{ padding: 0 }}><EmpleadosDetalle gente={gente} /></td></tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </section>
              <section className="card">
                <div className="card-head">Nómina por plaza</div>
                <p className="muted" style={{ margin: '0 0 10px' }}>del atributo Departamento del CFDI de nómina</p>
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

          {periodo !== 'ANIO' && periodo !== 'YTD' ? null : (
          <section className="card">
            <div className="card-head">Mes a mes</div>
            <table>
              <thead><tr><th>Mes</th><th className="num">Nuevas</th><th className="num">Seminuevos</th><th className="num">Mano de obra</th><th className="num">Refacciones</th></tr></thead>
              <tbody>
                {data.porMes.map((m) => (
                  <tr key={m.mes}>
                    <td style={{ fontSize: 13 }}>{MESES[m.mes - 1]}</td>
                    <td className="num">{mxn(m.nuevas)}</td>
                    <td className="num">{mxn(m.seminuevas)}</td>
                    <td className="num">{mxn(m.manoObra)}</td>
                    <td className="num">{mxn(m.refacciones)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          )}
        </>
      )}
    </div>
  )
}

// Cada venta del periodo con su utilidad — el renglón que sostiene el total de
// la línea. Se abre desde la línea, no en otra pantalla.
function VentasDetalle({ ventas }) {
  return (
    <div style={{ padding: '6px 10px', background: 'var(--surface-subtle)' }}>
      <table>
        <thead><tr><th>Fecha</th><th>Unidad</th><th>Cliente</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Utilidad</th></tr></thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td style={sec}>{v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX') : '—'}</td>
              <td>
                <Link to={`/vehiculos/${v.id}`}>{v.unidad}</Link>
                <div className="mono" style={{ color: 'var(--muted-2)' }}>{v.vin}</div>
              </td>
              <td style={sec}>{v.clienteId ? <Link to={`/contactos/${v.clienteId}`}>{v.cliente}</Link> : (v.cliente ?? '—')}</td>
              <td className="num">{mxn(v.precioVenta)}</td>
              <td className="num" style={sec}>{v.costo == null ? <span className="badge badge-danger">sin costo</span> : mxn(v.costo)}</td>
              <td className={`num ${v.utilidad != null && v.utilidad < 0 ? 'neg' : ''}`}>
                {v.utilidad == null ? <span className="muted">n/d</span> : mxn(v.utilidad)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Nómina persona por persona dentro de una línea. El nombre y el puesto salen
// del último recibo del periodo: si alguien cambió de puesto, el costo queda
// en la línea donde trabajó cada quincena.
function EmpleadosDetalle({ gente }) {
  return (
    <div style={{ padding: '6px 10px', background: 'var(--surface-subtle)' }}>
      <table>
        <thead><tr><th>Empleado</th><th>Puesto</th><th>Plaza</th><th className="num">Recibos</th><th className="num">Percepciones</th><th className="num">Cuotas patr.</th><th className="num">Costo</th></tr></thead>
        <tbody>
          {gente.map((e) => (
            <tr key={e.rfc ?? e.empleado}>
              <td>{e.empleado}<div className="mono" style={{ color: 'var(--muted-2)' }}>{e.rfc}</div></td>
              <td style={sec}>{e.puesto ?? '—'}</td>
              <td style={sec}>{e.sucursal ?? '—'}</td>
              <td className="num" style={sec}>{e.recibos}</td>
              <td className="num" style={sec}>{mxn(e.percepciones)}</td>
              <td className="num" style={sec}>{mxn(e.cuotasPatronales)}</td>
              <td className="num">{mxn(e.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Waterfall de una unidad: cada renglón es un movimiento sobre el precio de
// venta y la barra mide su tamaño contra esa venta. Ver DESIGN.md §6.
function DesgloseUnidad({ u, deCuantas }) {
  const base = Math.max(Math.abs(u.precioVenta ?? 0), 1)
  const ancho = (v) => `${Math.min(100, (Math.abs(v ?? 0) / base) * 100)}%`
  const filas = [
    { k: 'venta', etiqueta: 'Venta', valor: u.precioVenta, tinta: 'var(--ink)' },
    { k: 'costo', etiqueta: '− Costo de compra', valor: u.costoCompra, tinta: 'var(--ink-3)' },
    { k: 'costos', etiqueta: '− Fletes y costos adicionales', valor: u.costosAdicionales, tinta: 'var(--ink-3)' },
    { k: 'piso', etiqueta: '− Interés de plan piso', valor: u.interesPiso, tinta: 'var(--ink-3)' },
    { k: 'nc', etiqueta: '+ Notas de crédito', valor: u.notasCredito, tinta: 'var(--ink-3)' },
    { k: 'comision', etiqueta: '− Comisión', valor: u.comision, tinta: 'var(--ink-3)' },
  ].filter((f) => f.k === 'venta' || (f.k === 'costo' && u.costoIncompleto) || (f.valor != null && f.valor !== 0))

  return (
    <section className="card">
      <div className="card-head">
        <span>Desglose por unidad</span>
        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>1 de {deCuantas} · la tabla de abajo trae el resto</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
        <Link to={`/vehiculos/${u.id}`} className="mono">{u.vin}</Link>
        {u.costoIncompleto
          ? <span className="badge badge-danger">sin costo de compra</span>
          : u.utilidad < 0
            ? <span className="badge badge-danger">utilidad negativa</span>
            : <span className="badge badge-neutral">margen {pct(u.margen)}</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, margin: '6px 0 16px' }}>{u.unidad}</div>

      {filas.map((f) => (
        <div className="wf-row" key={f.k}>
          <span className="wf-label">{f.etiqueta}</span>
          <span className="wf-bar">
            <span style={{ width: f.k === 'costo' && u.costoIncompleto ? 0 : ancho(f.valor), background: f.tinta }} />
          </span>
          <span className="wf-value">
            {f.k === 'costo' && u.costoIncompleto ? <span className="muted">n/d</span> : mxn(f.valor)}
          </span>
        </div>
      ))}
      <div className="wf-row total">
        <span className="wf-label">Utilidad</span>
        <span className="wf-bar"><span style={{ width: ancho(u.utilidad), background: 'var(--ink)' }} /></span>
        <span className="wf-value">{mxn(u.utilidad)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16 }}>
        <span className={`kpi ${u.utilidad < 0 ? 'neg' : ''}`} style={{ margin: 0 }}>{mxn(u.utilidad)}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>utilidad real · margen {pct(u.margen)}</span>
      </div>

      <div className="card-note">
        El interés de plan piso se devenga diario mientras la unidad no se vende: esta unidad lleva{' '}
        <b>{mxn(u.interesPiso)}</b> devengados, y cada día más en el piso se los resta a la utilidad.
      </div>
    </section>
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
      <div style={barra}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Reconstruyendo la utilidad por VIN…</p> : data && (
        <>
          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="kpi-label">Unidades vendidas</span>
              <span className="kpi">{data.resumen.unidades}</span>
              <span className="kpi-sub">en {data.year}</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Venta</span>
              <span className="kpi">{mxn(data.resumen.venta)}</span>
              <span className="kpi-sub">sin IVA</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Utilidad</span>
              <span className={`kpi ${data.resumen.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(data.resumen.utilidad)}</span>
              <span className="kpi-sub">
                margen {pct(data.resumen.margen)}{data.resumen.notasCredito > 0 ? ` · incluye ${mxn(data.resumen.notasCredito)} de notas de crédito` : ''}
              </span>
            </div>
            {data.resumen.incompletas?.unidades > 0 && (
              <div className="kpi-item">
                <span className="kpi-label">Fuera del margen</span>
                <span className="kpi neg">{data.resumen.incompletas.unidades}</span>
                <span className="kpi-sub">unidad(es) con costo incompleto ({mxn(data.resumen.incompletas.venta)} de venta) excluidas</span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 16 }}>
            {data.unidades.length > 0
              ? <DesgloseUnidad u={data.unidades[0]} deCuantas={data.unidades.length} />
              : <section className="card"><div className="card-head">Desglose por unidad</div>
                  <p className="muted">Sin ventas registradas en {data.year}.</p></section>}
            <section className="card">
              <div className="card-head">Por mes</div>
              <table>
                <thead><tr><th>Mes</th><th className="num">Uds.</th><th className="num">Venta</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {data.porMes.map((m) => (
                    <tr key={m.clave}>
                      <td style={{ fontSize: 13 }}>{MESES[Number(m.clave.slice(5)) - 1]}</td>
                      <td className="num" style={sec}>{m.unidades}</td>
                      <td className="num">{mxn(m.venta)}</td>
                      <td className={`num ${m.utilidad < 0 ? 'neg' : ''}`}>{mxn(m.utilidad)}</td>
                      <td className="num" style={sec}>{pct(m.margen)}</td>
                    </tr>
                  ))}
                  {data.porMes.length === 0 && <tr><td colSpan={5} className="muted">Sin ventas en {data.year}.</td></tr>}
                </tbody>
              </table>
            </section>
          </div>

          <div className="cards">
            <section className="card">
              <div className="card-head">Por marca</div>
              <table>
                <thead><tr><th>Marca</th><th className="num">Uds.</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {data.porMarca.slice(0, 10).map((m) => (
                    <tr key={m.clave}><td style={{ fontSize: 13 }}>{m.clave}</td><td className="num" style={sec}>{m.unidades}</td><td className={`num ${m.utilidad < 0 ? 'neg' : ''}`}>{mxn(m.utilidad)}</td><td className="num" style={sec}>{pct(m.margen)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card">
              <div className="card-head">Por vendedor</div>
              {data.porVendedor.length === 0 ? <p className="muted">Aún sin vendedores asignados en las ventas — asígnalos en el detalle de cada unidad para ver comisiones y utilidad por persona.</p> : (
                <table>
                  <thead><tr><th>Vendedor</th><th className="num">Uds.</th><th className="num">Utilidad</th></tr></thead>
                  <tbody>
                    {data.porVendedor.map((m) => (
                      <tr key={m.clave}><td style={{ fontSize: 13 }}>{m.clave}</td><td className="num" style={sec}>{m.unidades}</td><td className="num">{mxn(m.utilidad)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-head">Unidades vendidas en {data.year}</div>
            <table>
              <thead><tr><th>VIN</th><th>Unidad</th><th>Cliente</th><th className="num">Venta</th><th className="num">Costo</th><th className="num">Costos +</th><th className="num">NC −</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
              <tbody>
                {data.unidades.map((u) => (
                  <tr key={u.id}>
                    <td><Link to={`/vehiculos/${u.id}`} className="mono">{u.vin}</Link></td>
                    <td style={{ fontSize: 13 }}>{u.unidad}</td>
                    <td style={sec}>{u.cliente ?? '—'}</td>
                    <td className="num">{mxn(u.precioVenta)}</td>
                    <td className="num">{u.costoIncompleto ? <span className="badge badge-danger">sin costo</span> : mxn(u.costoCompra)}</td>
                    <td className="num" style={sec}>{u.costosAdicionales + u.interesPiso > 0 ? mxn(u.costosAdicionales + u.interesPiso) : '—'}</td>
                    <td className="num" style={sec}>{u.notasCredito > 0 ? mxn(u.notasCredito) : '—'}</td>
                    <td className={`num ${u.utilidad < 0 ? 'neg' : ''}`}><strong>{mxn(u.utilidad)}</strong></td>
                    <td className="num" style={sec}>{pct(u.margen)}</td>
                  </tr>
                ))}
                {data.unidades.length === 0 && <tr><td colSpan={9} className="muted">Sin ventas registradas en {data.year}.</td></tr>}
              </tbody>
            </table>
            <div style={notas}>
              <div style={nota}>Utilidad = venta − costo de compra − fletes/costos + notas de crédito − interés de piso − comisión.</div>
              <div style={nota}>Las unidades «sin costo» se compraron antes del archivo de 5 años del SAT: captura su costo real desde el detalle de la unidad para que entren a la utilidad.</div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

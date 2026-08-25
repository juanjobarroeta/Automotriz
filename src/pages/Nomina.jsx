import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch, apiDownload } from '../config/api'
import { useEsMovil } from '../lib/pantalla'
import { VentanaDetalle } from '../components/Primitivos'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const mxn2 = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—')
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

const periodoLegible = (p) => {
  if (!p) return '—'
  const [a, b] = p.split('/')
  return b ? `${dia(a)} → ${dia(b)}` : dia(a)
}
const MES_LARGO = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// El mes corriente SÍ es elegible (a diferencia de Impuestos): la nómina se
// corre y se lee a mitad del mes, no cuando el mes ya cerró.
const MESES_ELEGIBLES = (() => {
  const hoy = new Date()
  const out = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 })
  }
  return out
})()

// El orden es el del handoff: primero cuánto cuesta, luego correrla.
const TABS = [
  ['costo', 'Costo'],
  ['correr', 'Correr nómina'],
  ['corridas', 'Corridas'],
  ['empleados', 'Empleados'],
]

const LINEA = {
  TALLER: { nombre: 'Taller', glosa: 'produce mano de obra facturable' },
  VENTAS: { nombre: 'Ventas', glosa: 'produce unidades vendidas' },
  REFACCIONES: { nombre: 'Refacciones', glosa: 'produce venta de mostrador y órdenes' },
  ADMIN: { nombre: 'Corporativo', glosa: 'estructura — no produce ingreso' },
}
const ORDEN_LINEAS = ['TALLER', 'VENTAS', 'REFACCIONES', 'ADMIN']

const ESTADO_RUN = {
  DRAFT: { texto: 'borrador', tono: '' },
  CALCULATED: { texto: 'sin timbrar', tono: 'aviso' },
  STAMPED: { texto: 'timbrada', tono: 'ok' },
  PAID: { texto: 'pagada', tono: 'ok' },
}

const TIPOS_INCIDENCIA = [
  ['FALTA', 'Falta'],
  ['INCAPACIDAD', 'Incapacidad'],
  ['HORAS_EXTRA', 'Horas extra'],
  ['VACACIONES', 'Vacaciones'],
  ['PERMISO_SIN_GOCE', 'Permiso sin goce'],
  ['BONO', 'Bono'],
  ['COMISION', 'Comisión'],
  ['DESCUENTO', 'Descuento'],
]
const CON_DIAS = ['FALTA', 'INCAPACIDAD', 'VACACIONES', 'PERMISO_SIN_GOCE']
const CON_MONTO = ['BONO', 'COMISION', 'DESCUENTO']

// Registrado vs mínimo: la comparación que separa «en el piso» de «debajo del
// piso» (el IMSS rechaza el alta sub-mínima). Media unidad de tolerancia para
// no marcar como «debajo» un redondeo de captura.
const vsMinimo = (sd, minimo) => {
  if (sd == null || !minimo) return null
  if (sd < minimo - 0.5) return 'debajo'
  if (sd < minimo + 0.5) return 'exacto'
  return 'arriba'
}

export default function Nomina() {
  const { activeCompany } = useAuth()
  const movil = useEsMovil()
  const [tab, setTab] = useState('costo')
  const [sel, setSel] = useState(MESES_ELEGIBLES[0])

  const [roster, setRoster] = useState(null)
  const [corridas, setCorridas] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Estado de resultados del mes elegido y del anterior: la pestaña Costo se
  // sirve del MISMO cálculo que la pantalla de Estado de resultados
  // (nomina.porLinea sale de NominaCosto, un renglón por recibo timbrado),
  // así que las dos pantallas no pueden contradecirse.
  const [res, setRes] = useState(null)
  const [resAnt, setResAnt] = useState(null)
  const [resCargando, setResCargando] = useState(false)

  const cargarBase = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const [r, c] = await Promise.all([
        apiFetch(`/api/nomina/empleado?companyId=${activeCompany.id}&incluirBajas=1`),
        apiFetch(`/api/nomina/run?companyId=${activeCompany.id}`),
      ])
      setRoster(r); setCorridas(Array.isArray(c) ? c : [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id])

  useEffect(() => { cargarBase() }, [cargarBase])

  useEffect(() => {
    if (!activeCompany?.id) return
    let vivo = true
    setResCargando(true)
    const url = (y, m) => `/api/automotriz/resultados?companyId=${activeCompany.id}&year=${y}&month=${m}`
    const ant = sel.m === 1 ? { y: sel.y - 1, m: 12 } : { y: sel.y, m: sel.m - 1 }
    Promise.all([
      apiFetch(url(sel.y, sel.m)),
      apiFetch(url(ant.y, ant.m)).catch(() => null),
    ])
      .then(([a, b]) => { if (vivo) { setRes(a); setResAnt(b) } })
      .catch((err) => { if (vivo) setError(err.message) })
      .finally(() => { if (vivo) setResCargando(false) })
    return () => { vivo = false }
  }, [activeCompany?.id, sel.y, sel.m])

  const salarioMinimo = roster?.salarioMinimoGeneral ?? 315.04

  return (
    <div>
      <header className="page-head">
        <h1>Nómina</h1>
        <span className="glosa">
          derivada de tus CFDIs de nómina
          {roster && ` · ${roster.activos} activos`}
          {corridas && ` · ${corridas.length.toLocaleString('es-MX')} corridas`}
        </span>
        <div className="head-actions" style={{ alignSelf: 'center', display: 'flex', gap: 8 }}>
          <select
            value={`${sel.y}-${sel.m}`}
            style={{ width: 'auto' }}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSel({ y, m })
            }}
          >
            {MESES_ELEGIBLES.map((p) => (
              <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>
                {MES_LARGO[p.m]} {p.y}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="facetas" style={{ marginBottom: 16 }}>
        {TABS.map(([k, etiqueta]) => (
          <button type="button" key={k}
            className={`faceta${tab === k ? ' activa' : ''}`}
            onClick={() => setTab(k)}>
            {etiqueta}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo la nómina…</p>}

      {!loading && tab === 'costo' && (
        <TabCosto
          res={res} resAnt={resAnt} cargando={resCargando} sel={sel}
          roster={roster} corridas={corridas} salarioMinimo={salarioMinimo}
          companyId={activeCompany?.id} movil={movil}
          irEmpleados={() => setTab('empleados')}
          irCorridas={() => setTab('corridas')}
        />
      )}
      {!loading && tab === 'correr' && (
        <TabCorrer
          companyId={activeCompany?.id} roster={roster} corridas={corridas}
          salarioMinimo={salarioMinimo} recargar={cargarBase} movil={movil}
        />
      )}
      {!loading && tab === 'corridas' && (
        <TabCorridas corridas={corridas} sel={sel} movil={movil} companyId={activeCompany?.id} />
      )}
      {!loading && tab === 'empleados' && (
        <TabEmpleados roster={roster} res={res} salarioMinimo={salarioMinimo} movil={movil} />
      )}
    </div>
  )
}

/* ── Costo ──────────────────────────────────────────────────────────────── */

function TabCosto({ res, resAnt, cargando, sel, roster, corridas, salarioMinimo, companyId, movil, irEmpleados, irCorridas }) {
  const [imss, setImss] = useState(null)
  const [imssAnio, setImssAnio] = useState(null)
  const [imssErr, setImssErr] = useState(null)
  const anios = useMemo(() => {
    const y = new Date().getUTCFullYear(); const a = []
    for (let i = 2023; i <= y; i++) a.push(i)
    return a
  }, [])

  useEffect(() => {
    if (!companyId) return
    let vivo = true
    setImss(null); setImssErr(null)
    apiFetch(`/api/nomina/imss?companyId=${companyId}${imssAnio ? `&anio=${imssAnio}` : ''}`)
      .then((d) => { if (vivo) { setImss(d); setImssAnio(d.anio) } })
      .catch((err) => { if (vivo) setImssErr(err.message) })
    return () => { vivo = false }
  }, [companyId, imssAnio])

  const nom = res?.nomina
  const total = nom ? nom.total : null
  const antTotal = resAnt?.nomina?.total ?? null
  const delta = total != null && antTotal ? (total / antTotal - 1) * 100 : null

  const ingreso = res?.totales?.ingreso ?? null
  const utilidadBruta = res?.totales?.utilidadBruta ?? null
  const lineas = res?.lineas ?? []
  const unidades = lineas
    .filter((l) => l.clave === 'unidades_nuevas' || l.clave === 'unidades_seminuevas')
    .reduce((a, l) => a + (l.unidades ?? 0), 0)
  const manoObraIngreso = lineas.find((l) => l.clave === 'mano_obra')?.ingreso ?? 0
  const refaccionesIngreso = lineas
    .filter((l) => l.clave === 'refacciones_taller' || l.clave === 'refacciones_mostrador')
    .reduce((a, l) => a + (l.ingreso ?? 0) + (l.ingresoSinCosto ?? 0), 0)

  // Personas por línea: cuántos RFC distintos cobraron en el mes en cada una.
  const personasPorLinea = useMemo(() => {
    const por = {}
    for (const p of res?.detalle?.nomina ?? []) por[p.linea] = (por[p.linea] ?? 0) + 1
    return por
  }, [res])

  const porLinea = useMemo(() => {
    const by = new Map((nom?.porLinea ?? []).map((l) => [l.linea, l]))
    return ORDEN_LINEAS.filter((k) => by.has(k)).map((k) => ({ linea: k, ...by.get(k) }))
  }, [nom])

  const produccion = (l) => {
    if (l.linea === 'ADMIN') return { texto: 'sin ingreso atribuible', tono: 'grave' }
    if (l.linea === 'VENTAS') {
      return unidades > 0
        ? { texto: `${mxn(l.monto / unidades)} por unidad (${unidades})` }
        : { texto: 'sin unidades vendidas en el mes', tono: 'aviso' }
    }
    if (l.linea === 'TALLER') {
      // Sin horas en el modelo, el contraste honesto es peso-por-peso: qué
      // fracción de la mano de obra facturada se va en la nómina que la produce.
      return manoObraIngreso > 0
        ? { texto: `${Math.round((l.monto / manoObraIngreso) * 100)}% de la MO facturada` }
        : { texto: 'sin mano de obra facturada en el mes', tono: 'aviso' }
    }
    if (l.linea === 'REFACCIONES') {
      return refaccionesIngreso > 0
        ? { texto: `$${(l.monto / refaccionesIngreso).toFixed(2)} por peso vendido` }
        : { texto: 'sin venta de refacciones en el mes', tono: 'aviso' }
    }
    return { texto: '—' }
  }

  const adminPct = total > 0 ? Math.round(((porLinea.find((l) => l.linea === 'ADMIN')?.monto ?? 0) / total) * 100) : null

  // ── Riesgos de la plantilla (con datos reales, no los del mock) ──────────
  const activos = (roster?.empleados ?? []).filter((e) => e.isActive)
  const exactos = activos.filter((e) => vsMinimo(e.salarioDiario, salarioMinimo) === 'exacto')
  const debajo = activos.filter((e) => vsMinimo(e.salarioDiario, salarioMinimo) === 'debajo')
  const masaRegistrada = activos.reduce((a, e) => a + (e.salarioDiario ?? 0), 0) * 30.4

  const corridasMes = (corridas ?? []).filter((c) => {
    const f = new Date(c.fechaPago)
    return f.getUTCFullYear() === sel.y && f.getUTCMonth() + 1 === sel.m
  })
  const sinTimbrar = corridasMes.reduce((a, c) => a + (c.recibosSinTimbrar ?? 0), 0)

  const rfcsPagados = useMemo(() => new Set((res?.detalle?.nomina ?? []).map((p) => p.rfc)), [res])
  const sinRecibo = res ? activos.filter((e) => !rfcsPagados.has(e.rfc)) : []

  if (cargando && !res) return <p className="muted">Calculando el costo del mes…</p>

  return (
    <>
      {res && nom && (
        <section className="card hero-nomina" style={{ marginBottom: 16 }}>
          <div>
            <div className="kpi-label">Costo de nómina · {MES_LARGO[sel.m]}</div>
            <div className="cifra-hero">
              {mxn(total)}
              {delta != null && (
                <span className="hero-delta">{delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs {MES_LARGO[resAnt ? (sel.m === 1 ? 12 : sel.m - 1) : sel.m]}</span>
              )}
            </div>
            {/* El corte fijo/variable del handoff NO existe en los datos: los
                CFDI de esta agencia timbran todo como sueldo, sin claves de
                comisión ni destajo. El corte real disponible es percepciones
                vs cuotas patronales — y ése sí sale del recibo. */}
            <div className="mezcla" role="img" aria-label={`Percepciones ${mxn(nom.percepciones)}, cuotas patronales ${mxn(nom.cuotasPatronales)}`}>
              <span style={{ width: `${total > 0 ? (nom.percepciones / total) * 100 : 0}%` }} />
            </div>
            <div className="mezcla-leyenda">
              <span><i className="pta" /> Percepciones {mxn(nom.percepciones)}</span>
              <span><i className="ptb" /> Cuotas patronales {mxn(nom.cuotasPatronales)}</span>
            </div>
          </div>
          <div className="hero-kpis">
            <div>
              <div className="kpi-label">% de los ingresos</div>
              <div className="kpi">{ingreso > 0 ? `${((total / ingreso) * 100).toFixed(1)}%` : '—'}</div>
              <div className="kpi-sub">sobre {mxn(ingreso)} facturados</div>
            </div>
            <div>
              <div className="kpi-label">% de la utilidad bruta</div>
              <div className="kpi">{utilidadBruta > 0 ? `${((total / utilidadBruta) * 100).toFixed(1)}%` : '—'}</div>
              <div className="kpi-sub">{utilidadBruta > 0 ? `de cada peso de margen, ${Math.round((total / utilidadBruta) * 100)}¢ son nómina` : 'sin utilidad bruta en el mes'}</div>
            </div>
            <div>
              <div className="kpi-label">Costo por unidad vendida</div>
              <div className="kpi">{unidades > 0 ? mxn(total / unidades) : '—'}</div>
              <div className="kpi-sub">{unidades > 0 ? `nómina total ÷ ${unidades} unidades` : 'sin unidades vendidas en el mes'}</div>
            </div>
          </div>
        </section>
      )}

      {res && !nom?.porLinea?.length && (
        <section className="card" style={{ marginBottom: 16 }}>
          <p className="muted" style={{ margin: 0 }}>Sin recibos de nómina timbrados en {MES_LARGO[sel.m]} de {sel.y}.</p>
        </section>
      )}

      {nom?.porLinea?.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head" style={{ gap: 10 }}>
            <span>Costo por departamento</span>
            <span className="muted" style={{ fontWeight: 400 }}>qué parte de la nómina produce ingreso y qué parte es estructura</span>
          </div>
          {movil ? (
            <div className="lista-tarjetas">
              {porLinea.map((l) => {
                const p = produccion(l)
                return (
                  <div key={l.linea} className="tarjeta-fila">
                    <div className="tf-alto">
                      <span className="tf-titulo">{LINEA[l.linea]?.nombre ?? l.linea}</span>
                      <span className="tf-cifra">{mxn(l.monto)}</span>
                    </div>
                    <div className="tf-bajo">
                      <span className="tf-sub">
                        {personasPorLinea[l.linea] ?? 0} personas · {total > 0 ? Math.round((l.monto / total) * 100) : 0}% de la nómina
                      </span>
                      <span className={`pill-motivo${p.tono ? ` ${p.tono}` : ''}`}>{p.texto}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Departamento</th><th style={num}>Personas</th>
                  <th className="num">Percepciones</th><th className="num">Cuotas patronales</th>
                  <th className="num">Total</th><th>% de la nómina</th><th>Contra lo que produce</th>
                </tr>
              </thead>
              <tbody>
                {porLinea.map((l) => {
                  const p = produccion(l)
                  const pct = total > 0 ? (l.monto / total) * 100 : 0
                  return (
                    <tr key={l.linea}>
                      <td className="celda2">
                        <b>{LINEA[l.linea]?.nombre ?? l.linea}</b>
                        <span>{LINEA[l.linea]?.glosa ?? ''}</span>
                      </td>
                      <td style={num}>{personasPorLinea[l.linea] ?? 0}</td>
                      <td className="num">{mxn(l.percepciones)}</td>
                      <td className="num">{mxn(l.cuotasPatronales)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{mxn(l.monto)}</td>
                      <td>
                        <span className="frac">
                          <span className="frac-barra"><span style={{ width: `${Math.min(pct, 100)}%` }} /></span>
                          <span className="mono" style={{ fontSize: 11 }}>{Math.round(pct)}%</span>
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: p.tono === 'grave' ? 'var(--neg)' : 'var(--ink2)' }}>{p.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="alcance">{porLinea.length} departamentos</td>
                  <td style={num}>{Object.values(personasPorLinea).reduce((a, b) => a + b, 0)}</td>
                  <td className="num">{mxn(nom.percepciones)}</td>
                  <td className="num">{mxn(nom.cuotasPatronales)}</td>
                  <td className="num">{mxn(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
          {adminPct != null && (
            <div className="card-note">
              Corporativo es el <b>{adminPct}% de la nómina sin ingreso atribuible</b> — la cifra que decide si el
              grupo aguanta otra sucursal. Taller y Refacciones sí se miden contra lo que producen; las horas por
              técnico no están modeladas (el taller no captura horas), así que el contraste del Taller es
              peso-por-peso contra la mano de obra facturada.
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ gap: 10 }}>
          <span>Riesgos de la plantilla</span>
          <span className="muted" style={{ fontWeight: 400 }}>
            {[debajo.length > 0 && `${debajo.length} por debajo del mínimo`, sinTimbrar > 0 && `${sinTimbrar} sin timbrar`].filter(Boolean).join(' · ') || 'lo que hay que ver'}
          </span>
        </div>
        {roster == null ? (
          <p className="muted" style={{ margin: 0 }}>Sin plantilla cargada.</p>
        ) : (
          <div className="riesgos">
            {(exactos.length > 0 || debajo.length > 0) && (
              <button type="button" className="riesgo-fila grave" onClick={irEmpleados}>
                <div>
                  <b>{exactos.length + debajo.length} de {activos.length} activos registrados en el mínimo o por debajo</b>
                  <span>
                    {exactos.length} exactamente en {mxn2(salarioMinimo)} diarios y {debajo.length} por debajo — el IMSS
                    rechaza movimientos sub-mínimos. Si el pago real supera el salario registrado, la diferencia es un
                    pasivo de IMSS e ISR. Masa registrada: {mxn(masaRegistrada)}/mes.
                  </span>
                </div>
                <span className="riesgo-liga">Revisar →</span>
              </button>
            )}
            {sinTimbrar > 0 && (
              <button type="button" className="riesgo-fila grave" onClick={irCorridas}>
                <div>
                  <b>{sinTimbrar} recibo(s) sin CFDI timbrado en {MES_LARGO[sel.m]}</b>
                  <span>Salieron en una corrida pero su comprobante no se timbró. Sin timbre, ese sueldo no es deducible.</span>
                </div>
                <span className="riesgo-liga">Ver corridas →</span>
              </button>
            )}
            {res && sinRecibo.length > 0 && (
              <button type="button" className="riesgo-fila aviso" onClick={irEmpleados}>
                <div>
                  <b>{sinRecibo.length} activo(s) sin recibo en {MES_LARGO[sel.m]}</b>
                  <span>
                    {sinRecibo.slice(0, 4).map((e) => e.nombreCompleto).join(', ')}
                    {sinRecibo.length > 4 ? ` y ${sinRecibo.length - 4} más` : ''} siguen en plantilla y no aparecen en
                    ningún recibo del mes. O se les paga, o son bajas sin registrar.
                  </span>
                </div>
                <span className="riesgo-liga">Revisar →</span>
              </button>
            )}
            {exactos.length === 0 && debajo.length === 0 && sinTimbrar === 0 && (!res || sinRecibo.length === 0) && (
              <p className="muted" style={{ margin: 0 }}>Sin riesgos detectados en {MES_LARGO[sel.m]}.</p>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head" style={{ gap: 10, justifyContent: 'space-between' }}>
          <span>IMSS del ejercicio</span>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
            Ejercicio
            <select value={imssAnio ?? anios[anios.length - 1]} style={{ width: 'auto' }}
              onChange={(e) => setImssAnio(Number(e.target.value))}>
              {anios.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {imssErr && <div className="error">{imssErr}</div>}
        {!imss && !imssErr && <p className="muted">Calculando IMSS…</p>}
        {imss && (
          <>
            <div className="kpi-strip densa">
              <div className="kpi-item">
                <div className="kpi-label">Obrero (retenido)</div>
                <div className="kpi">{mxn(imss.totales.obrero)}</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-label">Patronal (costo)</div>
                <div className="kpi">{mxn(imss.totales.patronal)}</div>
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
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Mes</th><th className="num">Recibos</th><th className="num">Obrero</th>
                    <th className="num">Patronal</th><th className="num">INFONAVIT</th><th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {imss.meses.map((m) => (
                    <tr key={m.mes}>
                      <td>{MES[m.mes] ?? m.mes}</td>
                      <td className="num">{m.recibos}</td>
                      <td className="num">{mxn(m.obrero)}</td>
                      <td className="num">{mxn(m.patronal)}</td>
                      <td className="num">{mxn(m.infonavit)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{mxn(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {imss.meses.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="alcance">Total {imss.anio}</td>
                      <td className="num">{imss.totales.recibos}</td>
                      <td className="num">{mxn(imss.totales.obrero)}</td>
                      <td className="num">{mxn(imss.totales.patronal)}</td>
                      <td className="num">{mxn(imss.totales.infonavit)}</td>
                      <td className="num">{mxn(imss.totales.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="glosa" style={{ marginTop: 10 }}>
              El patronal se calcula sobre el SBC <b>reportado</b> — es el costo de caja, y contra la Contabilidad
              Electrónica cuadra en {imss.reconciliacion?.ratio ? `${imss.reconciliacion.ratio.toFixed(2)}×` : '—'}.
              Lo que se debería si el SBC reflejara los sueldos reales es otra cifra, y no sale de estos datos.
            </p>
          </>
        )}
      </section>
    </>
  )
}

/* ── Corridas ───────────────────────────────────────────────────────────── */

function TabCorridas({ corridas, sel, movil, companyId }) {
  const [todas, setTodas] = useState(false)
  const [verRun, setVerRun] = useState(null)

  const filas = useMemo(() => {
    if (!corridas) return []
    if (todas) return corridas
    return corridas.filter((c) => {
      const f = new Date(c.fechaPago)
      return f.getUTCFullYear() === sel.y && f.getUTCMonth() + 1 === sel.m
    })
  }, [corridas, todas, sel])

  const suma = (k) => filas.reduce((a, c) => a + (c[k] ?? 0), 0)

  if (!corridas) return null
  return (
    <section className="card">
      <div className="card-head" style={{ gap: 10, justifyContent: 'space-between' }}>
        <span>
          Corridas
          <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
            {corridas.length.toLocaleString('es-MX')} registradas · {filas.length} {todas ? 'en total' : `en ${MES_LARGO[sel.m]}`}
          </span>
        </span>
        <button type="button" className="ghost" onClick={() => setTodas(!todas)}>
          {todas ? `Sólo ${MES_LARGO[sel.m]}` : 'Ver todas'}
        </button>
      </div>
      {filas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin corridas con fecha de pago en {MES_LARGO[sel.m]} de {sel.y}.</p>
      ) : movil ? (
        <div className="lista-tarjetas">
          {filas.map((c) => (
            <div key={c.id} className="tarjeta-fila clicable" tabIndex={0} role="link"
              onClick={() => setVerRun(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVerRun(c.id) } }}>
              <div className="tf-alto">
                <span className="tf-titulo">{periodoLegible(c.periodo)}</span>
                <span className="tf-cifra">{mxn(c.totalNeto)}</span>
              </div>
              <div className="tf-bajo">
                <span className="tf-sub">{c._count?.items ?? '—'} personas · {c.tipo.toLowerCase()} · pago {dia(c.fechaPago)}</span>
                <EstadoCorrida c={c} />
              </div>
            </div>
          ))}
          <div className="tarjetas-pie">
            {filas.length} corridas · neto <b>{mxn(suma('totalNeto'))}</b>
          </div>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Periodo</th><th>Pago</th><th className="num">Personas</th>
              <th className="num">Bruto</th><th className="num">ISR retenido</th>
              <th className="num">IMSS + INFONAVIT</th><th className="num">Neto</th><th>Timbrado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id} className="fila-liga" tabIndex={0} role="link" title="Ver los recibos de esta corrida"
                onClick={() => setVerRun(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVerRun(c.id) } }}>
                <td className="celda2">
                  <b>{periodoLegible(c.periodo)}</b>
                  <span>{c.tipo.toLowerCase()}{c.origen === 'SAT' ? ' · del SAT' : ''}</span>
                </td>
                <td style={{ color: 'var(--ink-3)' }}>{dia(c.fechaPago)}</td>
                <td className="num">{c._count?.items ?? '—'}</td>
                <td className="num">{mxn(c.totalPercepciones)}</td>
                <td className="num">{mxn(c.isrRetenido)}</td>
                <td className="num">{mxn((c.imssObrero ?? 0) + (c.infonavit ?? 0))}</td>
                <td className="num" style={{ fontWeight: 600 }}>{mxn(c.totalNeto)}</td>
                <td><EstadoCorrida c={c} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="alcance" colSpan={3}>{filas.length} corridas{todas ? '' : ` · ${MES_LARGO[sel.m]}`}</td>
              <td className="num">{mxn(suma('totalPercepciones'))}</td>
              <td className="num">{mxn(suma('isrRetenido'))}</td>
              <td className="num">{mxn(suma('imssObrero') + suma('infonavit'))}</td>
              <td className="num">{mxn(suma('totalNeto'))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      <div className="card-note">
        El bruto de la corrida alimenta el estado de resultados; el ISR y el IMSS retenidos son un pasivo hasta que
        se enteran. Una corrida sin timbrar no es deducible.
      </div>
      {verRun && <DetalleCorrida runId={verRun} companyId={companyId} onCerrar={() => setVerRun(null)} />}
    </section>
  )
}

function EstadoCorrida({ c }) {
  if ((c.recibosSinTimbrar ?? 0) > 0 && (c.status === 'STAMPED' || c.status === 'PAID')) {
    return <span className="pill-motivo grave">{c.recibosSinTimbrar} sin timbrar</span>
  }
  const e = ESTADO_RUN[c.status] ?? { texto: c.status?.toLowerCase() ?? '—', tono: '' }
  return <span className={`pill-motivo${e.tono ? ` ${e.tono}` : ''}`}>{e.texto}</span>
}

function DetalleCorrida({ runId, companyId, onCerrar }) {
  const [run, setRun] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let vivo = true
    apiFetch(`/api/nomina/run/${runId}`)
      .then((d) => { if (vivo) setRun(d) })
      .catch((e) => { if (vivo) setErr(e.message) })
    return () => { vivo = false }
  }, [runId])

  return (
    <VentanaDetalle
      titulo={run ? periodoLegible(run.periodo) : 'Corrida'}
      glosa={run ? `${run.tipo.toLowerCase()} · pago ${dia(run.fechaPago)} · ${run.items?.length ?? 0} recibos` : ''}
      onCerrar={onCerrar}
    >
      {err && <div className="error">{err}</div>}
      {!run && !err && <p className="muted">Leyendo la corrida…</p>}
      {run && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th className="num">Percepciones</th><th className="num">ISR</th>
              <th className="num">IMSS obrero</th><th className="num">Neto</th><th>CFDI</th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((i) => (
              <tr key={i.id}>
                <td className="celda2">
                  <b>{i.employee ? `${i.employee.nombre} ${i.employee.apellidoPaterno}` : '—'}</b>
                  <span className="mono">{i.employee?.rfc ?? ''}</span>
                </td>
                <td className="num">{mxn(i.totalPercepciones)}</td>
                <td className="num">{mxn(i.isrRetenido)}</td>
                <td className="num">{mxn(i.imssObrero)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{mxn(i.netoAPagar)}</td>
                <td>
                  {i.cfdiUuid
                    ? <span className="mono" style={{ fontSize: 10.5 }}>{i.cfdiUuid.slice(0, 8)}</span>
                    : <span className="pill-motivo grave">sin timbrar</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </VentanaDetalle>
  )
}

/* ── Empleados ──────────────────────────────────────────────────────────── */

function TabEmpleados({ roster, res, salarioMinimo, movil }) {
  const [chip, setChip] = useState('activos')
  const [q, setQ] = useState('')

  const costoPorRfc = useMemo(() => {
    const by = new Map()
    for (const p of res?.detalle?.nomina ?? []) by.set(p.rfc, p)
    return by
  }, [res])

  const todos = roster?.empleados ?? []
  const activos = todos.filter((e) => e.isActive)
  const grupos = {
    activos,
    minimo: activos.filter((e) => vsMinimo(e.salarioDiario, salarioMinimo) === 'exacto'),
    debajo: activos.filter((e) => vsMinimo(e.salarioDiario, salarioMinimo) === 'debajo'),
    bajas: todos.filter((e) => !e.isActive),
  }
  const CHIPS = [
    ['activos', 'Activos', grupos.activos.length],
    ['minimo', 'En el mínimo', grupos.minimo.length],
    ['debajo', 'Bajo el mínimo', grupos.debajo.length],
    ['bajas', 'Bajas', grupos.bajas.length],
  ]

  const filas = useMemo(() => {
    let base = grupos[chip] ?? []
    const f = q.trim().toUpperCase()
    if (f) {
      base = base.filter((e) =>
        `${e.nombreCompleto} ${e.rfc} ${e.puesto ?? ''} ${e.departamento ?? ''}`.toUpperCase().includes(f))
    }
    // Orden: costo del mes descendente — quien más cuesta, primero.
    return [...base].sort((a, b) => (costoPorRfc.get(b.rfc)?.monto ?? 0) - (costoPorRfc.get(a.rfc)?.monto ?? 0))
  }, [chip, q, roster, costoPorRfc, salarioMinimo]) // eslint-disable-line react-hooks/exhaustive-deps

  const sumaCosto = filas.reduce((a, e) => a + (costoPorRfc.get(e.rfc)?.monto ?? 0), 0)

  if (!roster) return null
  return (
    <section className="card">
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="facetas" style={{ marginBottom: 0 }}>
          {CHIPS.map(([k, etiqueta, n]) => (
            <button type="button" key={k}
              className={`faceta${chip === k ? ' activa' : ''}`}
              onClick={() => setChip(k)}>
              {etiqueta} <span className="mono" style={{ fontSize: 10.5, opacity: 0.75 }}>{n}</span>
            </button>
          ))}
        </div>
        <input placeholder="Buscar por nombre, RFC, puesto…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
      </div>

      {filas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin empleados que coincidan.</p>
      ) : movil ? (
        <div className="lista-tarjetas">
          {filas.map((e) => {
            const c = costoPorRfc.get(e.rfc)
            const v = vsMinimo(e.salarioDiario, salarioMinimo)
            return (
              <div key={e.id} className="tarjeta-fila" style={!e.isActive ? { opacity: 0.6 } : undefined}>
                <div className="tf-alto">
                  <span className="tf-titulo">{e.nombreCompleto}</span>
                  <span className="tf-cifra">{c ? mxn(c.monto) : '—'}</span>
                </div>
                <div className="tf-bajo">
                  <span className="tf-sub">
                    {[e.puesto, e.departamento].filter(Boolean).join(' · ') || 'sin puesto'} · {mxn2(e.salarioDiario)}/día
                  </span>
                  {v === 'debajo' && <span className="pill-motivo grave">bajo el mínimo</span>}
                  {v === 'exacto' && <span className="pill-motivo aviso">en el mínimo</span>}
                  {!e.isActive && <span className="pill-motivo">baja {dia(e.fechaBaja)}</span>}
                </div>
              </div>
            )
          })}
          <div className="tarjetas-pie">
            {filas.length} empleados · costo del mes <b>{mxn(sumaCosto)}</b>
          </div>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th>Puesto y plaza</th><th className="num">Registrado</th>
              <th className="num">Costo del mes</th><th className="num">Recibos</th><th>Ingreso</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => {
              const c = costoPorRfc.get(e.rfc)
              const v = vsMinimo(e.salarioDiario, salarioMinimo)
              return (
                <tr key={e.id} style={!e.isActive ? { opacity: 0.55 } : undefined}>
                  <td className="celda2">
                    <b>{e.nombreCompleto}</b>
                    <span className="mono">{e.rfc}</span>
                  </td>
                  <td className="celda2">
                    <b style={{ fontWeight: 400 }}>{e.puesto ?? '—'}</b>
                    <span>{e.departamento ?? ''}</span>
                  </td>
                  <td className="num">
                    <span style={v === 'debajo' ? { color: 'var(--neg)' } : undefined}>{mxn2(e.salarioDiario)}</span>
                    <span style={{ display: 'block', fontSize: 10, color: v === 'debajo' ? 'var(--neg)' : v === 'exacto' ? 'var(--warn)' : 'var(--ink3)' }}>
                      {v === 'debajo' ? 'por debajo del mínimo' : v === 'exacto' ? 'exactamente el mínimo' : 'sobre el mínimo'}
                    </span>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{c ? mxn(c.monto) : '—'}</td>
                  <td className="num">{c?.recibos ?? '—'}</td>
                  <td>
                    {dia(e.fechaIngreso)}
                    {!e.isActive && <span className="pill-motivo" style={{ marginLeft: 6 }}>baja {dia(e.fechaBaja)}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="alcance" colSpan={3}>{filas.length} empleados</td>
              <td className="num">{mxn(sumaCosto)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
      <div className="card-note">
        «Registrado» es el salario diario ante el IMSS, no lo que se paga: por eso se compara contra el mínimo
        vigente ({mxn2(salarioMinimo)}) y contra lo que realmente salió en los recibos del mes. Los CFDI de esta
        agencia no traen claves de comisión ni destajo, así que no hay columna de variable — todo viene timbrado
        como sueldo.
      </div>
    </section>
  )
}

/* ── Correr nómina ──────────────────────────────────────────────────────── */

function TabCorrer({ companyId, roster, corridas, salarioMinimo, recargar, movil }) {
  // La corrida seleccionada manda: sin selección se ofrece crear una (o
  // retomar las que están en curso). El riel de pasos refleja el estado REAL
  // de la corrida (CALCULATED → timbrar; STAMPED → dispersar), no un avance
  // decorativo.
  const [runId, setRunId] = useState(null)
  const [run, setRun] = useState(null)
  const [err, setErr] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const enCurso = (corridas ?? []).filter((c) => c.status === 'DRAFT' || c.status === 'CALCULATED')

  const cargarRun = useCallback(async (id) => {
    if (!id) { setRun(null); return }
    try { setRun(await apiFetch(`/api/nomina/run/${id}`)) } catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => { cargarRun(runId) }, [runId, cargarRun])

  const accion = async (fn) => {
    setOcupado(true); setErr(null)
    try { await fn() } catch (e) { setErr(e.message) } finally { setOcupado(false) }
  }

  if (!companyId) return null

  return (
    <>
      {err && <div className="error">{err}</div>}

      {!runId && (
        <>
          {enCurso.length > 0 && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">Corridas en curso</div>
              <div className="lista-tarjetas">
                {enCurso.map((c) => (
                  <div key={c.id} className="tarjeta-fila clicable" tabIndex={0} role="button"
                    onClick={() => setRunId(c.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRunId(c.id) } }}>
                    <div className="tf-alto">
                      <span className="tf-titulo">{periodoLegible(c.periodo)}</span>
                      <span className="tf-cifra">{mxn(c.totalNeto)}</span>
                    </div>
                    <div className="tf-bajo">
                      <span className="tf-sub">{c._count?.items ?? 0} personas · {c.tipo.toLowerCase()} · pago {dia(c.fechaPago)}</span>
                      <EstadoCorrida c={c} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <NuevaCorrida companyId={companyId} roster={roster} onCreada={(id) => { setRunId(id); recargar() }} />
        </>
      )}

      {runId && (
        <CorridaEnCurso
          run={run} companyId={companyId} roster={roster} salarioMinimo={salarioMinimo}
          ocupado={ocupado} movil={movil}
          onRecargar={() => cargarRun(runId)}
          onSalir={() => { setRunId(null); setRun(null); recargar() }}
          onAccion={accion}
        />
      )}
    </>
  )
}

function NuevaCorrida({ companyId, roster, onCreada }) {
  const [pre, setPre] = useState(null)
  const [preErr, setPreErr] = useState(null)
  const [form, setForm] = useState(null)
  const [seleccion, setSeleccion] = useState(new Set())
  const [creando, setCreando] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let vivo = true
    apiFetch(`/api/nomina/run/prefill?companyId=${companyId}`)
      .then((d) => {
        if (!vivo) return
        setPre(d)
        setForm({
          periodoInicio: dia(d.periodoInicio), periodoFin: dia(d.periodoFin),
          fechaPago: dia(d.fechaPago), diasPagados: d.diasPagados,
        })
        setSeleccion(new Set(d.employeeIds ?? []))
      })
      .catch((e) => { if (vivo) setPreErr(e.message) })
    return () => { vivo = false }
  }, [companyId])

  const activos = (roster?.empleados ?? []).filter((e) => e.isActive)

  const crear = async () => {
    setCreando(true); setErr(null)
    try {
      const r = await apiFetch('/api/nomina/run', {
        method: 'POST',
        body: JSON.stringify({
          companyId, tipo: 'ORDINARIA',
          periodoInicio: form.periodoInicio, periodoFin: form.periodoFin,
          fechaPago: form.fechaPago, diasPagados: Number(form.diasPagados),
          employeeIds: [...seleccion],
        }),
      })
      onCreada(r.payrollRun?.id ?? r.id)
    } catch (e) { setErr(e.message) } finally { setCreando(false) }
  }

  return (
    <section className="card">
      <div className="card-head" style={{ gap: 10 }}>
        <span>Nueva corrida ordinaria</span>
        {pre && (
          <span className="muted" style={{ fontWeight: 400 }}>
            propuesta a partir de la de {periodoLegible(pre.basadoEnPeriodo)}
            {pre.basadoEnOrigen === 'SAT' ? ' (importada del SAT)' : ''}
          </span>
        )}
      </div>
      {preErr && (
        <p className="muted" style={{ margin: 0 }}>
          No hay una corrida anterior de la cual partir ({preErr}). Captura el periodo a mano.
        </p>
      )}
      {!form && !preErr && <p className="muted" style={{ margin: 0 }}>Proponiendo el periodo…</p>}
      {(form || preErr) && (
        <>
          <div className="forma-corrida">
            <label>Del
              <input type="date" value={form?.periodoInicio ?? ''}
                onChange={(e) => setForm({ ...form, periodoInicio: e.target.value })} />
            </label>
            <label>Al
              <input type="date" value={form?.periodoFin ?? ''}
                onChange={(e) => setForm({ ...form, periodoFin: e.target.value })} />
            </label>
            <label>Fecha de pago
              <input type="date" value={form?.fechaPago ?? ''}
                onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} />
            </label>
            <label>Días pagados
              <input type="number" min="1" max="31" value={form?.diasPagados ?? ''}
                onChange={(e) => setForm({ ...form, diasPagados: e.target.value })} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 6px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              Empleados <span className="muted" style={{ fontWeight: 400 }}>{seleccion.size} de {activos.length}</span>
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ghost" onClick={() => setSeleccion(new Set(activos.map((e) => e.id)))}>Todos</button>
              <button type="button" className="ghost" onClick={() => setSeleccion(new Set())}>Ninguno</button>
            </span>
          </div>
          <div className="lista-seleccion">
            {activos.map((e) => (
              <label key={e.id} className={seleccion.has(e.id) ? 'sel' : undefined}>
                <input type="checkbox" style={{ width: 'auto' }} checked={seleccion.has(e.id)}
                  onChange={(ev) => {
                    const s = new Set(seleccion)
                    if (ev.target.checked) s.add(e.id); else s.delete(e.id)
                    setSeleccion(s)
                  }} />
                <span className="nom">{e.nombreCompleto}</span>
                <span className="pue">{[e.puesto, e.departamento].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
          </div>

          {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" disabled={creando || seleccion.size === 0 || !form?.periodoInicio || !form?.periodoFin || !form?.fechaPago}
              onClick={crear}>
              {creando ? 'Calculando…' : `Crear y calcular (${seleccion.size})`}
            </button>
            <span className="glosa">
              El motor calcula ISR, IMSS e INFONAVIT desde cero con las incidencias vigentes — nada se copia de la
              corrida anterior.
            </span>
          </div>
        </>
      )}
    </section>
  )
}

function CorridaEnCurso({ run, companyId, roster, salarioMinimo, ocupado, movil, onRecargar, onSalir, onAccion }) {
  const [confirmaTimbre, setConfirmaTimbre] = useState(false)
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  const [resultadoTimbre, setResultadoTimbre] = useState(null)
  const [formInc, setFormInc] = useState(null)

  if (!run) return <p className="muted">Leyendo la corrida…</p>

  const timbrada = run.status === 'STAMPED' || run.status === 'PAID'
  const paso = timbrada ? 3 : 2
  const PASOS = ['Periodo', 'Incidencias y cálculo', 'Timbrado', 'Dispersión']

  const empPorId = new Map((roster?.empleados ?? []).map((e) => [e.id, e]))

  // Bloqueos previos al timbre — los definitivos los valida el servidor al
  // timbrar; éstos son los que se pueden ver ANTES de intentarlo.
  const sinCurp = run.items.filter((i) => !empPorId.get(i.employeeId)?.curp)
  const incapSinFolio = (run.incidencias ?? []).filter((x) => x.tipo === 'INCAPACIDAD' && !x.folioImss)
  const bajoMinimo = run.items.filter((i) => {
    const e = empPorId.get(i.employeeId)
    return e && vsMinimo(e.salarioDiario, salarioMinimo) === 'debajo'
  })

  const incPorEmpleado = new Map()
  for (const x of run.incidencias ?? []) {
    const arr = incPorEmpleado.get(x.employeeId) ?? []
    arr.push(x); incPorEmpleado.set(x.employeeId, arr)
  }

  const recalcular = () => onAccion(async () => {
    await apiFetch(`/api/nomina/run/${run.id}/recalcular`, { method: 'POST' })
    onRecargar()
  })

  const timbrar = () => onAccion(async () => {
    const r = await apiFetch(`/api/nomina/run/${run.id}/stamp`, { method: 'POST' })
    setResultadoTimbre(r); setConfirmaTimbre(false)
    onRecargar()
  })

  const borrar = () => onAccion(async () => {
    await apiFetch(`/api/nomina/run/${run.id}`, { method: 'DELETE' })
    onSalir()
  })

  const agregarIncidencia = () => onAccion(async () => {
    await apiFetch('/api/nomina/incidencias', {
      method: 'POST',
      body: JSON.stringify({ companyId, payrollRunId: run.id, ...formInc }),
    })
    setFormInc(null)
    onRecargar()
  })

  return (
    <>
      <div className="rail-pasos">
        {PASOS.map((p, i) => (
          <span key={p} className={`paso${i + 1 === paso ? ' activo' : ''}${i + 1 < paso ? ' hecho' : ''}`}>
            <i>{i + 1}</i> {p}
          </span>
        ))}
        <button type="button" className="ghost" style={{ marginLeft: 'auto' }} onClick={onSalir}>← Corridas</button>
      </div>

      <div className={movil ? undefined : 'correr-cols'}>
        <section className="card">
          <div className="card-head" style={{ gap: 10 }}>
            <span>{periodoLegible(run.periodo)}</span>
            <span className="muted" style={{ fontWeight: 400 }}>
              {run.items.length} personas · pago {dia(run.fechaPago)} · <EstadoCorrida c={run} />
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empleado</th><th>Incidencias</th><th className="num">Percepciones</th>
                  <th className="num">ISR</th><th className="num">Neto</th>
                </tr>
              </thead>
              <tbody>
                {run.items.map((i) => {
                  const e = empPorId.get(i.employeeId)
                  const incs = incPorEmpleado.get(i.employeeId) ?? []
                  return (
                    <tr key={i.id}>
                      <td className="celda2">
                        <b>{e?.nombreCompleto ?? (i.employee ? `${i.employee.nombre} ${i.employee.apellidoPaterno}` : '—')}</b>
                        <span>{e ? [e.puesto, e.departamento].filter(Boolean).join(' · ') : ''}</span>
                      </td>
                      <td>
                        {incs.length === 0
                          ? <span className="muted" style={{ fontSize: 11 }}>—</span>
                          : incs.map((x) => (
                            <span key={x.id} className={`pill-motivo${x.tipo === 'INCAPACIDAD' && !x.folioImss ? ' grave' : ''}`}
                              style={{ marginRight: 4 }}
                              title={`${dia(x.fecha)}${x.dias > 1 ? ` · ${x.dias} días` : ''}`}>
                              {x.tipo === 'HORAS_EXTRA' ? `${(x.horas ?? 0) + (x.horasTriples ?? 0)}h extra` : x.tipo.toLowerCase().replaceAll('_', ' ')}
                              {x.dias > 1 && CON_DIAS.includes(x.tipo) ? ` ×${x.dias}` : ''}
                            </span>
                          ))}
                        {!timbrada && (
                          <button type="button" className="ghost mini" title="Agregar incidencia"
                            onClick={() => setFormInc({ employeeId: i.employeeId, tipo: 'FALTA', fecha: dia(run.periodo.split('/')[0]), dias: 1 })}>
                            +
                          </button>
                        )}
                      </td>
                      <td className="num">{mxn2(i.totalPercepciones)}</td>
                      <td className="num">{mxn2(i.isrRetenido)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{mxn2(i.netoAPagar)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="alcance" colSpan={2}>{run.items.length} recibos</td>
                  <td className="num">{mxn2(run.totalPercepciones)}</td>
                  <td className="num" />
                  <td className="num">{mxn2(run.totalNeto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!timbrada && (
            <div className="card-note">
              Las incidencias recalculan el recibo con el motor — los importes nunca se editan a mano. Un periodo ya
              timbrado no acepta incidencias: los CFDIs emitidos no cambian.
            </div>
          )}
        </section>

        <div>
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">Cálculo de la corrida</div>
            <FilaResumen label="Percepciones" valor={mxn2(run.totalPercepciones)} />
            <FilaResumen label="Deducciones" valor={mxn2(run.totalDeducciones)} />
            <FilaResumen fuerte label="Neto a dispersar" valor={mxn2(run.totalNeto)} />
            {!timbrada && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="ghost" disabled={ocupado} onClick={recalcular}>Recalcular</button>
                {!confirmaBorrar
                  ? <button type="button" className="ghost" disabled={ocupado} onClick={() => setConfirmaBorrar(true)}>Descartar</button>
                  : <button type="button" className="peligro" disabled={ocupado} onClick={borrar}>Confirmar descarte</button>}
              </div>
            )}
          </section>

          {!timbrada && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ gap: 10 }}>
                <span>Antes de timbrar</span>
                {(sinCurp.length + incapSinFolio.length + bajoMinimo.length) > 0 && (
                  <span style={{ color: 'var(--neg)', fontSize: 11.5 }}>
                    {sinCurp.length + incapSinFolio.length + bajoMinimo.length} bloqueo(s)
                  </span>
                )}
              </div>
              <div className="riesgos">
                {sinCurp.length > 0 && (
                  <div className="riesgo-fila grave estatico">
                    <div>
                      <b>{sinCurp.length} empleado(s) sin CURP en el expediente</b>
                      <span>el CFDI de nómina 1.2 la exige — {sinCurp.map((i) => empPorId.get(i.employeeId)?.nombreCompleto).filter(Boolean).slice(0, 3).join(', ')}</span>
                    </div>
                  </div>
                )}
                {incapSinFolio.length > 0 && (
                  <div className="riesgo-fila grave estatico">
                    <div>
                      <b>{incapSinFolio.length} incapacidad(es) sin folio del IMSS</b>
                      <span>captura el folio en la incidencia antes de timbrar</span>
                    </div>
                  </div>
                )}
                {bajoMinimo.length > 0 && (
                  <div className="riesgo-fila aviso estatico">
                    <div>
                      <b>{bajoMinimo.length} salario(s) registrados por debajo del mínimo</b>
                      <span>el timbre no se bloquea, pero el IMSS rechaza movimientos sub-mínimos</span>
                    </div>
                  </div>
                )}
                {sinCurp.length === 0 && incapSinFolio.length === 0 && bajoMinimo.length === 0 && (
                  <p className="muted" style={{ margin: 0 }}>Sin bloqueos visibles — la validación definitiva la hace el timbrado.</p>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {!confirmaTimbre ? (
                  <button type="button" disabled={ocupado || run.status !== 'CALCULATED'} onClick={() => setConfirmaTimbre(true)}>
                    Timbrar {run.items.length} recibo(s)
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="peligro" disabled={ocupado} onClick={timbrar}>
                      {ocupado ? 'Timbrando…' : 'Confirmar — es el punto sin retorno'}
                    </button>
                    <button type="button" className="ghost" onClick={() => setConfirmaTimbre(false)}>Cancelar</button>
                  </div>
                )}
                <p className="glosa" style={{ marginTop: 8 }}>
                  Una vez sellado el CFDI, corregir exige cancelar y refacturar.
                </p>
              </div>
            </section>
          )}

          {resultadoTimbre && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">Resultado del timbrado</div>
              <p style={{ margin: 0, fontSize: 13 }}>
                {resultadoTimbre.stamped} de {resultadoTimbre.total} recibos timbrados.
              </p>
              {(resultadoTimbre.errors ?? []).length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--neg)' }}>
                  {resultadoTimbre.errors.slice(0, 8).map((e, i) => <li key={i}>{String(e)}</li>)}
                </ul>
              )}
            </section>
          )}

          {timbrada && (
            <section className="card">
              <div className="card-head">Dispersión</div>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink2)' }}>
                Archivo SPEI por lotes (CSV compatible con BBVA, Banorte, Santander y Banamex). Usa la CLABE
                capturada en cada empleado; los que no la tengan salen sin cuenta y se pagan a mano.
              </p>
              <button type="button" disabled={ocupado}
                onClick={() => onAccion(() => apiDownload(`/api/nomina/dispersion?runId=${run.id}`, `dispersion-${run.periodo.replaceAll('/', '_')}.csv`))}>
                Descargar archivo de dispersión
              </button>
            </section>
          )}
        </div>
      </div>

      {formInc && (
        <VentanaDetalle
          titulo="Agregar incidencia"
          glosa={empPorId.get(formInc.employeeId)?.nombreCompleto ?? ''}
          onCerrar={() => setFormInc(null)}
        >
          <div className="forma-corrida" style={{ marginBottom: 12 }}>
            <label>Tipo
              <select value={formInc.tipo} onChange={(e) => setFormInc({ ...formInc, tipo: e.target.value })}>
                {TIPOS_INCIDENCIA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </label>
            <label>Fecha
              <input type="date" value={formInc.fecha}
                onChange={(e) => setFormInc({ ...formInc, fecha: e.target.value })} />
            </label>
            {CON_DIAS.includes(formInc.tipo) && (
              <label>Días
                <input type="number" min="1" value={formInc.dias ?? 1}
                  onChange={(e) => setFormInc({ ...formInc, dias: e.target.value })} />
              </label>
            )}
            {formInc.tipo === 'HORAS_EXTRA' && (
              <label>Horas dobles
                <input type="number" min="0" step="0.5" value={formInc.horas ?? ''}
                  onChange={(e) => setFormInc({ ...formInc, horas: e.target.value })} />
              </label>
            )}
            {CON_MONTO.includes(formInc.tipo) && (
              <label>Monto
                <input type="number" min="0" step="0.01" value={formInc.monto ?? ''}
                  onChange={(e) => setFormInc({ ...formInc, monto: e.target.value })} />
              </label>
            )}
            {formInc.tipo === 'INCAPACIDAD' && (
              <label>Folio IMSS
                <input type="text" value={formInc.folioImss ?? ''}
                  onChange={(e) => setFormInc({ ...formInc, folioImss: e.target.value })} />
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={ocupado} onClick={agregarIncidencia}>
              {ocupado ? 'Guardando…' : 'Guardar y recalcular'}
            </button>
            <button type="button" className="ghost" onClick={() => setFormInc(null)}>Cancelar</button>
          </div>
        </VentanaDetalle>
      )}
    </>
  )
}

function FilaResumen({ label, valor, fuerte }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '7px 0',
      borderBottom: '1px solid var(--line)', fontSize: fuerte ? 14 : 12.5,
      fontWeight: fuerte ? 600 : 400,
    }}>
      <span style={{ color: fuerte ? 'var(--ink)' : 'var(--ink2)' }}>{label}</span>
      <span className="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  )
}

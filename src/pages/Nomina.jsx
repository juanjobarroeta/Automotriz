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
  ['timbrar', 'Timbrar nómina'],
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

// El SBC es salario INTEGRADO (lleva aguinaldo y prima vacacional
// proporcionales), así que su piso legal no es el mínimo sino el mínimo por
// el factor de integración del primer año (Art. 27 LSS): 315.04 × 1.0493 ≈
// $330.57. Comparar el SBC contra el mínimo a secas marcaría «arriba» a
// quien está exactamente en el piso.
const FACTOR_INTEGRACION = 1.0493
const vsPiso = (sbc, minimo) => {
  if (sbc == null || !minimo) return null
  const piso = minimo * FACTOR_INTEGRACION
  if (sbc < piso - 0.5) return 'debajo'
  if (sbc <= piso * 1.005) return 'piso'
  return 'arriba'
}

// EN NÓMINA se deriva de cuándo cobró, no del flag isActive del padrón: en
// MARGOM el flag dice 36 activos y hay 281 personas con recibo en los
// últimos 45 días (245 de ellas marcadas inactivas). Si el hub todavía no
// manda ultimoPago, se cae al flag — mejor la marca vieja que nada.
const EN_NOMINA_DIAS = 45
const enNomina = (e) => {
  if (!('ultimoPago' in e)) return e.isActive
  if (!e.ultimoPago) return false
  return (Date.now() - new Date(e.ultimoPago).getTime()) / 86400000 <= EN_NOMINA_DIAS
}

// El periodo SIGUIENTE a una corrida plantilla. Las quincenas de calendario
// (1–15 / 16–fin de mes) no son de largo uniforme, así que no basta sumar
// días: 16–31 de agosto + 16 días daría 01–16 de septiembre. Se reconocen
// las dos quincenas por sus bordes; todo lo demás (semanal, catorcenal)
// avanza por su propio largo. La fecha de pago conserva el desfase de la
// plantilla (pago − fin de periodo).
const siguientePeriodoDe = (run) => {
  const [iniS, finS] = run.periodo.split('/')
  const ini = new Date(`${iniS.slice(0, 10)}T00:00:00Z`)
  const fin = new Date(`${finS.slice(0, 10)}T00:00:00Z`)
  if (isNaN(ini) || isNaN(fin)) return null
  const diaMs = 86400000
  const finDeMes = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate()
  let nIni, nFin, dias
  if (ini.getUTCDate() === 1 && fin.getUTCDate() === 15) {
    nIni = new Date(fin.getTime() + diaMs)
    nFin = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0))
    dias = 15
  } else if (ini.getUTCDate() === 16 && finDeMes(fin)) {
    nIni = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 1))
    nFin = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 15))
    dias = 15
  } else {
    const largo = Math.round((fin - ini) / diaMs) + 1
    nIni = new Date(fin.getTime() + diaMs)
    nFin = new Date(fin.getTime() + largo * diaMs)
    dias = largo
  }
  const desfase = Math.max(0, Math.round((new Date(run.fechaPago) - fin) / diaMs))
  const nPago = new Date(nFin.getTime() + desfase * diaMs)
  return { periodoInicio: dia(nIni), periodoFin: dia(nFin), fechaPago: dia(nPago), diasPagados: dias }
}

// Cadencia legible de una corrida, por el largo de su periodo.
const cadenciaDe = (run) => {
  const [iniS, finS] = run.periodo.split('/')
  const largo = Math.round((new Date(finS) - new Date(iniS)) / 86400000) + 1
  if (largo <= 9) return 'semanal'
  if (largo <= 20) return 'quincenal'
  return 'mensual'
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
          {roster && ` · ${(roster.empleados ?? []).filter(enNomina).length} en nómina`}
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
      {!loading && tab === 'timbrar' && (
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

  // ── Riesgos de la plantilla ──────────────────────────────────────────────
  // Sobre el SBC de los RECIBOS del mes, no sobre los campos de salario del
  // Employee: ésos son captura vieja (hay $59 y $79 diarios, imposibles como
  // SBC) y el flag isActive marca inactiva a la mayoría de la gente que
  // cobra. La autoridad es el CFDI.
  const personasMes = res?.detalle?.nomina ?? []
  const conSbc = personasMes.filter((p) => p.sbcDiario != null)
  const enPiso = conSbc.filter((p) => vsPiso(p.sbcDiario, salarioMinimo) === 'piso')
  const masaSbc = conSbc.reduce((a, p) => a + p.sbcDiario, 0) * 30.4

  const plantilla = roster?.empleados ?? []
  const cobranMarcadosInactivos = plantilla.filter((e) => 'ultimoPago' in e && enNomina(e) && !e.isActive)

  const corridasMes = (corridas ?? []).filter((c) => {
    const f = new Date(c.fechaPago)
    return f.getUTCFullYear() === sel.y && f.getUTCMonth() + 1 === sel.m
  })
  const sinTimbrar = corridasMes.reduce((a, c) => a + (c.recibosSinTimbrar ?? 0), 0)

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
            {[enPiso.length > 0 && `${enPiso.length} en el piso integrado`, sinTimbrar > 0 && `${sinTimbrar} sin timbrar`].filter(Boolean).join(' · ') || 'lo que hay que ver'}
          </span>
        </div>
        {roster == null ? (
          <p className="muted" style={{ margin: 0 }}>Sin plantilla cargada.</p>
        ) : (
          <div className="riesgos">
            {enPiso.length > 0 && (
              <button type="button" className="riesgo-fila grave" onClick={irEmpleados}>
                <div>
                  <b>{enPiso.length} de {conSbc.length} que cobraron en {MES_LARGO[sel.m]} con SBC en el piso integrado</b>
                  <span>
                    Registrados ante el IMSS en {mxn2(salarioMinimo * FACTOR_INTEGRACION)} diarios (mínimo × factor de
                    integración) — el dato sale de los propios recibos. Si el pago real supera lo registrado, la
                    diferencia es un pasivo de IMSS e ISR. Masa registrada: {mxn(masaSbc)}/mes.
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
            {cobranMarcadosInactivos.length > 0 && (
              <button type="button" className="riesgo-fila aviso" onClick={irEmpleados}>
                <div>
                  <b>El padrón está desincronizado: {cobranMarcadosInactivos.length} personas que cobran están marcadas inactivas</b>
                  <span>
                    La pantalla deriva la plantilla de los recibos (cobró en los últimos {EN_NOMINA_DIAS} días), pero
                    el padrón alimenta al motor de corridas y a la propuesta de la siguiente — vale la pena
                    sincronizar altas y bajas.
                  </span>
                </div>
                <span className="riesgo-liga">Revisar →</span>
              </button>
            )}
            {enPiso.length === 0 && sinTimbrar === 0 && cobranMarcadosInactivos.length === 0 && (
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
  const [chip, setChip] = useState('nomina')
  const [q, setQ] = useState('')
  const [perfil, setPerfil] = useState(null)

  const costoPorRfc = useMemo(() => {
    const by = new Map()
    for (const p of res?.detalle?.nomina ?? []) by.set(p.rfc, p)
    return by
  }, [res])

  const todos = roster?.empleados ?? []
  // «En nómina» = cobró en los últimos 45 días (el flag isActive del padrón
  // marca inactiva a la mayoría de la gente que cobra). «En el piso» se mide
  // con el SBC del recibo del mes — autoridad de CFDI, no captura del padrón.
  const nomina = todos.filter(enNomina)
  const grupos = {
    nomina,
    bajas: todos.filter((e) => e.fechaBaja != null),
    padron: todos,
  }
  const CHIPS = [
    ['nomina', 'En nómina', grupos.nomina.length],
    ['bajas', 'Bajas', grupos.bajas.length],
    ['padron', 'Padrón completo', grupos.padron.length],
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
            const v = vsPiso(c?.sbcDiario, salarioMinimo)
            return (
              <div key={e.id} className="tarjeta-fila clicable" style={!enNomina(e) ? { opacity: 0.6 } : undefined}
                tabIndex={0} role="link"
                onClick={() => setPerfil(e)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPerfil(e) } }}>
                <div className="tf-alto">
                  <span className="tf-titulo">{e.nombreCompleto}</span>
                  <span className="tf-cifra">{c ? mxn(c.monto) : '—'}</span>
                </div>
                <div className="tf-bajo">
                  <span className="tf-sub">
                    {[e.puesto, e.departamento].filter(Boolean).join(' · ') || 'sin puesto'}
                    {c?.sbcDiario != null ? ` · SBC ${mxn2(c.sbcDiario)}` : ''}
                  </span>
                  {v === 'piso' && <span className="pill-motivo aviso">en el piso</span>}
                  {e.fechaBaja != null && <span className="pill-motivo">baja {dia(e.fechaBaja)}</span>}
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
              <th>Empleado</th><th>Puesto y plaza</th><th className="num">SBC del recibo</th>
              <th className="num">Costo del mes</th><th className="num">Recibos</th><th>Último pago</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => {
              const c = costoPorRfc.get(e.rfc)
              const v = vsPiso(c?.sbcDiario, salarioMinimo)
              return (
                <tr key={e.id} className="fila-liga" style={!enNomina(e) ? { opacity: 0.55 } : undefined}
                  tabIndex={0} role="link" title="Abrir el expediente"
                  onClick={() => setPerfil(e)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPerfil(e) } }}>
                  <td className="celda2">
                    <b>{e.nombreCompleto}</b>
                    <span className="mono">{e.rfc}</span>
                  </td>
                  <td className="celda2">
                    <b style={{ fontWeight: 400 }}>{e.puesto ?? '—'}</b>
                    <span>{e.departamento ?? ''}</span>
                  </td>
                  <td className="num">
                    {c?.sbcDiario != null ? (
                      <>
                        <span>{mxn2(c.sbcDiario)}</span>
                        <span style={{ display: 'block', fontSize: 10, color: v === 'piso' ? 'var(--warn)' : v === 'debajo' ? 'var(--neg)' : 'var(--ink3)' }}>
                          {v === 'piso' ? 'en el piso integrado' : v === 'debajo' ? 'debajo del piso' : 'sobre el piso'}
                        </span>
                      </>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>sin recibo en el mes</span>
                    )}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{c ? mxn(c.monto) : '—'}</td>
                  <td className="num">{c?.recibos ?? '—'}</td>
                  <td>
                    {'ultimoPago' in e ? dia(e.ultimoPago) : dia(e.fechaIngreso)}
                    {e.fechaBaja != null && <span className="pill-motivo" style={{ marginLeft: 6 }}>baja {dia(e.fechaBaja)}</span>}
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
        El SBC sale del <b>recibo timbrado del mes</b> — no de los campos de salario del padrón, que son captura
        vieja. Su piso legal es el mínimo integrado: {mxn2(salarioMinimo)} × {FACTOR_INTEGRACION} ≈{' '}
        {mxn2(salarioMinimo * FACTOR_INTEGRACION)}. «En nómina» se deriva de haber cobrado en los últimos{' '}
        {EN_NOMINA_DIAS} días, porque el flag de activo del padrón está desincronizado de la realidad de pago. Los
        CFDI no traen claves de comisión ni destajo, así que no hay columna de variable — todo viene timbrado como
        sueldo.
      </div>
      {perfil && <PerfilEmpleado empleado={perfil} onCerrar={() => setPerfil(null)} />}
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
          <NuevaCorrida companyId={companyId} roster={roster} corridas={corridas} onCreada={(id) => { setRunId(id); recargar() }} />
        </>
      )}

      {runId && (
        <CorridaEnCurso
          run={run} companyId={companyId} roster={roster} corridas={corridas} salarioMinimo={salarioMinimo}
          ocupado={ocupado} movil={movil}
          onRecargar={() => cargarRun(runId)}
          onSalir={() => { setRunId(null); setRun(null); recargar() }}
          onCambiarRun={(id) => setRunId(id)}
          onAccion={accion}
        />
      )}
    </>
  )
}

function NuevaCorrida({ companyId, roster, corridas, onCreada }) {
  const [pre, setPre] = useState(null)
  const [preErr, setPreErr] = useState(null)
  const [form, setForm] = useState(null)
  const [plantilla, setPlantilla] = useState('reciente')
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
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

  // Plantillas: la última corrida timbrada de CADA cadencia (semanal,
  // quincenal, mensual). MARGOM corre dos nóminas en paralelo — técnicos y
  // lavadores por semana, administrativos y ventas por quincena — y el
  // prefill del hub sólo propone la más reciente; sin esto, arrancar la otra
  // cadencia era capturar todo a mano.
  const plantillas = useMemo(() => {
    const vistas = new Map()
    for (const c of corridas ?? []) {
      if (c.tipo !== 'ORDINARIA' || (c.status !== 'STAMPED' && c.status !== 'PAID')) continue
      const cad = cadenciaDe(c)
      const previa = vistas.get(cad)
      if (!previa || new Date(c.fechaPago) > new Date(previa.fechaPago)) vistas.set(cad, c)
    }
    return [...vistas.entries()].map(([cadencia, run]) => ({ cadencia, run }))
      .sort((a, b) => new Date(b.run.fechaPago) - new Date(a.run.fechaPago))
  }, [corridas])

  const usarPlantilla = async (t) => {
    setPlantilla(t.run.id); setErr(null); setCargandoPlantilla(true)
    try {
      const sig = siguientePeriodoDe(t.run)
      if (!sig) throw new Error('El periodo de la corrida plantilla no se pudo leer.')
      // Los empleados de ESA corrida que siguen cobrando — lo mismo que hace
      // el prefill del hub con la más reciente.
      const det = await apiFetch(`/api/nomina/run/${t.run.id}`)
      const cobrando = new Set((roster?.empleados ?? []).filter(enNomina).map((e) => e.id))
      const ids = [...new Set((det.items ?? []).map((i) => i.employeeId))].filter((id) => cobrando.has(id))
      setForm(sig)
      setSeleccion(new Set(ids))
    } catch (e) { setErr(e.message) } finally { setCargandoPlantilla(false) }
  }

  const usarReciente = () => {
    setPlantilla('reciente'); setErr(null)
    if (pre) {
      setForm({
        periodoInicio: dia(pre.periodoInicio), periodoFin: dia(pre.periodoFin),
        fechaPago: dia(pre.fechaPago), diasPagados: pre.diasPagados,
      })
      setSeleccion(new Set(pre.employeeIds ?? []))
    }
  }

  // Elegibles: quien está EN NÓMINA (cobró hace poco), no el flag del padrón
  // — con el flag, 245 personas que cobran no aparecerían ni seleccionables.
  const activos = (roster?.empleados ?? []).filter(enNomina)

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
          {plantillas.length > 0 && (
            <div className="plantillas" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={`plantilla${plantilla === 'reciente' ? ' activa' : ''}`}
                onClick={usarReciente}
                disabled={!pre}
              >
                <b>La más reciente</b>
                <span>{pre ? `${cadenciaDe({ periodo: pre.basadoEnPeriodo })} · sigue a ${periodoLegible(pre.basadoEnPeriodo)}` : 'sin corrida anterior'}</span>
              </button>
              {plantillas.map((t) => (
                <button
                  type="button"
                  key={t.run.id}
                  className={`plantilla${plantilla === t.run.id ? ' activa' : ''}`}
                  onClick={() => usarPlantilla(t)}
                  disabled={cargandoPlantilla}
                >
                  <b>Siguiente {t.cadencia}</b>
                  <span>sigue a {periodoLegible(t.run.periodo)} · {t.run._count?.items ?? '—'} personas</span>
                </button>
              ))}
            </div>
          )}
          {cargandoPlantilla && <p className="muted">Leyendo la corrida plantilla…</p>}
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

// ─── El asistente sobre una corrida ──────────────────────────────────────
// Seis pasos como en el diseño, pero el riel refleja capacidades REALES:
// Percepciones es lectura (los importes nunca se editan a mano — las
// incidencias recalculan con el motor), Timbrado se abre cuando la corrida
// está calculada y Dispersión cuando está timbrada.

const PASOS = ['Periodo', 'Incidencias', 'Percepciones', 'Cálculo', 'Timbrado', 'Dispersión']

function CorridaEnCurso({ run, companyId, roster, corridas, salarioMinimo, ocupado, movil, onRecargar, onSalir, onCambiarRun, onAccion }) {
  const [pasoManual, setPasoManual] = useState(null)
  const [resultadoTimbre, setResultadoTimbre] = useState(null)

  useEffect(() => { setPasoManual(null); setResultadoTimbre(null) }, [run?.id])

  if (!run) return <p className="muted">Leyendo la corrida…</p>

  const timbrada = run.status === 'STAMPED' || run.status === 'PAID'
  const paso = pasoManual ?? (timbrada ? 6 : 2)
  const habilitado = (n) => {
    if (n === 5) return run.status === 'CALCULATED' || timbrada
    if (n === 6) return timbrada
    return true
  }

  const empPorId = new Map((roster?.empleados ?? []).map((e) => [e.id, e]))
  const incPorEmpleado = new Map()
  for (const x of run.incidencias ?? []) {
    const arr = incPorEmpleado.get(x.employeeId) ?? []
    arr.push(x); incPorEmpleado.set(x.employeeId, arr)
  }

  // Las corridas hermanas en curso (la otra cadencia del mismo momento):
  // MARGOM corre semanal y quincenal en paralelo y se brinca entre ambas.
  const hermanas = (corridas ?? []).filter((c) => c.status === 'DRAFT' || c.status === 'CALCULATED')

  return (
    <>
      <div className="rail-pasos">
        {PASOS.map((nombre, i) => {
          const n = i + 1
          return (
            <button
              type="button" key={nombre}
              className={`paso${n === paso ? ' activo' : ''}${n < paso && n > 1 ? ' hecho' : ''}${n === 1 ? ' hecho' : ''}`}
              disabled={!habilitado(n)}
              onClick={() => { if (n === 1) onSalir(); else setPasoManual(n) }}
            >
              <i>{n}</i> {nombre}
            </button>
          )
        })}
        <button type="button" className="ghost" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={onSalir}>← Corridas</button>
      </div>

      <div className="corrida-cabeza">
        <div>
          <span className="corrida-titulo">{periodoLegible(run.periodo)}</span>
          <span className="corrida-glosa">
            {run.items.length} empleados · {cadenciaDe(run)} · pago {dia(run.fechaPago)} · <EstadoCorrida c={run} />
          </span>
        </div>
        {hermanas.length > 1 && (
          <div className="corrida-hermanas">
            {hermanas.map((c) => (
              <button
                type="button" key={c.id}
                className={`hermana${c.id === run.id ? ' activa' : ''}`}
                onClick={() => { if (c.id !== run.id) onCambiarRun(c.id) }}
              >
                {cadenciaDe(c)[0].toUpperCase() + cadenciaDe(c).slice(1)} <b>{c._count?.items ?? 0}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={movil ? undefined : 'correr-cols'}>
        <div>
          {paso === 2 && (
            <>
              <GridIncidencias
                run={run} companyId={companyId} empPorId={empPorId} incPorEmpleado={incPorEmpleado}
                timbrada={timbrada} ocupado={ocupado} onAccion={onAccion} onRecargar={onRecargar}
              />
              <MovimientosPeriodo companyId={companyId} run={run} />
            </>
          )}
          {paso === 3 && <PasoPercepciones run={run} empPorId={empPorId} />}
          {paso === 4 && (
            <PasoCalculo run={run} empPorId={empPorId} timbrada={timbrada} ocupado={ocupado}
              onAccion={onAccion} onRecargar={onRecargar} onSalir={onSalir} />
          )}
          {paso === 5 && (
            <PasoTimbrado
              run={run} companyId={companyId} empPorId={empPorId} incPorEmpleado={incPorEmpleado}
              salarioMinimo={salarioMinimo} timbrada={timbrada} ocupado={ocupado}
              resultado={resultadoTimbre}
              onAccion={onAccion} onRecargar={onRecargar}
              onResultado={(r) => { setResultadoTimbre(r); setPasoManual(6) }}
            />
          )}
          {paso === 6 && <PasoDispersion run={run} ocupado={ocupado} resultado={resultadoTimbre} onAccion={onAccion} />}
        </div>

        <div>
          <SidebarCalculo run={run} incPorEmpleado={incPorEmpleado} />
          {!timbrada && paso !== 5 && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ gap: 10 }}>
                <span>Antes de timbrar</span>
              </div>
              <p className="glosa" style={{ margin: '0 0 10px' }}>
                Los bloqueos se revisan en el paso de Timbrado; la validación definitiva la hace el PAC al sellar.
              </p>
              <button type="button" disabled={run.status !== 'CALCULATED'} onClick={() => setPasoManual(5)}>
                Ir al timbrado →
              </button>
            </section>
          )}
          <ContraAnterior run={run} corridas={corridas} />
        </div>
      </div>
    </>
  )
}

/* Suma de días/horas/montos por tipo de incidencia de un empleado. */
const sumaInc = (incs, tipo, campo = 'dias') =>
  incs.filter((x) => x.tipo === tipo).reduce((a, x) => a + (x[campo] ?? 0), 0)

function GridIncidencias({ run, companyId, empPorId, incPorEmpleado, timbrada, ocupado, onAccion, onRecargar }) {
  const [sel, setSel] = useState(new Set())
  const [bonoMonto, setBonoMonto] = useState('')

  const inicioPeriodo = run.periodo.split('/')[0].slice(0, 10)

  // Editar una celda = reescribir las incidencias de ese tipo del empleado:
  // se eliminan las del periodo y se crea UNA con el valor nuevo (con
  // payrollRunId, para que el motor recalcule el recibo — los importes nunca
  // se editan a mano). El folio del IMSS de una incapacidad existente se
  // conserva al reescribir.
  const reescribir = (employeeId, tipo, valores) => onAccion(async () => {
    const previas = (incPorEmpleado.get(employeeId) ?? []).filter((x) => x.tipo === tipo)
    for (const x of previas) {
      await apiFetch('/api/nomina/incidencias', {
        method: 'POST',
        body: { companyId, action: 'delete', incidenciaId: x.id },
      })
    }
    if (valores) {
      await apiFetch('/api/nomina/incidencias', {
        method: 'POST',
        body: { companyId, payrollRunId: run.id, employeeId, tipo, fecha: inicioPeriodo, ...valores },
      })
    } else if (previas.length) {
      // Sólo se borró: recalcular al empleado explícitamente.
      await apiFetch(`/api/nomina/run/${run.id}/recalcular`, { method: 'POST', body: { employeeId } })
    }
    onRecargar()
  })

  const setDias = (employeeId, tipo, n) => {
    const previas = (incPorEmpleado.get(employeeId) ?? []).filter((x) => x.tipo === tipo)
    const folio = previas.find((x) => x.folioImss)?.folioImss
    if (n === sumaInc(incPorEmpleado.get(employeeId) ?? [], tipo)) return
    reescribir(employeeId, tipo, n > 0 ? { dias: n, ...(folio ? { folioImss: folio } : {}) } : null)
  }
  const setHoras = (employeeId, h) => {
    if (h === sumaInc(incPorEmpleado.get(employeeId) ?? [], 'HORAS_EXTRA', 'horas')) return
    reescribir(employeeId, 'HORAS_EXTRA', h > 0 ? { horas: h } : null)
  }
  const setMonto = (employeeId, tipo, m) => {
    if (m === sumaInc(incPorEmpleado.get(employeeId) ?? [], tipo, 'monto')) return
    reescribir(employeeId, tipo, m > 0 ? { monto: m } : null)
  }

  const marcarFalta = () => onAccion(async () => {
    for (const id of sel) {
      const n = sumaInc(incPorEmpleado.get(id) ?? [], 'FALTA') + 1
      const previas = (incPorEmpleado.get(id) ?? []).filter((x) => x.tipo === 'FALTA')
      for (const x of previas) {
        await apiFetch('/api/nomina/incidencias', { method: 'POST', body: { companyId, action: 'delete', incidenciaId: x.id } })
      }
      await apiFetch('/api/nomina/incidencias', {
        method: 'POST',
        body: { companyId, payrollRunId: run.id, employeeId: id, tipo: 'FALTA', fecha: inicioPeriodo, dias: n },
      })
    }
    onRecargar()
  })

  const aplicarBono = () => {
    const m = Number(bonoMonto)
    if (!m || m <= 0) return
    onAccion(async () => {
      for (const id of sel) {
        await apiFetch('/api/nomina/incidencias', {
          method: 'POST',
          body: { companyId, payrollRunId: run.id, employeeId: id, tipo: 'BONO', fecha: inicioPeriodo, monto: m },
        })
      }
      setBonoMonto('')
      onRecargar()
    })
  }

  const todos = run.items.map((i) => i.employeeId)
  const todosSel = todos.length > 0 && todos.every((id) => sel.has(id))

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      {!timbrada && (
        <div className="toolbar-grid">
          <label className="sel-todo">
            <input type="checkbox" style={{ width: 'auto' }} checked={todosSel}
              onChange={(e) => setSel(e.target.checked ? new Set(todos) : new Set())} />
            {sel.size > 0 ? `${sel.size} seleccionados` : 'seleccionar'}
          </label>
          <span className="toolbar-acciones">
            <input type="number" min="0" step="50" placeholder="$ bono" value={bonoMonto}
              onChange={(e) => setBonoMonto(e.target.value)} style={{ width: 90 }} />
            <button type="button" className="ghost" disabled={ocupado || sel.size === 0 || !Number(bonoMonto)} onClick={aplicarBono}>
              Aplicar bono
            </button>
            <button type="button" className="ghost" disabled={ocupado || sel.size === 0} onClick={marcarFalta}>
              Marcar falta
            </button>
          </span>
          <span className="toolbar-nota">
            el checador y el pegado desde Excel no están conectados — las incidencias se capturan aquí
          </span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla grid-incidencias">
          <thead>
            <tr>
              {!timbrada && <th style={{ width: 28 }} />}
              <th>Empleado</th><th className="num">Días</th><th className="num">Faltas</th>
              <th className="num">Incap.</th><th className="num">H. extra</th>
              <th className="num">Comisión</th><th className="num">Bono</th>
              <th className="num">Deducciones</th><th className="num">Neto</th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((i) => {
              const e = empPorId.get(i.employeeId)
              const incs = incPorEmpleado.get(i.employeeId) ?? []
              const faltas = sumaInc(incs, 'FALTA')
              const incap = sumaInc(incs, 'INCAPACIDAD')
              const hextra = sumaInc(incs, 'HORAS_EXTRA', 'horas')
              const comision = sumaInc(incs, 'COMISION', 'monto')
              const bono = sumaInc(incs, 'BONO', 'monto')
              const incapSinFolio = incs.some((x) => x.tipo === 'INCAPACIDAD' && !x.folioImss)
              const marcada = incapSinFolio || i.netoAPagar <= 0
              return (
                <tr key={i.id} className={marcada ? 'fila-marcada' : undefined}>
                  {!timbrada && (
                    <td>
                      <input type="checkbox" style={{ width: 'auto' }} checked={sel.has(i.employeeId)}
                        onChange={(ev) => {
                          const s = new Set(sel)
                          if (ev.target.checked) s.add(i.employeeId); else s.delete(i.employeeId)
                          setSel(s)
                        }} />
                    </td>
                  )}
                  <td className="celda2">
                    <b>{e?.nombreCompleto ?? (i.employee ? `${i.employee.nombre} ${i.employee.apellidoPaterno}` : '—')}</b>
                    <span>{e ? [e.puesto, e.departamento].filter(Boolean).join(' · ') : ''}</span>
                  </td>
                  <td className="num">{Math.max(0, (run.extraData?.diasPagados ?? diasDelPeriodo(run)) - faltas - incap)}</td>
                  <CeldaNum valor={faltas} disabled={timbrada || ocupado} onCommit={(n) => setDias(i.employeeId, 'FALTA', n)} alerta={faltas > 0} />
                  <CeldaNum valor={incap} disabled={timbrada || ocupado} onCommit={(n) => setDias(i.employeeId, 'INCAPACIDAD', n)} alerta={incapSinFolio} />
                  <CeldaNum valor={hextra} disabled={timbrada || ocupado} paso={0.5} onCommit={(n) => setHoras(i.employeeId, n)} />
                  <CeldaNum valor={comision} disabled={timbrada || ocupado} dinero paso={50} onCommit={(n) => setMonto(i.employeeId, 'COMISION', n)} />
                  <CeldaNum valor={bono} disabled={timbrada || ocupado} dinero paso={50} onCommit={(n) => setMonto(i.employeeId, 'BONO', n)} />
                  <td className="num">
                    {mxn(i.totalDeducciones)}
                    <span className="glosa-celda">ISR e IMSS</span>
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: i.netoAPagar <= 0 ? 'var(--neg)' : undefined }}>
                    {mxn2(i.netoAPagar)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              {!timbrada && <td />}
              <td className="alcance">{run.items.length} empleados{sel.size > 0 ? ` · ${sel.size} seleccionados` : ''}</td>
              <td />
              <td className="num">{run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], 'FALTA'), 0) || ''}</td>
              <td className="num">{run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], 'INCAPACIDAD'), 0) || ''}</td>
              <td className="num">{run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], 'HORAS_EXTRA', 'horas'), 0) || ''}</td>
              <td className="num">{mxn(run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], 'COMISION', 'monto'), 0))}</td>
              <td className="num">{mxn(run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], 'BONO', 'monto'), 0))}</td>
              <td className="num">{mxn(run.totalDeducciones)}</td>
              <td className="num">{mxn2(run.totalNeto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card-note">
        Cada celda reescribe las incidencias del empleado y el motor recalcula su recibo — los importes nunca se
        editan a mano, y toda captura queda en la bitácora con quién la hizo. Un periodo timbrado no cambia.
      </div>
    </section>
  )
}

/* Días del periodo de una corrida, del propio texto "inicio/fin". */
const diasDelPeriodo = (run) => {
  const [a, b] = run.periodo.split('/')
  const n = Math.round((new Date(b) - new Date(a)) / 86400000) + 1
  return Number.isFinite(n) && n > 0 ? n : 15
}

/* Celda numérica editable: committea al salir o con Enter, no por tecla —
   cada commit dispara incidencias + recálculo en el servidor. */
function CeldaNum({ valor, onCommit, disabled, dinero, paso = 1, alerta }) {
  const [texto, setTexto] = useState(null)
  const mostrado = texto ?? (dinero ? (valor > 0 ? String(valor) : '') : String(valor))
  const commit = () => {
    if (texto == null) return
    const n = Math.max(0, Number(texto) || 0)
    setTexto(null)
    onCommit(n)
  }
  return (
    <td className="num celda-edit">
      <input
        type="number" min="0" step={paso} inputMode="decimal"
        className={alerta ? 'alerta' : undefined}
        value={mostrado} placeholder={dinero ? '—' : '0'}
        disabled={disabled}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </td>
  )
}

function PasoPercepciones({ run, empPorId }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ gap: 10 }}>
        <span>Percepciones por empleado</span>
        <span className="muted" style={{ fontWeight: 400 }}>lectura — se cambian con incidencias, nunca a mano</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th className="num">Sueldo</th><th className="num">H. extra</th>
              <th className="num">Bonos</th><th className="num">Extraordinarias</th>
              <th className="num">Otras</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((i) => (
              <tr key={i.id}>
                <td className="celda2">
                  <b>{empPorId.get(i.employeeId)?.nombreCompleto ?? '—'}</b>
                </td>
                <td className="num">{mxn2(i.sueldoBase)}</td>
                <td className="num">{i.horasExtra > 0 ? mxn2(i.horasExtra) : '—'}</td>
                <td className="num">{(i.bonosPagoFijo + i.bonosPagoVar + i.vales) > 0 ? mxn2(i.bonosPagoFijo + i.bonosPagoVar + i.vales) : '—'}</td>
                <td className="num">{(i.aguinaldo + i.primaVacacional + i.vacaciones + i.ptu) > 0 ? mxn2(i.aguinaldo + i.primaVacacional + i.vacaciones + i.ptu) : '—'}</td>
                <td className="num">{i.otrasPercepciones > 0 ? mxn2(i.otrasPercepciones) : '—'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{mxn2(i.totalPercepciones)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="alcance">{run.items.length} empleados</td>
              <td className="num" colSpan={5} />
              <td className="num">{mxn2(run.totalPercepciones)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function PasoCalculo({ run, empPorId, timbrada, ocupado, onAccion, onRecargar, onSalir }) {
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  const recalcular = () => onAccion(async () => {
    await apiFetch(`/api/nomina/run/${run.id}/recalcular`, { method: 'POST' })
    onRecargar()
  })
  const borrar = () => onAccion(async () => {
    await apiFetch(`/api/nomina/run/${run.id}`, { method: 'DELETE' })
    onSalir()
  })
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ gap: 10, justifyContent: 'space-between' }}>
        <span>Cálculo por empleado</span>
        {!timbrada && (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ghost" disabled={ocupado} onClick={recalcular}>Recalcular</button>
            {!confirmaBorrar
              ? <button type="button" className="ghost" disabled={ocupado} onClick={() => setConfirmaBorrar(true)}>Descartar</button>
              : <button type="button" className="peligro" disabled={ocupado} onClick={borrar}>Confirmar descarte</button>}
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th className="num">Percepciones</th><th className="num">ISR</th>
              <th className="num">IMSS obrero</th><th className="num">INFONAVIT</th>
              <th className="num">Otras deducc.</th><th className="num">Neto</th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((i) => (
              <tr key={i.id}>
                <td className="celda2"><b>{empPorId.get(i.employeeId)?.nombreCompleto ?? '—'}</b></td>
                <td className="num">{mxn2(i.totalPercepciones)}</td>
                <td className="num">{mxn2(i.isrRetenido)}</td>
                <td className="num">{mxn2(i.imssObrero)}</td>
                <td className="num">{i.infonavit > 0 ? mxn2(i.infonavit) : '—'}</td>
                <td className="num">{i.otrasDeducc > 0 ? mxn2(i.otrasDeducc) : '—'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{mxn2(i.netoAPagar)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="alcance">{run.items.length} recibos</td>
              <td className="num">{mxn2(run.totalPercepciones)}</td>
              <td className="num" colSpan={4} />
              <td className="num">{mxn2(run.totalNeto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function PasoTimbrado({ run, companyId, empPorId, incPorEmpleado, salarioMinimo, timbrada, ocupado, resultado, onAccion, onRecargar, onResultado }) {
  const [confirma, setConfirma] = useState(false)
  const [folios, setFolios] = useState({})

  const sinCurp = run.items.filter((i) => !empPorId.get(i.employeeId)?.curp)
  const incapsSinFolio = (run.incidencias ?? []).filter((x) => x.tipo === 'INCAPACIDAD' && !x.folioImss)
  const bajoMinimo = run.items.filter((i) => {
    const e = empPorId.get(i.employeeId)
    return e && vsMinimo(e.salarioDiario, salarioMinimo) === 'debajo'
  })
  const bloqueos = sinCurp.length + incapsSinFolio.length

  // El folio de una incapacidad se captura reescribiendo la incidencia (el
  // endpoint no tiene update): eliminar + crear con los mismos días y fecha.
  const capturarFolio = (inc) => {
    const folio = (folios[inc.id] ?? '').trim()
    if (!folio) return
    onAccion(async () => {
      await apiFetch('/api/nomina/incidencias', { method: 'POST', body: { companyId, action: 'delete', incidenciaId: inc.id } })
      await apiFetch('/api/nomina/incidencias', {
        method: 'POST',
        body: {
          companyId, payrollRunId: run.id, employeeId: inc.employeeId, tipo: 'INCAPACIDAD',
          fecha: dia(inc.fecha), dias: inc.dias, folioImss: folio,
        },
      })
      onRecargar()
    })
  }

  const timbrar = () => onAccion(async () => {
    const r = await apiFetch(`/api/nomina/run/${run.id}/stamp`, { method: 'POST' })
    setConfirma(false)
    onResultado(r)
    onRecargar()
  })

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ gap: 10 }}>
        <span>Antes de timbrar</span>
        {bloqueos > 0 && <span style={{ color: 'var(--neg)', fontSize: 11.5 }}>{bloqueos} bloqueo(s)</span>}
      </div>
      <p className="glosa" style={{ margin: '0 0 12px' }}>
        El timbrado es el punto sin retorno: una vez sellado el CFDI, corregir exige cancelar y refacturar.
        La validación definitiva la hace el PAC; lo que el SAT rechace aparece abajo como error.
      </p>
      <div className="riesgos">
        {sinCurp.length > 0 && (
          <div className="riesgo-fila grave estatico">
            <div>
              <b>{sinCurp.length} empleado(s) sin CURP en el expediente</b>
              <span>
                el CFDI de nómina 1.2 la exige — {sinCurp.map((i) => empPorId.get(i.employeeId)?.nombreCompleto).filter(Boolean).slice(0, 3).join(', ')}
                {sinCurp.length > 3 ? '…' : ''}. Se captura en el hub, en la ficha del empleado.
              </span>
            </div>
          </div>
        )}
        {incapsSinFolio.map((inc) => (
          <div key={inc.id} className="riesgo-fila grave estatico">
            <div>
              <b>Incapacidad sin folio del IMSS</b>
              <span>{empPorId.get(inc.employeeId)?.nombreCompleto ?? '—'} · {inc.dias} día(s) desde {dia(inc.fecha)}</span>
            </div>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <input type="text" placeholder="folio" style={{ width: 120 }}
                value={folios[inc.id] ?? ''}
                onChange={(e) => setFolios({ ...folios, [inc.id]: e.target.value })} />
              <button type="button" className="ghost" disabled={ocupado || !(folios[inc.id] ?? '').trim()} onClick={() => capturarFolio(inc)}>
                Capturar
              </button>
            </span>
          </div>
        ))}
        {bajoMinimo.length > 0 && (
          <div className="riesgo-fila aviso estatico">
            <div>
              <b>{bajoMinimo.length} salario(s) del padrón por debajo del mínimo</b>
              <span>el motor calcula con el salario capturado en el padrón; el timbre no se bloquea, pero el IMSS rechaza movimientos sub-mínimos</span>
            </div>
          </div>
        )}
        {bloqueos === 0 && bajoMinimo.length === 0 && (
          <div className="riesgo-fila estatico" style={{ borderLeftColor: 'var(--pos)' }}>
            <div><b>Sin bloqueos visibles</b><span>CURP completas e incapacidades con folio</span></div>
          </div>
        )}
      </div>

      {!timbrada && (
        <div style={{ marginTop: 14 }}>
          {!confirma ? (
            <button type="button" disabled={ocupado || run.status !== 'CALCULATED' || bloqueos > 0} onClick={() => setConfirma(true)}>
              Timbrar {run.items.length} recibo(s)
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="peligro" disabled={ocupado} onClick={timbrar}>
                {ocupado ? 'Timbrando…' : 'Confirmar — es el punto sin retorno'}
              </button>
              <button type="button" className="ghost" onClick={() => setConfirma(false)}>Cancelar</button>
            </div>
          )}
          {bloqueos > 0 && (
            <p className="glosa" style={{ marginTop: 8 }}>El timbre se habilita al resolver los bloqueos de arriba.</p>
          )}
        </div>
      )}

      {resultado && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            <b>{resultado.stamped} de {resultado.total}</b> recibos timbrados.
          </p>
          {(resultado.errors ?? []).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--neg)' }}>
              {resultado.errors.slice(0, 8).map((e, i) => <li key={i}>{String(e)}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function PasoDispersion({ run, ocupado, resultado, onAccion }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">Dispersión</div>
      {resultado && (
        <p style={{ margin: '0 0 10px', fontSize: 13 }}>
          <b>{resultado.stamped} de {resultado.total}</b> recibos timbrados
          {(resultado.errors ?? []).length > 0 ? ` · ${resultado.errors.length} con error` : ''}.
        </p>
      )}
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink2)' }}>
        Archivo SPEI por lotes (CSV compatible con BBVA, Banorte, Santander y Banamex). Usa la CLABE capturada en
        cada empleado; los que no la tengan salen sin cuenta y se pagan a mano.
      </p>
      <button type="button" disabled={ocupado}
        onClick={() => onAccion(() => apiDownload(`/api/nomina/dispersion?runId=${run.id}`, `dispersion-${run.periodo.replaceAll('/', '_')}.csv`))}>
        Descargar archivo de dispersión
      </button>
    </section>
  )
}

function SidebarCalculo({ run, incPorEmpleado }) {
  const suma = (campo) => run.items.reduce((a, i) => a + (i[campo] ?? 0), 0)
  const sumaTipo = (tipo, campo = 'monto') =>
    run.items.reduce((a, i) => a + sumaInc(incPorEmpleado.get(i.employeeId) ?? [], tipo, campo), 0)
  const comisiones = sumaTipo('COMISION')
  const bonosHoras = sumaTipo('BONO') + suma('horasExtra')
  const patronal = suma('imssPatronal')
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ gap: 10 }}>
        <span>Cálculo de la corrida</span>
        <span className="muted" style={{ fontWeight: 400 }}>{run.items.length} empleados</span>
      </div>
      <FilaResumen label="Sueldos del periodo" valor={mxn(suma('sueldoBase'))} />
      <FilaResumen label="Comisiones (incidencias)" valor={comisiones > 0 ? mxn(comisiones) : '—'} />
      <FilaResumen label="Bonos y horas extra" valor={bonosHoras > 0 ? mxn(bonosHoras) : '—'} />
      <FilaResumen fuerte label="Total de percepciones" valor={mxn(run.totalPercepciones)} />
      <FilaResumen label="ISR retenido" valor={mxn(suma('isrRetenido'))} />
      <FilaResumen label="IMSS obrero, INFONAVIT y otros" valor={mxn(suma('imssObrero') + suma('infonavit') + suma('otrasDeducc'))} />
      <FilaResumen fuerte label="Neto a dispersar" valor={mxn2(run.totalNeto)} />
      {patronal > 0 && (
        <div className="costo-patronal">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Costo patronal real</span>
            <b>{mxn(run.totalPercepciones + patronal)}</b>
          </div>
          <p>
            Lo que sale del banco más las cuotas patronales. Es la cifra que entra al estado de resultados, no el neto.
          </p>
        </div>
      )}
    </section>
  )
}

function ContraAnterior({ run, corridas }) {
  const anterior = (corridas ?? [])
    .filter((c) =>
      c.id !== run.id && c.tipo === 'ORDINARIA' &&
      (c.status === 'STAMPED' || c.status === 'PAID') &&
      cadenciaDe(c) === cadenciaDe(run) &&
      new Date(c.fechaPago) < new Date(run.fechaPago))
    .sort((a, b) => new Date(b.fechaPago) - new Date(a.fechaPago))[0]
  if (!anterior) return null
  const delta = (a, b) => {
    const d = a - b
    return `${d >= 0 ? '+' : '−'}${mxn(Math.abs(d))}`
  }
  const dPlantilla = run.items.length - (anterior._count?.items ?? 0)
  return (
    <section className="card">
      <div className="card-head">Contra la corrida anterior</div>
      <FilaResumen label="Percepciones" valor={delta(run.totalPercepciones, anterior.totalPercepciones)} />
      <FilaResumen label="Neto" valor={delta(run.totalNeto, anterior.totalNeto)} />
      <FilaResumen label="Plantilla" valor={dPlantilla === 0 ? `${run.items.length} · sin cambio` : `${run.items.length} · ${dPlantilla > 0 ? `+${dPlantilla} alta(s)` : `${dPlantilla} baja(s)`}`} />
      <p className="glosa" style={{ marginTop: 8 }}>
        comparada contra la {cadenciaDe(anterior)} de {periodoLegible(anterior.periodo)}
      </p>
    </section>
  )
}

function MovimientosPeriodo({ companyId, run }) {
  const [movs, setMovs] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let vivo = true
    apiFetch(`/api/nomina/imss-movimientos?companyId=${companyId}`)
      .then((d) => { if (vivo) setMovs(d.movimientos ?? []) })
      .catch((e) => { if (vivo) setErr(e.message) })
    return () => { vivo = false }
  }, [companyId, run.id])

  // Del periodo o pendientes de avisar: un alta vieja sin IDSE sigue siendo
  // asunto de HOY aunque su fecha quede fuera del periodo.
  const [iniS, finS] = run.periodo.split('/')
  const visibles = (movs ?? []).filter((m) => {
    const f = new Date(m.fechaMovimiento)
    return m.status === 'PENDING' || (f >= new Date(iniS) && f <= new Date(finS))
  })

  const MOV = {
    ALTA: { texto: 'Alta', color: 'var(--pos)' },
    REINGRESO: { texto: 'Reingreso', color: 'var(--pos)' },
    BAJA: { texto: 'Baja', color: 'var(--neg)' },
    MODIFICACION_SALARIO: { texto: 'Cambio', color: 'var(--ink2)' },
  }
  // Plazo del aviso: 5 días hábiles desde el movimiento (Art. 15 LSS).
  const plazoIdse = (m) => {
    const d = new Date(m.fechaMovimiento)
    let habiles = 0
    while (habiles < 5) {
      d.setUTCDate(d.getUTCDate() + 1)
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) habiles++
    }
    return d
  }

  if (err) return <section className="card"><div className="card-head">Movimientos del periodo</div><div className="error">{err}</div></section>
  if (movs == null) return null
  return (
    <section className="card">
      <div className="card-head" style={{ gap: 10, justifyContent: 'space-between' }}>
        <span>
          Movimientos del periodo
          <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
            altas, bajas y cambios de salario se avisan al IMSS dentro de 5 días hábiles
          </span>
        </span>
        {visibles.some((m) => m.status === 'PENDING') && (
          <button type="button" className="ghost"
            onClick={() => apiDownload(`/api/nomina/imss-movimientos?companyId=${companyId}&format=idse&status=PENDING`, 'movimientos-idse.txt').catch(() => {})}>
            Descargar lote IDSE
          </button>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin movimientos en el periodo ni avisos pendientes.</p>
      ) : (
        <div className="riesgos">
          {visibles.map((m) => {
            const t = MOV[m.tipo] ?? { texto: m.tipo, color: 'var(--ink2)' }
            const limite = plazoIdse(m)
            const vencido = m.status === 'PENDING' && limite < new Date()
            return (
              <div key={m.id} className="mov-fila">
                <span className="mov-tipo" style={{ color: t.color }}>{t.texto}</span>
                <div>
                  <b>{m.employee ? `${m.employee.nombre} ${m.employee.apellidoPaterno}` : '—'}</b>
                  <span>
                    {m.tipo === 'MODIFICACION_SALARIO' && m.sbcAnterior != null
                      ? `SBC ${mxn2(m.sbcAnterior)} → ${mxn2(m.sbcNuevo)}`
                      : m.sbcNuevo != null ? `SBC ${mxn2(m.sbcNuevo)}` : ''}
                    {m.motivo ? ` · ${m.motivo}` : ''} · {dia(m.fechaMovimiento)}
                  </span>
                </div>
                <span className="mov-estado" style={vencido ? { color: 'var(--neg)' } : undefined}>
                  {m.status === 'PENDING'
                    ? vencido ? `aviso vencido desde ${dia(limite)}` : `avisar al IMSS antes del ${dia(limite)}`
                    : `enviado${m.filedAt ? ` el ${dia(m.filedAt)}` : ''}${m.idseConfirmation ? ` · ${m.idseConfirmation}` : ''}`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── Expediente del empleado ────────────────────────────────────────────── */

const TIPOS_DOC = [
  ['CONTRATO', 'Contrato'],
  ['IDENTIFICACION', 'Identificación'],
  ['CSF', 'Constancia fiscal'],
  ['ALTA_IMSS', 'Alta IMSS'],
  ['OTRO', 'Otro'],
]

function PerfilEmpleado({ empleado, onCerrar }) {
  const [data, setData] = useState(null)
  const [anio, setAnio] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let vivo = true
    setErr(null)
    apiFetch(`/api/nomina/empleado/${empleado.id}${anio ? `?year=${anio}` : ''}`)
      .then((d) => { if (vivo) { setData(d); setAnio(d.anio) } })
      .catch((e) => { if (vivo) setErr(e.message) })
    return () => { vivo = false }
  }, [empleado.id, anio])

  const e = data?.empleado
  const ac = data?.acumulados

  return (
    <VentanaDetalle
      titulo={empleado.nombreCompleto}
      glosa={[empleado.puesto, empleado.departamento].filter(Boolean).join(' · ')}
      onCerrar={onCerrar}
    >
      {err && <div className="error">{err}</div>}
      {!data && !err && <p className="muted">Leyendo el expediente…</p>}
      {data && e && (
        <>
          <div className="ficha-datos">
            <div><span>RFC</span><b className="mono">{e.rfc}</b></div>
            <div><span>CURP</span><b className="mono">{e.curp || 'sin capturar'}</b></div>
            <div><span>NSS</span><b className="mono">{e.nss || 'sin capturar'}</b></div>
            <div><span>Ingreso</span><b>{dia(e.fechaIngreso)}</b></div>
            {e.fechaBaja && <div><span>Baja</span><b>{dia(e.fechaBaja)}</b></div>}
            <div>
              <span>Cuenta para dispersión</span>
              <b>{e.clabe ? `${e.banco ?? ''} ${e.clabe}`.trim() : 'sin CLABE — se paga a mano'}</b>
            </div>
            <div>
              <span>Salario del padrón</span>
              <b>
                {mxn2(e.salarioDiario)}/día
                <i className="ficha-nota"> — captura; el SBC con autoridad es el del recibo</i>
              </b>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 6px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Ejercicio {data.anio}</span>
            {(data.anios ?? []).length > 1 && (
              <select value={data.anio} style={{ width: 'auto' }} onChange={(ev) => setAnio(Number(ev.target.value))}>
                {data.anios.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
          {ac && (
            <div className="kpi-strip densa">
              <div className="kpi-item">
                <div className="kpi-label">Percepciones</div>
                <div className="kpi">{mxn(ac.percepciones?.total)}</div>
                <div className="kpi-sub">{ac.recibos} recibos</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-label">ISR retenido</div>
                <div className="kpi">{mxn(ac.deducciones?.isrRetenido)}</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-label">IMSS + INFONAVIT</div>
                <div className="kpi">{mxn((ac.deducciones?.imssObrero ?? 0) + (ac.deducciones?.infonavit ?? 0))}</div>
              </div>
            </div>
          )}

          {(data.recibos?.items ?? []).length > 0 && (
            <table className="tabla" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Periodo</th><th className="num">Percepciones</th>
                  <th className="num">Neto</th><th>CFDI</th>
                </tr>
              </thead>
              <tbody>
                {data.recibos.items.map((r) => (
                  <tr key={r.id}>
                    <td className="celda2">
                      <b style={{ fontWeight: 400 }}>{periodoLegible(r.periodo)}</b>
                      <span>{r.tipo.toLowerCase()} · pago {dia(r.fechaPago)}</span>
                    </td>
                    <td className="num">{mxn2(r.totalPercepciones)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{mxn2(r.netoAPagar)}</td>
                    <td>
                      {r.pdfDisponible && r.invoiceId ? (
                        <button type="button" className="ghost mini"
                          onClick={() => apiDownload(`/api/facturas/${r.invoiceId}/download?format=pdf`, `recibo-${dia(r.fechaPago)}.pdf`).catch(() => {})}>
                          PDF
                        </button>
                      ) : r.cfdiUuid ? (
                        <span className="mono" style={{ fontSize: 10 }}>{r.cfdiUuid.slice(0, 8)}</span>
                      ) : (
                        <span className="pill-motivo grave">sin timbrar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.recibos?.total > (data.recibos?.items ?? []).length && (
            <p className="glosa" style={{ marginTop: 6 }}>
              {data.recibos.items.length} de {data.recibos.total} recibos del ejercicio — el resto vive en el hub.
            </p>
          )}

          {(data.cambiosSalario ?? []).length > 0 && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, margin: '16px 0 6px' }}>Historial salarial (IMSS)</div>
              <div className="lista-tarjetas">
                {data.cambiosSalario.slice(0, 6).map((m) => (
                  <div key={m.id} className="tarjeta-fila">
                    <div className="tf-alto">
                      <span className="tf-titulo" style={{ fontWeight: 400 }}>{m.tipo.toLowerCase().replaceAll('_', ' ')}</span>
                      <span className="tf-cifra" style={{ fontSize: 12.5 }}>
                        {m.sbcAnterior != null ? `${mxn2(m.sbcAnterior)} → ` : ''}{mxn2(m.sbcNuevo)}
                      </span>
                    </div>
                    <div className="tf-bajo"><span className="tf-sub">{dia(m.fechaMovimiento)}{m.motivo ? ` · ${m.motivo}` : ''}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}

          <DocumentosEmpleado employeeId={empleado.id} />
        </>
      )}
    </VentanaDetalle>
  )
}

function DocumentosEmpleado({ employeeId }) {
  const [docs, setDocs] = useState(null)
  const [err, setErr] = useState(null)
  const [tipo, setTipo] = useState('CONTRATO')
  const [subiendo, setSubiendo] = useState(false)
  const [borrar, setBorrar] = useState(null)

  const cargar = useCallback(() => {
    apiFetch(`/api/nomina/empleado/${employeeId}/documentos`)
      .then((d) => setDocs(d.documentos ?? []))
      .catch((e) => setErr(e.message))
  }, [employeeId])
  useEffect(() => { cargar() }, [cargar])

  const subir = (archivo) => {
    if (!archivo) return
    setSubiendo(true); setErr(null)
    const lector = new FileReader()
    lector.onerror = () => { setErr('No se pudo leer el archivo.'); setSubiendo(false) }
    lector.onload = async () => {
      try {
        const base64 = String(lector.result).split(',')[1] ?? ''
        await apiFetch(`/api/nomina/empleado/${employeeId}/documentos`, {
          method: 'POST',
          body: { tipo, nombre: archivo.name, mime: archivo.type || 'application/pdf', base64 },
        })
        cargar()
      } catch (e) { setErr(e.message) } finally { setSubiendo(false) }
    }
    lector.readAsDataURL(archivo)
  }

  const eliminar = async (d) => {
    try {
      await apiFetch(`/api/nomina/empleado/${employeeId}/documentos/${d.id}`, { method: 'DELETE' })
      setBorrar(null); cargar()
    } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 6px', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Documentos</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={tipo} style={{ width: 'auto' }} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DOC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <label className={`boton-archivo${subiendo ? ' ocupado' : ''}`}>
            {subiendo ? 'Subiendo…' : 'Subir archivo'}
            <input type="file" accept=".pdf,image/jpeg,image/png,image/webp,.xml" disabled={subiendo}
              onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </span>
      </div>
      {err && <div className="error">{err}</div>}
      {docs == null && !err && <p className="muted">Leyendo documentos…</p>}
      {docs != null && docs.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>Sin documentos — el contrato firmado es el primero que vale la pena subir.</p>
      )}
      {docs != null && docs.length > 0 && (
        <div className="lista-tarjetas">
          {docs.map((d) => (
            <div key={d.id} className="tarjeta-fila">
              <div className="tf-alto">
                <span className="tf-titulo" style={{ fontWeight: 400 }}>{d.nombre}</span>
                <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" className="ghost mini"
                    onClick={() => apiDownload(`/api/nomina/empleado/${employeeId}/documentos/${d.id}`, d.nombre).catch(() => {})}>
                    Descargar
                  </button>
                  {borrar === d.id ? (
                    <button type="button" className="ghost mini" style={{ color: 'var(--neg)' }} onClick={() => eliminar(d)}>¿Eliminar?</button>
                  ) : (
                    <button type="button" className="ghost mini" onClick={() => setBorrar(d.id)}>×</button>
                  )}
                </span>
              </div>
              <div className="tf-bajo">
                <span className="tf-sub">
                  {(TIPOS_DOC.find(([k]) => k === d.tipo)?.[1] ?? d.tipo).toLowerCase()} · {(d.bytes / 1048576).toFixed(1)} MB · {dia(d.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
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

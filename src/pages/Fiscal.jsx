import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { AvisoError } from '../components/Estados'
import CfdiVista from '../components/CfdiVista'
import { useEsMovil } from '../lib/pantalla'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(n * 100 % 1 ? 2 : 0)}%`)
const VISTAS = [['resumen', 'Resumen'], ['papeles', 'Papeles de trabajo'], ['revision', 'Revisión']]
const PAPELES = [['iva', 'IVA'], ['isr', 'ISR provisional'], ['isan', 'ISAN'], ['retenciones', 'Retenciones']]

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Estado del checklist → badge del sistema (mismos tintes que el inventario).
const BADGE = { listo: 'badge-DISPONIBLE', pendiente: 'badge-APARTADO', atencion: 'badge-CANCELADO', 'no-aplica': 'badge-ENTREGADO' }
const ETIQUETA = { listo: 'Listo', pendiente: 'Pendiente', atencion: 'Atención', 'no-aplica': 'No aplica' }

// Renglón de desglose dentro de una tarjeta (patrón del mockup: etiqueta a la
// izquierda, importe a la derecha, divisor fino; sin tabla).
function Fila({ label, valor, fuerte, tenue }) {
  const color = tenue ? 'var(--muted)' : fuerte ? 'var(--ink)' : 'var(--ink-3)'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: 'var(--rowpad) 0', borderBottom: '1px solid var(--border-hairline)',
    }}>
      <span style={{ fontSize: 12.5, color, fontWeight: fuerte ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: tenue ? 'var(--muted)' : 'var(--ink)', fontWeight: fuerte ? 600 : 400 }}>{valor}</span>
    </div>
  )
}



// ── El papel de trabajo: un renglón por CFDI ────────────────────────────────
// Una cifra fiscal sin los comprobantes que la sostienen no se defiende ante
// nadie. Cada renglón dice de dónde sale su IVA y, cuando NO cuenta, por qué.
//
// Los motivos no son intercambiables y por eso se distinguen:
//   · «sin complemento» y «parcial» son cuestión de TIEMPO — el REP llegará.
//   · «sin pago» es el Art. 5-I: sólo es acreditable lo efectivamente pagado.
//   · «69-B» no lo destraba el tiempo ni el criterio del contador: lo publica
//     el SAT, y por eso ese renglón ni siquiera ofrece la acción de incluirlo.
function MotivoIva({ r }) {
  if (r.emisorEnLista69B) {
    return <span className="pill-motivo grave" title="El emisor aparece en la lista 69-B del SAT como DEFINITIVO: la deducción y el IVA son improcedentes (Art. 69-B CFF)">proveedor en la lista 69-B</span>
  }
  if (r.excluidoAcreditamiento) {
    return <span className="pill-motivo">excluido por el contador</span>
  }
  if (r.sinComplementoPago) {
    return <span className="pill-motivo" title="PPD sin complemento de pago en el periodo — su IVA se reconoce cuando llegue el REP">sin complemento</span>
  }
  if (r.pagoParcial) {
    return <span className="pill-motivo aviso" title="PPD con pago parcial: sólo se acredita el IVA del monto pagado">parcial</span>
  }
  if (r.sinPagoConciliado) {
    return <span className="pill-motivo aviso" title="PUE sin pago conciliado en banco — el IVA sólo es acreditable si se pagó (Art. 5-I LIVA)">sin pago en banco</span>
  }
  if (r.pagadaConciliada) {
    return <span className="pill-motivo ok" title="PUE con pago conciliado en banco">pagada</span>
  }
  return null
}

function TablaPapel({ titulo, glosa, filas, total, totalLabel, onVer }) {
  const movil = useEsMovil()
  const fuera = (r) => r.excluidoAcreditamiento || r.sinComplementoPago || r.emisorEnLista69B
  const excluidos = filas.filter(fuera).length
  return (
    <section className="card">
      <div className="card-head" style={{ gap: 10 }}>
        <span>{titulo}</span>
        <span className="muted" style={{ fontWeight: 400 }}>{glosa}</span>
      </div>
      {filas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin comprobantes en el periodo.</p>
      ) : movil ? (
        /* Siete columnas por CFDI no caben en 390 px: rodando en horizontal se
           pierde la contraparte, que es lo que identifica el renglón, y queda
           una lista de importes sin dueño. En el teléfono cada comprobante es
           una tarjeta — quien defiende la cifra ante el SAT lo hace sentado,
           pero consultarla de pie tiene que poder hacerse. */
        <div className="lista-tarjetas">
          {filas.map((r) => (
            <div
              key={r.id + (r.esComplemento ? '-rep' : '')}
              className={`tarjeta-fila clicable${fuera(r) ? ' fuera' : ''}`}
              tabIndex={0}
              role="link"
              onClick={() => onVer(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVer(r.id) } }}
            >
              <div className="tf-alto">
                <span className="tf-titulo">{r.contraparte ?? '—'}</span>
                <span
                  className="tf-cifra"
                  style={fuera(r) ? { textDecoration: 'line-through', color: 'var(--ink3)' } : undefined}
                >
                  {mxn(r.importe)}
                </span>
              </div>
              <div className="tf-bajo">
                <span className="tf-sub">
                  {[r.serie, r.folio].filter(Boolean).join('-') || (r.uuid ?? '').slice(0, 8)}
                  {' · '}{r.fecha}{' · '}{mxn(r.subtotal)}
                </span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>{r.metodoPago}</span>
                  <MotivoIva r={r} />
                </span>
              </div>
            </div>
          ))}
          <div className="tarjetas-pie">
            {filas.length} CFDI{excluidos > 0 && ` · ${excluidos} fuera del cálculo`}
            {' · '}<b>{totalLabel} {mxn(total)}</b>
          </div>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th><th>Folio</th><th>Contraparte</th><th>Pago</th>
              <th className="num">Subtotal</th><th className="num">Tasa</th><th className="num">IVA</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr
                key={r.id + (r.esComplemento ? '-rep' : '')}
                className={`fila-liga${fuera(r) ? ' fuera' : ''}`}
                tabIndex={0}
                role="link"
                title="Ver este CFDI"
                onClick={() => onVer(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVer(r.id) } }}
              >
                <td style={{ color: 'var(--ink-3)' }}>{r.fecha}</td>
                <td className="mono">{[r.serie, r.folio].filter(Boolean).join('-') || (r.uuid ?? '').slice(0, 8)}</td>
                <td className="celda2">
                  <b>{r.contraparte ?? '—'}</b>
                  <span className="mono">{r.rfc ?? ''}</span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11 }}>{r.metodoPago}</span>{' '}
                  <MotivoIva r={r} />
                </td>
                <td className="num">{mxn(r.subtotal)}</td>
                <td className="num" style={{ color: 'var(--ink-3)' }}>
                  {r.tasa != null ? `${(r.tasa * 100).toFixed(0)}%` : '—'}
                </td>
                {/* Tachado cuando no entra al total: el importe sigue a la
                    vista porque es lo que se está dejando de acreditar. */}
                <td className="num" style={fuera(r) ? { textDecoration: 'line-through', color: 'var(--ink3)' } : undefined}>
                  {mxn(r.importe)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="alcance" colSpan={5}>
                {filas.length} CFDI
                {excluidos > 0 && ` · ${excluidos} fuera del cálculo`}
              </td>
              <td className="num">{totalLabel}</td>
              <td className="num" style={{ fontWeight: 700 }}>{mxn(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

// ── Papel de trabajo del ISAN ───────────────────────────────────────────────
// El impuesto propio de una distribuidora: lo causa al enajenar automóviles
// NUEVOS (Art. 1 LFISAN) y lo entera el día 17, igual que el IVA y el ISR.
//
// La pregunta que contesta la tabla no es «cuánto sale» —eso ya está en el
// resumen— sino CUÁL unidad lo causa y por qué. El Art. 8-II exenta por
// completo debajo de un umbral y a la mitad entre umbrales, así que en una
// misma lista conviven unidades que pagan todo, la mitad y nada. Sin la
// columna de tratamiento, los ceros se leen como un error de captura.
function PapelIsan({ isan }) {
  if (!isan) {
    return <p className="muted">El periodo no trae cálculo de ISAN.</p>
  }
  const { unidades = [] } = isan
  const trato = (u) =>
    u.exencion === 'TOTAL' ? 'Exenta' : u.exencion === 'PARCIAL' ? 'Exenta al 50%' : 'Grava completo'

  return (
    <>
      <div className="kpi-strip densa kpi-4" style={{ marginBottom: 16 }}>
        <div className="kpi-item">
          <span className="kpi-label">ISAN del mes</span>
          <span className="kpi">{mxn(isan.total)}</span>
          <span className="kpi-sub">sobre {mxn(isan.baseTotal)} de base gravable</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Unidades nuevas vendidas</span>
          <span className="kpi">{unidades.length.toLocaleString('es-MX')}</span>
          <span className="kpi-sub">
            {isan.seminuevosVendidos > 0
              ? `${isan.seminuevosVendidos.toLocaleString('es-MX')} seminuevo(s) aparte: no causan ISAN`
              : 'los seminuevos no causan ISAN (Art. 1)'}
          </span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Exentas</span>
          <span className="kpi">{(isan.exentasTotal + isan.exentasParcial).toLocaleString('es-MX')}</span>
          <span className="kpi-sub">
            {isan.exentasTotal.toLocaleString('es-MX')} totales y {isan.exentasParcial.toLocaleString('es-MX')} al 50% (Art. 8-II)
          </span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Registrado en las unidades</span>
          <span className="kpi" style={isan.total - isan.totalRegistrado > 0.5 ? { color: 'var(--neg)' } : undefined}>
            {mxn(isan.totalRegistrado)}
          </span>
          <span className="kpi-sub">
            {isan.total - isan.totalRegistrado > 0.5
              ? `faltan ${mxn(isan.total - isan.totalRegistrado)} por registrar`
              : 'coincide con lo calculado'}
          </span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <span>Unidades nuevas enajenadas</span>
          <span className="muted" style={{ fontWeight: 400 }}>base Art. 2 · tarifa Art. 3-I · exenciones Art. 8-II</span>
        </div>
        {unidades.length === 0 ? (
          <p className="muted">No se vendieron unidades nuevas en el periodo.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th><th>Unidad</th><th>VIN</th><th>Tratamiento</th>
                <th className="num">Base</th><th className="num">Tarifa</th><th className="num">ISAN</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.vehiculoId}>
                  <td style={{ color: 'var(--ink-3)' }}>{u.fechaVenta}</td>
                  <td style={{ fontSize: 13 }}>
                    <Link to={`/vehiculos/${u.vehiculoId}`}>{u.descripcion}</Link>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--ink3)' }}>{(u.vin ?? '').slice(0, -6)}</span>
                    <b>{(u.vin ?? '').slice(-6)}</b>
                  </td>
                  {/* El tratamiento explica el cero. Sin él, una exenta y una
                      unidad sin precio capturado se ven idénticas. */}
                  <td style={{ fontSize: 11.5, color: u.exencion ? 'var(--ink-3)' : 'var(--ink)' }}>
                    {trato(u)}
                    {u.reduccionLujo > 0 && (
                      <span className="muted" style={{ display: 'block', fontSize: 10.5 }}>
                        menos {mxn(u.reduccionLujo)} de reducción
                      </span>
                    )}
                  </td>
                  <td className="num">{mxn(u.base)}</td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{mxn(u.impuestoTarifa)}</td>
                  <td className="num" style={u.isan === 0 ? { color: 'var(--ink3)' } : undefined}>{mxn(u.isan)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="alcance">{unidades.length} unidad(es)</td>
                <td /><td /><td />
                <td className="num">{mxn(isan.baseTotal)}</td>
                <td />
                <td className="num" style={{ fontWeight: 700 }}>{mxn(isan.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <div className="card-note">
          La base es el precio de enajenación sin IVA y <b>sin disminuir descuentos, rebajas ni
          bonificaciones</b> (Art. 2). Si el precio de venta capturado ya viene neto de descuento, la
          base queda por debajo de la legal y el impuesto sale corto.
        </div>
      </section>
    </>
  )
}

// Los meses que se pueden declarar: del mes pasado hacia atrás. El mes EN
// CURSO no aparece porque no se declara hasta que cierra — ofrecerlo invita a
// presentar un periodo incompleto.
const MESES_ELEGIBLES = (() => {
  const hoy = new Date()
  const salida = []
  for (let i = 1; i <= 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const anio = d.getFullYear()
    const mes = d.getMonth() + 1
    salida.push({
      clave: `${anio}-${String(mes).padStart(2, '0')}`,
      etiqueta: `${MESES[mes - 1]} ${anio}`,
    })
  }
  return salida
})()

// Periodo por defecto: el MES ANTERIOR — el que está por declararse.
function periodoDefault() {
  const hoy = new Date()
  const p = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}

// Impuestos del mes (IA §4.5 Finanzas): la posición fiscal que calcula el hub
// (IVA en flujo, ISR provisional por régimen) + el checklist para declarar.
export default function Fiscal() {
  const { activeCompany } = useAuth()
  const [periodo, setPeriodo] = useState(periodoDefault())
  // El handoff parte la pantalla en tres trabajos distintos: leer la cifra
  // (Resumen), defenderla (Papeles) y saber si se puede presentar (Revisión).
  const [vista, setVista] = useState('resumen')
  const [papel, setPapel] = useState('iva')
  // El detalle por CFDI vive en el hub (/api/papeles/iva) y se pide APARTE del
  // resumen: es más pesado, y si falla se enseña la cifra del mes igual. La
  // cifra sin comprobantes es pobre; ninguna cifra es peor.
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [verCfdi, setVerCfdi] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    const [y, m] = periodo.split('-').map(Number)
    setLoading(true); setError(null)
    try {
      setData(await apiFetch(`/api/automotriz/fiscal?companyId=${activeCompany.id}&year=${y}&month=${m}`))
    } catch (err) { setError(err.message); setData(null) } finally { setLoading(false) }
  }, [activeCompany?.id, periodo])

  useEffect(() => { cargar() }, [cargar])

  // El papel se pide sólo cuando la pestaña está abierta: 400 renglones de
  // CFDI no se traen para enseñar un resumen.
  useEffect(() => {
    if (!activeCompany?.id || vista !== 'papeles' || papel !== 'iva') return
    const [y, m] = periodo.split('-').map(Number)
    let vivo = true
    setCargandoDetalle(true)
    apiFetch(`/api/papeles/iva?companyId=${activeCompany.id}&year=${y}&month=${m}`)
      .then((d) => { if (vivo) setDetalle(d) })
      .catch(() => { if (vivo) setDetalle(null) })
      .finally(() => { if (vivo) setCargandoDetalle(false) })
    return () => { vivo = false }
  }, [activeCompany?.id, periodo, vista, papel])

  const ivaCargo = data ? data.iva.pagar > 0 : false
  const atencionN = data?.checklist?.resumen?.atencion ?? 0
  const isrPagar = data?.isr?.isrPagar

  return (
    <div>
      <header className="page-head">
        <h1>Impuestos</h1>
        {data && (
          <span className="glosa">
            Declaración de {MESES[data.month - 1]} {data.year} — vence el{' '}
            {new Date(data.fechaLimite).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
            {data.vencida
              ? <span className="neg"> · vencida hace {-data.diasRestantes} día(s)</span>
              : ` · en ${data.diasRestantes} día(s)`}
          </span>
        )}
        <div className="head-actions">
          {/* `<input type="month">` lo pinta el navegador con SU idioma —salía
              «July 2026» en una aplicación en español— y no deja elegir qué
              meses ofrecer. El selector propio dice los meses en español y sólo
              lista los declarables: del arranque de la CE al mes pasado, que es
              el último que se puede declarar. Igual que en ContabilidadOS. */}
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            style={{ width: 'auto' }}
            aria-label="Periodo"
          >
            {MESES_ELEGIBLES.map((p) => (
              <option key={p.clave} value={p.clave}>{p.etiqueta}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="tabs" role="tablist" style={{ marginBottom: 18 }}>
        {VISTAS.map(([k, etiqueta]) => (
          <button type="button" key={k} role="tab" aria-selected={vista === k}
            className={vista === k ? 'activo' : ''} onClick={() => setVista(k)}>
            {etiqueta}
            {k === 'revision' && atencionN > 0 && (
              <span className="badge" style={{ marginLeft: 6, background: 'var(--negBg)', color: 'var(--neg)' }}>
                {atencionN}
              </span>
            )}
          </button>
        ))}
      </div>

      {verCfdi && <CfdiVista invoiceId={verCfdi} onCerrar={() => setVerCfdi(null)} />}
      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}
      {loading && <p className="muted">Calculando la posición fiscal…</p>}

      {data && !loading && (
        <>
          {data.advertencias.length > 0 && (
            <div className="warn">
              {data.advertencias.map((a, i) => <p key={i} style={{ margin: '2px 0' }}>{a}</p>)}
            </div>
          )}

          {vista === 'resumen' && (<>
          <div className="kpi-strip densa kpi-6">
            <div className="kpi-item">
              <span className="kpi-label">IVA del periodo</span>
              <span className="kpi" style={{ color: ivaCargo ? 'var(--danger)' : 'var(--ok)' }}>
                {ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}
              </span>
              <span className="kpi-sub">{ivaCargo ? 'a pagar · en flujo de efectivo' : 'saldo a favor (se arrastra)'}</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">ISR provisional</span>
              <span className="kpi">{isrPagar == null ? '—' : mxn(isrPagar)}</span>
              <span className="kpi-sub">
                {data.isr.coeficiente != null
                  ? `coeficiente ${data.isr.coeficiente} (${data.isr.coeficienteFuente.replaceAll('_', ' ')})`
                  : data.isr.tasa != null ? `tasa ${pct(data.isr.tasa)}` : 'sin coeficiente disponible'}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Retenciones a enterar</span>
              <span className="kpi">{mxn(data.retenciones?.aEnterar ?? 0)}</span>
              <span className="kpi-sub">
                dinero de terceros ya descontado
                {data.retenciones?.recibosNomina > 0 ? ` · ${data.retenciones.recibosNomina.toLocaleString('es-MX')} recibos de nómina` : ''}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">ISAN</span>
              <span className="kpi">{mxn(data.isan?.total ?? 0)}</span>
              <span className="kpi-sub">
                {(data.isan?.unidades?.length ?? 0) === 0
                  ? 'sin unidades nuevas vendidas'
                  : `${data.isan.gravadasCompleto + data.isan.exentasParcial} de ${data.isan.unidades.length} unidades nuevas lo causan`}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Total al SAT</span>
              <span className="kpi">{mxn(data.totalSat)}</span>
              <span className="kpi-sub">IVA + ISR provisional + ISAN + retenciones</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Revisión</span>
              <span className="kpi">
                {data.checklist.resumen.listos}/{data.checklist.resumen.listos + data.checklist.resumen.pendientes + data.checklist.resumen.atencion}
              </span>
              <span className="kpi-sub">
                puntos listos
                {data.checklist.resumen.atencion > 0 && (
                  <span style={{ color: 'var(--danger)' }}> · {data.checklist.resumen.atencion} requieren atención</span>
                )}
              </span>
            </div>
          </div>

          {data.efos && (
            <div className="warn">
              <strong>Proveedores 69-B (EFOS):</strong> se excluyeron {data.efos.cfdisExcluidos} CFDI(s) de{' '}
              {data.efos.rfcsBloqueados.map((rfc, i) => (
                <span key={rfc}>{i > 0 ? ', ' : ''}<span className="mono">{rfc}</span></span>
              ))} — {mxn(data.efos.ivaAcreditableExcluido)} de IVA no acreditable.
            </div>
          )}

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">Lo que sale del banco</div>
            <Fila label="IVA a pagar" valor={mxn(Math.max(data.iva.pagar, 0))} />
            <Fila label="ISR provisional" valor={mxn(Math.max(isrPagar ?? 0, 0))} />
            <Fila label="ISAN" valor={mxn(Math.max(data.isan?.total ?? 0, 0))} />
            <Fila label="Retenciones enteradas" valor={mxn(data.retenciones?.aEnterar ?? 0)} />
            <Fila fuerte label="Total al SAT" valor={mxn(data.totalSat)} />
            <div className="card-note">
              El ISAN entra aquí porque se entera el mismo día 17 que el IVA y el ISR (Art. 4 LFISAN).
              Un saldo a favor de IVA no se resta: se arrastra al mes siguiente, no reduce el ISR ni las
              retenciones. IMSS, INFONAVIT e ISN se pagan por separado y no entran en esta suma.
            </div>
          </section>
          </>)}

          {vista === 'papeles' && (<>
          <div className="facetas" style={{ marginBottom: 16 }}>
            {PAPELES.map(([k, etiqueta]) => (
              <button type="button" key={k}
                className={`faceta${papel === k ? ' activa' : ''}`}
                onClick={() => setPapel(k)}>
                {etiqueta}
              </button>
            ))}
          </div>

          {papel === 'iva' && (
          <>
          {cargandoDetalle && <p className="muted">Buscando los comprobantes del mes…</p>}

          {detalle && (
            <>
              <TablaPapel
                titulo="IVA trasladado (cobrado)"
                glosa="el que les cobraste a tus clientes en el periodo"
                filas={detalle.trasladado ?? []}
                total={detalle.totales?.trasladado ?? 0}
                totalLabel="Total trasladado"
                onVer={setVerCfdi}
              />
              <TablaPapel
                titulo="IVA acreditable (pagado)"
                glosa="el que les pagaste a tus proveedores"
                filas={detalle.acreditable ?? []}
                total={detalle.totales?.acreditable ?? 0}
                totalLabel="Total acreditable"
                onVer={setVerCfdi}
              />

              {/* El 69-B se explica aparte porque no se destraba solo: el
                  efecto es retroactivo a todo lo comprado a ese proveedor. */}
              {detalle.totales?.excluido69B?.count > 0 && (
                <div className="warn" style={{ borderColor: 'var(--neg)', color: 'var(--ink)' }}>
                  <b style={{ color: 'var(--neg)' }}>Lista 69-B.</b>{' '}
                  {detalle.totales.excluido69B.count} CFDI de{' '}
                  {(detalle.totales.excluido69B.rfcs ?? []).join(', ')} quedan fuera del
                  acreditamiento: son {mxn(detalle.totales.excluido69B.iva)} de IVA no acreditable,
                  y el efecto es retroactivo a todo lo que le compraste.
                </div>
              )}

              {detalle.totales?.proporcionAcreditamiento < 1 && (
                <div className="warn">
                  <b>Proporción de acreditamiento (Art. 5-V LIVA).</b> Con actos exentos en el mes,
                  el IVA sólo procede en {pct(detalle.totales.proporcionAcreditamiento)} —{' '}
                  {mxn(detalle.totales.actosGravados)} gravados contra{' '}
                  {mxn(detalle.totales.actosExentos)} exentos. Acreditable procedente:{' '}
                  {mxn(detalle.totales.acreditableProcedente)}.
                </div>
              )}
            </>
          )}

          {!cargandoDetalle && !detalle && (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                No se pudo traer el detalle por CFDI de este mes. El desglose de abajo sigue siendo
                el del cálculo; lo que falta son los comprobantes que lo sostienen.
              </p>
            </div>
          )}

          <div className="cards">
            <section className="card">
              <div className="card-head">Desglose de IVA (flujo de efectivo)</div>
              <Fila label="IVA cobrado (trasladado)" valor={mxn(data.iva.trasladado)} />
              <Fila
                label={`IVA acreditable${data.iva.proporcionAcreditamiento < 1 ? ` (proporción ${pct(data.iva.proporcionAcreditamiento)})` : ''}`}
                valor={`−${mxn(data.iva.acreditable)}`}
              />
              {data.iva.saldoFavorAnterior > 0 && (
                <Fila label="Saldo a favor del mes anterior" valor={`−${mxn(data.iva.saldoFavorAnterior)}`} />
              )}
              <Fila
                fuerte
                label={ivaCargo ? 'IVA a pagar' : 'Saldo a favor'}
                valor={ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}
              />
              {data.iva.retenidoAProveedores > 0 && (
                <Fila tenue label="IVA retenido a proveedores (se entera aparte)" valor={mxn(data.iva.retenidoAProveedores)} />
              )}
            </section>
          </div>
          </>
          )}

          {papel === 'isr' && (
          <div className="cards">
            <section className="card">
              <div className="card-head">Desglose de ISR provisional</div>
              <Fila label="Ingresos del mes" valor={mxn(data.isr.ingresosDelMes)} />
              <Fila label="Ingresos acumulados del ejercicio" valor={mxn(data.isr.ingresosAcumulados)} />
              {data.isr.baseGravable != null && <Fila label="Base gravable" valor={mxn(data.isr.baseGravable)} />}
              {data.isr.isrDelEjercicio != null && <Fila label="ISR del ejercicio (acumulado)" valor={mxn(data.isr.isrDelEjercicio)} />}
              {data.isr.isrPagadoAnterior > 0 && <Fila label="Pagos provisionales anteriores" valor={`−${mxn(data.isr.isrPagadoAnterior)}`} />}
              {data.isr.retencionesAcreditadas > 0 && <Fila label="Retenciones acreditadas" valor={`−${mxn(data.isr.retencionesAcreditadas)}`} />}
              <Fila fuerte label="ISR a pagar" valor={isrPagar == null ? '—' : mxn(isrPagar)} />
              {!data.isr.tarifaVerificada && (
                <div className="card-note">Tarifa del ejercicio aún no verificada contra el DOF.</div>
              )}
            </section>
          </div>
          )}

          {papel === 'isan' && <PapelIsan isan={data.isan} />}

          {papel === 'retenciones' && data.retenciones && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">Retenciones del periodo</div>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Lo que la empresa retuvo a terceros y sólo custodia hasta el día 17. No es impuesto propio:
                no sale del cálculo de utilidad, sale de lo que ya se descontó.
              </p>
              <table>
                <thead><tr><th>Concepto</th><th>Clave SAT</th><th>Fundamento</th><th className="num">CFDIs</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {data.retenciones.conceptos.length === 0 && (
                    <tr><td colSpan={5} className="muted">Sin retenciones en el periodo.</td></tr>
                  )}
                  {data.retenciones.conceptos.map((c) => (
                    <tr key={c.clave}>
                      <td style={{ fontSize: 13 }}>{c.nombre}</td>
                      <td className="mono">{c.clave}</td>
                      <td style={{ color: 'var(--ink-3)' }}>{c.fundamento}</td>
                      <td className="num">{c.comprobantes.toLocaleString('es-MX')}</td>
                      <td className="num">{mxn(c.monto)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600 }}>Total a enterar</td>
                    <td className="num" style={{ fontWeight: 600 }}>{mxn(data.retenciones.aEnterar)}</td>
                  </tr>
                </tbody>
              </table>
              {(data.retenciones.aFavor.iva > 0 || data.retenciones.aFavor.isr > 0) && (
                <div className="card-note">
                  Aparte, los clientes le retuvieron {mxn(data.retenciones.aFavor.iva)} de IVA y{' '}
                  {mxn(data.retenciones.aFavor.isr)} de ISR. Eso NO se entera: es un anticipo, y ya viene
                  acreditado en el IVA y el ISR de arriba.
                </div>
              )}
            </section>
          )}

          </>)}

          {vista === 'revision' && (
          <div className="urgent-list">
            <div className="urgent-head">¿Qué falta para declarar?</div>
            {data.checklist.items.map((it) => (
              <div key={it.clave} className="urgent-row" style={{ cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="urgent-title">{it.titulo}</div>
                  <div className="kpi-sub" style={{ marginTop: 2 }}>{it.detalle}</div>
                </div>
                <span className={`badge ${BADGE[it.estado] ?? ''}`}>{ETIQUETA[it.estado] ?? it.estado}</span>
              </div>
            ))}
          </div>
          )}
        </>
      )}
    </div>
  )
}

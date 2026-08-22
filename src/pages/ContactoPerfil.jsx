import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../config/api'
import CfdiAcciones from '../components/CfdiAcciones'
import CfdiVista from '../components/CfdiVista'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const NOTA = { marginTop: 12, fontSize: 12, lineHeight: 1.5 }
// Folio impreso del CFDI: dato duro, siempre en mono.
const folio = (f) => [f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8) || '—'

const iniciales = (nombre) =>
  (nombre ?? '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'

// Etiquetas DERIVADAS de los datos. El handoff las usa para describir la
// relación de un vistazo («Cliente desde 2019 · Recompra · 3 unidades»), y
// aquí sólo se dice lo que los datos sostienen — ninguna se inventa.
function etiquetasDe(perfil, lado) {
  const t = []
  const rfc = perfil.contacto.rfc ?? ''
  if (rfc.length === 13) t.push('Persona física')
  else if (rfc.length === 12) t.push('Persona moral')

  const fechas = (perfil.facturas ?? []).map((f) => f.fecha).filter(Boolean).sort()
  if (fechas.length) t.push(`${lado === 'CLIENTE' ? 'Cliente' : 'Proveedor'} desde ${new Date(fechas[0]).getFullYear()}`)

  const nUnidades = (perfil.unidades ?? []).length
  if (nUnidades > 0) t.push(`${nUnidades} unidad${nUnidades === 1 ? '' : 'es'}`)
  if (lado === 'CLIENTE' && nUnidades > 1) t.push('Recompra')

  const nServicio = perfil.servicio?.ordenes ?? 0
  if (nServicio > 0) t.push(`${nServicio} orden${nServicio === 1 ? '' : 'es'} de servicio`)

  if (perfil.resumen?.repPendienteFacturas > 0) {
    t.push(lado === 'CLIENTE' ? 'REP por emitir' : 'REP por recibir')
  }
  return t
}

// Antigüedad del saldo. Es el mismo patrón de tramos del inventario: la
// pregunta no es cuánto deben, es desde cuándo.
const TRAMOS_SALDO = [
  { etiqueta: 'Por vencer', color: 'var(--posFill)', min: -Infinity, max: 0 },
  { etiqueta: '1–30 días', color: 'var(--accFill)', min: 1, max: 30 },
  { etiqueta: '31–60 días', color: 'var(--warnFill)', min: 31, max: 60 },
  { etiqueta: 'Más de 60', color: 'var(--negFill)', min: 61, max: Infinity },
]
// Los chips nunca van en mayúsculas forzadas: EN_TRANSITO → «En transito».
const etiqueta = (e) => {
  const s = e.replaceAll('_', ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Perfil 360° del contacto: pestaña "Como cliente" (lo que le facturamos,
// cobros y REPs que NOSOTROS debemos emitir) y "Como proveedor" (lo que nos
// facturó, pagos y REPs que ÉL nos debe — riesgo de deducción).
// Estado de cuenta documental del cliente: cargos (facturas), abonos (NC,
// REPs con su FechaPago legal, PUE liquidadas en emisión, cobros conciliados)
// y saldo corrido — imprimible para mandárselo al cliente.
function EstadoDeCuenta({ clienteId }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setError(null)
      try {
        const r = await apiFetch(`/api/automotriz/clientes/${clienteId}/estado-cuenta?year=${year}`)
        if (vivo) setData(r)
      } catch (err) { if (vivo) setError(err.message) }
    })()
    return () => { vivo = false }
  }, [clienteId, year])

  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)
  const TIPO = {
    FACTURA: ['Factura', 'badge-info'],
    NOTA_CREDITO: ['Nota de crédito', 'badge-danger'],
    PAGO_REP: ['Pago (REP)', 'badge-neutral'],
    PAGO_PUE: ['Pago (PUE)', 'badge-neutral'],
    COBRO_BANCO: ['Cobro (banco)', 'badge-ok'],
  }

  return (
    <section>
      <div className="card-head" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Estado de cuenta</h2>
        <div className="head-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }} className="no-print">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="ghost no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!data ? <p className="muted">Armando el estado de cuenta…</p> : (
        <>
          <table>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Referencia</th><th className="num">Cargo</th><th className="num">Abono</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              <tr>
                <td colSpan={5} className="muted">Saldo anterior al {data.year}</td>
                <td className="num">{mxn(data.saldoAnterior)}</td>
              </tr>
              {data.movimientos.map((m, i) => (
                <tr key={i}>
                  <td>{fecha(m.fecha)}</td>
                  <td><span className={`badge ${TIPO[m.tipo]?.[1] ?? ''}`}>{TIPO[m.tipo]?.[0] ?? m.tipo}</span></td>
                  <td className="mono">{m.referencia ?? '—'}</td>
                  <td className="num">{m.cargo > 0 ? mxn(m.cargo) : '—'}</td>
                  <td className="num">{m.abono > 0 ? mxn(m.abono) : '—'}</td>
                  <td className={'num'}>{mxn(m.saldo)}</td>
                </tr>
              ))}
              {data.movimientos.length === 0 && <tr><td colSpan={6} className="muted">Sin movimientos en {data.year}.</td></tr>}
            </tbody>
          </table>
          <p className="faint" style={NOTA}>
            {data.resumen.movimientos} movimientos · cargos {mxn(data.resumen.cargos)} · abonos {mxn(data.resumen.abonos)} ·{' '}
            saldo final <b className={data.resumen.saldoFinal > 0.01 ? 'neg' : ''}>{mxn(data.resumen.saldoFinal)}</b>.
            Documental: facturas y NC del CFDI, pagos por REP (con su fecha legal), PUE liquidadas en su emisión y cobros conciliados en banco.
          </p>
        </>
      )}
    </section>
  )
}

// Pestañas del expediente. `contar` alimenta el badge para saber de un vistazo
// dónde hay algo; null = sin contador (el estado de cuenta se arma aparte).
const SECCIONES = [
  { clave: 'unidades', titulo: 'Unidades', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.unidades.length },
  { clave: 'taller', titulo: 'Taller', lados: ['CLIENTE'], contar: (p) => p.servicio?.ordenes ?? 0 },
  { clave: 'refacciones', titulo: 'Refacciones', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.refacciones?.partes ?? 0 },
  { clave: 'cobranza', titulo: 'Por cobrar', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.facturas.filter((f) => f.saldo > 1).length },
  { clave: 'facturas', titulo: 'Facturas', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.facturas.length },
  { clave: 'estado', titulo: 'Estado de cuenta', lados: ['CLIENTE'], contar: () => null },
  // Relación: RPC e historial de contacto. Dibujadas, sin cablear —el modelo
  // llega en la pasada de CRM—. Se dejan a la vista para que la arquitectura
  // del expediente se lea completa y se vea qué falta.
  { clave: 'relacion', titulo: 'Relación', lados: ['CLIENTE'], contar: () => null },
]

export default function ContactoPerfil() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const [lado, setLado] = useState(sp.get('lado') === 'PROVEEDOR' ? 'PROVEEDOR' : 'CLIENTE')
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState(null)

  const [portalMsg, setPortalMsg] = useState(null)
  const [seccion, setSeccion] = useState('unidades')
  const [cfdiVista, setCfdiVista] = useState(null)
  const crearPortal = async () => {
    const email = window.prompt('Correo del cliente para su portal:', perfil?.contacto?.email ?? '')
    if (!email) return
    const password = window.prompt('Contraseña inicial (mínimo 8 caracteres):')
    if (!password) return
    setPortalMsg(null); setError(null)
    try {
      const r = await apiFetch('/api/automotriz/portal-accounts', {
        method: 'POST',
        body: { customerId: id, email, password },
      })
      setPortalMsg(`Acceso al portal listo para ${r.email} — compárteles la liga ${window.location.origin}/portal`)
    } catch (err) { setError(err.message) }
  }

  const cargar = useCallback(async () => {
    setError(null); setPerfil(null)
    const ruta = lado === 'CLIENTE' ? 'clientes' : 'proveedores'
    try {
      setPerfil(await apiFetch(`/api/automotriz/${ruta}/${id}/perfil`))
    } catch (err) { setError(err.message) }
  }, [id, lado])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
        <Link to={lado === 'PROVEEDOR' ? '/proveedores' : '/clientes'}>← {lado === 'PROVEEDOR' ? 'Proveedores' : 'Clientes'}</Link>
      </p>
      {error && <div className="error">{error}</div>}
      {perfil && (
        <>
          <header className="page-head" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
              <span className="avatar" style={{ width: 52, height: 52, fontSize: 18, borderRadius: 14, flexShrink: 0 }}>
                {iniciales(perfil.contacto.razonSocial)}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{perfil.contacto.razonSocial}</h1>
                <span className="glosa" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                  <span className="mono">{perfil.contacto.rfc}</span>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 10.5, padding: '1px 6px' }}
                    onClick={() => navigator.clipboard?.writeText(perfil.contacto.rfc ?? '')}
                  >
                    Copiar RFC
                  </button>
                  {perfil.contacto.phone && (
                    <>
                      <span className="mono">{perfil.contacto.phone}</span>
                      <a
                        href={`https://wa.me/${String(perfil.contacto.phone).replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11.5 }}
                      >
                        WhatsApp →
                      </a>
                    </>
                  )}
                  {perfil.contacto.email && <span style={{ color: 'var(--ink3)' }}>{perfil.contacto.email}</span>}
                </span>
                {/* Etiquetas: lo que describe la relación, derivado de los
                    datos — nunca inventado. */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                  {etiquetasDe(perfil, lado).map((t) => (
                    <span key={t} className="badge">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="head-actions">
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={lado === 'CLIENTE'} className={lado === 'CLIENTE' ? 'activo' : ''} onClick={() => setLado('CLIENTE')}>Como cliente</button>
                <button type="button" role="tab" aria-selected={lado === 'PROVEEDOR'} className={lado === 'PROVEEDOR' ? 'activo' : ''} onClick={() => setLado('PROVEEDOR')}>Como proveedor</button>
              </div>
              {lado === 'CLIENTE' && <button onClick={crearPortal}>Crear acceso al portal</button>}
            </div>
          </header>
          {portalMsg && <div className="warn">✓ {portalMsg}</div>}

          {/* ── Pendiente ahora ─────────────────────────────────────────────
              El handoff abre los dos expedientes con lo ACCIONABLE, antes que
              con los totales: un saldo abierto o un REP que falta es lo que
              hace que alguien entre a esta pantalla. */}
          {(() => {
            const saldo = perfil.resumen?.saldo ?? 0
            const rep = perfil.resumen?.repPendienteFacturas ?? 0
            if (saldo <= 0.01 && rep === 0) return null
            const esRiesgo = lado === 'PROVEEDOR' && rep > 0
            return (
              <div
                className="card"
                style={{
                  marginBottom: 14,
                  background: esRiesgo ? 'var(--negBg)' : 'var(--warnBg)',
                  borderColor: esRiesgo ? 'var(--neg)' : 'var(--warn)',
                }}
              >
                <strong style={{ color: esRiesgo ? 'var(--neg)' : 'var(--warn)' }}>Pendiente ahora</strong>{' '}
                <span style={{ fontSize: 12.5 }}>
                  {saldo > 0.01 && (
                    <>Saldo abierto de <b>{mxn(saldo)}</b>{rep > 0 ? '. ' : '.'}</>
                  )}
                  {rep > 0 && (lado === 'CLIENTE'
                    ? <>Faltan <b>{rep}</b> complemento(s) de pago por emitir, por {mxn(perfil.resumen.repPendienteMonto)} — vencen el día 5 del mes siguiente al cobro.</>
                    : <>El proveedor no ha emitido <b>{rep}</b> complemento(s) por {mxn(perfil.resumen.repPendienteMonto)}: ese IVA no es acreditable hasta que llegue.</>)}
                </span>
              </div>
            )
          })()}

          {/* ── Antigüedad del saldo ────────────────────────────────────────
              Cuánto deben importa menos que desde cuándo. Mismo patrón de
              tramos que el inventario, aplicado al otro lado del libro. */}
          {(() => {
            const abiertas = (perfil.facturas ?? []).filter((f) => (f.saldo ?? 0) > 0.01)
            if (abiertas.length === 0) return null
            const hoy = Date.now()
            const tramos = TRAMOS_SALDO.map((r) => {
              const dentro = abiertas.filter((f) => {
                const dias = Math.floor((hoy - new Date(f.fecha).getTime()) / 86400000)
                return dias >= r.min && dias <= r.max
              })
              return {
                ...r,
                facturas: dentro.length,
                importe: dentro.reduce((a, f) => a + (f.saldo ?? 0), 0),
              }
            }).filter((t) => t.facturas > 0)
            const total = tramos.reduce((a, t) => a + t.importe, 0) || 1
            return (
              <section className="card" style={{ marginBottom: 14 }}>
                <div className="card-head" style={{ marginBottom: 12 }}>
                  <span>{lado === 'CLIENTE' ? 'Cartera del cliente' : 'Cuentas por pagar'}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>desde cuándo está abierto el saldo</span>
                </div>
                <div className="tramos">
                  {tramos.map((t) => (
                    <span key={t.etiqueta} title={`${t.etiqueta}: ${mxn(t.importe)}`}
                      style={{ background: t.color, width: `${(t.importe / total) * 100}%` }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                  {tramos.map((t) => (
                    <div key={t.etiqueta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
                        <span className="tramos-punto" style={{ background: t.color }} />
                        {t.etiqueta}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, marginTop: 3,
                        color: t.etiqueta === 'Más de 60' ? 'var(--neg)' : 'var(--ink)' }}>
                        {mxn(t.importe)}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{t.facturas} factura(s)</div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}


          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="kpi-label">Facturado</span>
              <span className="kpi">{mxn(perfil.resumen.totalFacturado)}</span>
              <span className="kpi-sub">
                {perfil.resumen.numFacturas} facturas
                {perfil.resumen.totalNotasCredito > 0
                  ? ` · ${mxn(perfil.resumen.totalNotasCredito)} en notas de crédito`
                  : ''}
                {perfil.resumen.totalAnticipos > 0
                  ? ` · ${mxn(perfil.resumen.totalAnticipos)} en anticipos`
                  : ''}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</span>
              <span className="kpi">{mxn(perfil.resumen.totalPagado)}</span>
              <span className="kpi-sub">Saldo: {mxn(perfil.resumen.saldo)}</span>
            </div>
            {lado === 'CLIENTE' && perfil.rentabilidad && (
              <div className="kpi-item">
                <span className="kpi-label">Utilidad generada</span>
                <span className={`kpi ${perfil.rentabilidad.utilidad >= 0 ? '' : 'neg'}`}>{mxn(perfil.rentabilidad.utilidad)}</span>
                <span className="kpi-sub">
                  {perfil.rentabilidad.unidades} unidad(es)
                  {perfil.rentabilidad.margen != null ? ` · margen ${perfil.rentabilidad.margen}%` : ''}
                  {perfil.rentabilidad.sinCosto > 0 ? ` · ${perfil.rentabilidad.sinCosto} sin costo conocido` : ''}
                </span>
              </div>
            )}
            <div className="kpi-item">
              <span className="kpi-label">Complementos</span>
              {perfil.resumen.repPendienteFacturas > 0 ? (
                <>
                  <span className="kpi neg">{mxn(perfil.resumen.repPendienteMonto)}</span>
                  <span className="kpi-sub">
                    {perfil.resumen.repPendienteFacturas} factura(s) — {lado === 'CLIENTE'
                      ? 'te falta emitir el REP (vence el día 5 del mes siguiente al cobro)'
                      : 'el proveedor no te ha emitido el REP: riesgo para tu deducción'}
                  </span>
                </>
              ) : (
                <>
                  <span className="kpi">Al día</span>
                  <span className="kpi-sub">sin REP pendiente</span>
                </>
              )}
            </div>
          </div>

          {/* Secciones en pestañas: el expediente de un cliente con años de
              operación no cabe en una sola vista de scroll. El contador de cada
              pestaña dice de una si hay algo que ver. */}
          <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 16px' }}>
            {SECCIONES.filter((s) => s.lados.includes(lado)).map((s) => {
              const n = s.contar(perfil)
              return (
                <button type="button" key={s.clave} role="tab" aria-selected={seccion === s.clave} className={`filtro ${seccion === s.clave ? 'activo' : ''}`} onClick={() => setSeccion(s.clave)}>
                  {s.titulo}{n != null ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>

          {seccion === 'cobranza' && (() => {
            const abiertas = perfil.facturas.filter((f) => f.saldo > 1)
            if (abiertas.length === 0) return <p className="muted">Sin saldo abierto — todo cobrado.</p>
            const total = abiertas.reduce((s, f) => s + f.saldo, 0)
            const dias = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)
            return (
              <section>
                <h2 style={{ marginBottom: 10 }}>Por cobrar — {abiertas.length} factura(s) · {mxn(total)}</h2>
                <table>
                  <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">Cobrado</th><th className="num">Saldo</th><th className="num">Días</th></tr></thead>
                  <tbody>
                    {abiertas.map((f) => (
                      <tr key={f.id}>
                        <td className="mono">{folio(f)}</td>
                        <td>{fecha(f.fecha)}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{f.metodoPago}</td>
                        <td className="num">{mxn(f.total)}</td>
                        <td className="num">{mxn(f.pagado)}</td>
                        <td className="num neg">{mxn(f.saldo)}</td>
                        <td className={`num ${dias(f.fecha) > 90 ? 'neg' : ''}`}>{dias(f.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="faint" style={NOTA}>
                  PUE se considera cobrada en su emisión; PPD por la mejor evidencia (REP o conciliación bancaria).
                </p>
                {perfil.resumen.totalAnticipos > 0 && (
                  <div className="warn" style={{ marginTop: 8 }}>
                    Este cliente tiene {mxn(perfil.resumen.totalAnticipos)} en <b>anticipos</b> facturados aparte
                    (clave <span className="mono">84111506</span>). Si la factura final se emitió por el total sin descontarlos, parte de este saldo
                    ya está cobrado y el ingreso está contado dos veces — revísalo con tu contador.
                  </div>
                )}
              </section>
            )
          })()}

          {seccion === 'facturas' && (
          <section>
            <h2 style={{ marginBottom: 10 }}>Facturas</h2>
            {perfil.facturas.length === 0 ? <p className="muted">Sin facturas de este lado.</p> : (
              <table>
                <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</th><th className="num">REP pendiente</th><th className="num">Saldo</th><th>CFDI</th></tr></thead>
                <tbody>
                  {perfil.facturas.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="mono">{folio(f)}</span>
                        {perfil.anticipos?.some((a) => a.id === f.id) && (
                          <span className="badge badge-warn" style={{ marginLeft: 6 }}>anticipo</span>
                        )}
                      </td>
                      <td>{fecha(f.fecha)}</td>
                      <td style={{ color: 'var(--ink-3)' }}>{f.metodoPago}</td>
                      <td className="num">{mxn(f.total)}</td>
                      <td className="num">{mxn(f.pagado)}</td>
                      <td className="num">{f.repPendiente > 1 ? <span className="neg">{mxn(f.repPendiente)}</span> : '—'}</td>
                      <td className="num">{mxn(f.saldo)}</td>
                      <td><CfdiAcciones invoice={f} onVer={setCfdiVista} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          )}

          {seccion === 'facturas' && perfil.notasCredito?.length > 0 && (
            <section style={{ marginTop: 26 }}>
              <h2 style={{ marginBottom: 10 }}>Notas de crédito ({perfil.notasCredito.length})</h2>
              <table>
                <thead><tr><th>Folio</th><th>Fecha</th><th className="num">Importe</th><th>CFDI</th></tr></thead>
                <tbody>
                  {perfil.notasCredito.map((n) => (
                    <tr key={n.id}>
                      <td className="mono">{[n.serie, n.folio].filter(Boolean).join('-') || '—'}</td>
                      <td>{fecha(n.fecha)}</td>
                      <td className="num neg">−{mxn(n.total)}</td>
                      <td><CfdiAcciones invoice={n} onVer={setCfdiVista} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="faint" style={NOTA}>
                Restan a lo facturado; las que referencian un VIN también restan a la utilidad de esa unidad.
              </p>
            </section>
          )}

          {seccion === 'taller' && (perfil.servicio?.ordenes ?? 0) === 0 && (
            <p className="muted">
              Sin órdenes de taller derivadas para este cliente todavía.
            </p>
          )}
          {seccion === 'taller' && perfil.servicio?.ordenes > 0 && (
            <section>
              <h2 style={{ marginBottom: 4 }}>Taller — {perfil.servicio.ordenes} orden(es) · {mxn(perfil.servicio.total)}</h2>
              <p className="faint" style={{ margin: '0 0 12px', fontSize: 12 }}>
                Mano de obra {mxn(perfil.servicio.manoObra)} · refacciones {mxn(perfil.servicio.refacciones)}{' '}
                (incluidas en el total) · última visita {fecha(perfil.servicio.ultimaVisita)}
              </p>
              <table>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Unidad</th><th className="num">M. de obra</th><th className="num">Refacc.</th><th className="num">Total</th><th>CFDI</th></tr></thead>
                <tbody>
                  {perfil.servicio.ultimas.map((s) => (
                    <tr key={s.id}>
                      <td>{fecha(s.fecha)}</td>
                      <td style={{ fontSize: 13 }}>{s.concepto ?? '—'}</td>
                      <td>
                        {s.vehiculo
                          ? <Link to={`/vehiculos/${s.vehiculo.id}`}>{s.vehiculo.marca} {s.vehiculo.modelo} {s.vehiculo.anio}</Link>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="num">{mxn(s.manoObra)}</td>
                      <td className="num">{mxn(s.refacciones)}</td>
                      <td className="num">{mxn(s.total)}</td>
                      <td><CfdiAcciones invoice={s.invoice} onVer={setCfdiVista} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {seccion === 'refacciones' && (perfil.refacciones?.partes ?? 0) === 0 && (
            <p className="muted">Sin refacciones ligadas a sus CFDIs.</p>
          )}
          {seccion === 'refacciones' && perfil.refacciones?.partes > 0 && (
            <section>
              <h2 style={{ marginBottom: 4 }}>Refacciones {lado === 'CLIENTE' ? 'compradas' : 'suministradas'}</h2>
              <p className="faint" style={{ margin: '0 0 12px', fontSize: 12 }}>
                {perfil.refacciones.partes} parte(s) distintas · {perfil.refacciones.piezas} piezas ·{' '}
                {mxn(perfil.refacciones.importe)}
              </p>
              <div className="warn" style={{ fontSize: 12, marginBottom: 12 }}>
                Detalle, <b>no venta adicional</b>: {mxn(perfil.refacciones.enOrdenes)} ya van dentro de las órdenes de
                taller y {mxn(perfil.refacciones.mostrador)} son venta de mostrador. Sumar esta pestaña con Taller
                contaría dos veces las mismas piezas.
              </div>
              <table>
                <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Piezas</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {perfil.refacciones.top.map((p) => (
                    <tr key={p.numeroParte}>
                      <td className="mono">{p.numeroParte}</td>
                      <td>{p.descripcion}</td>
                      <td className="num">{p.piezas}</td>
                      <td className="num">{mxn(p.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {seccion === 'estado' && lado === 'CLIENTE' && <EstadoDeCuenta clienteId={perfil.contacto.id} />}

          {seccion === 'relacion' && lado === 'CLIENTE' && (
            <>
              {/* ── Reporte problema cliente (RPC) ───────────────────────────
                  Sin modelo todavía. La caja va con la forma que va a tener:
                  cuatro cifras arriba y la lista de reportes abajo. */}
              <section className="card">
                <div className="card-head">
                  <span>Reporte problema cliente</span>
                  <span className="badge">RPC</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>por cablear</span>
                </div>
                <div className="caja-stats">
                  {['RPC abiertos', 'Cerrados 12 m', 'Cierre promedio', 'Reincidencias'].map((k) => (
                    <div key={k}>
                      <span className="v pendiente">—</span>
                      <span className="k">{k}</span>
                    </div>
                  ))}
                </div>
                <p className="sin-cablear">
                  <b>Todavía no se levantan RPC en el sistema.</b> No hay dónde guardarlos: falta el
                  modelo con folio, severidad, área, estado y el compromiso de respuesta. Se conecta
                  en la pasada de CRM.
                </p>
                <p className="nota-regla">
                  Cómo debe portarse cuando exista: un RPC abierto bloquea la encuesta de satisfacción
                  de la unidad y escala a planta a los 5 días hábiles.
                </p>
              </section>

              {/* ── Historial de contacto ────────────────────────────────────
                  Lo más cercano hoy es Prospecto.notas, que es UN renglón por
                  prospecto y se pierde cuando el prospecto se convierte en
                  cliente. Un historial necesita un renglón por toque. */}
              <section className="card">
                <div className="card-head">
                  <span>Historial de contacto</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>por cablear</span>
                </div>
                <div className="caja-stats">
                  {['Contactos 12 m', 'Efectivos', 'Tasa de contacto'].map((k) => (
                    <div key={k}>
                      <span className="v pendiente">—</span>
                      <span className="k">{k}</span>
                    </div>
                  ))}
                </div>
                <p className="sin-cablear">
                  <b>No se registran los toques con el cliente.</b> Lo más cercano que existe hoy es la
                  nota del prospecto, que es un solo renglón y se pierde cuando el prospecto se vuelve
                  cliente. Un historial necesita un renglón por contacto —canal, si fue efectivo, qué se
                  dijo y quién lo hizo— y sobrevivir a la conversión. Se conecta en la pasada de CRM.
                </p>
                <p className="nota-regla">
                  Los mensajes de WhatsApp que ya se guardan NO sirven aquí: son del asistente hablando
                  con el personal de la agencia, no de la agencia hablando con el cliente.
                </p>
              </section>
            </>
          )}

          {seccion === 'unidades' && (
          <section>
            <h2 style={{ marginBottom: 10 }}>{lado === 'CLIENTE' ? 'Unidades compradas' : 'Unidades suministradas'}</h2>
            {perfil.unidades.length === 0 ? <p className="muted">Sin unidades.</p> : (
              <table>
                <thead><tr><th>VIN</th><th>Unidad</th><th>Estado</th><th className="num">{lado === 'CLIENTE' ? 'Precio' : 'Costo'}</th>{lado === 'CLIENTE' && <th className="num">Utilidad</th>}</tr></thead>
                <tbody>
                  {perfil.unidades.map((v) => (
                    <tr key={v.id}>
                      <td className="mono"><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                      <td style={{ fontSize: 13 }}>{v.marca} {v.modelo} {v.anio}</td>
                      <td><span className={`badge badge-${v.estado}`}>{etiqueta(v.estado)}</span></td>
                      <td className="num">{mxn(lado === 'CLIENTE' ? v.precioVenta : v.costoCompra)}</td>
                      {lado === 'CLIENTE' && (
                        <td className={`num ${v.utilidad != null && v.utilidad < 0 ? 'neg' : ''}`}>
                          {v.utilidad != null ? mxn(v.utilidad) : <span className="muted">sin costo</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          )}
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

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
    FACTURA: ['Factura', 'badge-EN_TRANSITO'],
    NOTA_CREDITO: ['Nota de crédito', 'badge-CANCELADO'],
    PAGO_REP: ['Pago (REP)', 'badge-ENTREGADO'],
    PAGO_PUE: ['Pago (PUE)', 'badge-ENTREGADO'],
    COBRO_BANCO: ['Cobro (banco)', 'badge-DISPONIBLE'],
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="head-actions" style={{ marginBottom: 8 }}>
        <h2 style={{ marginRight: 'auto' }}>Estado de cuenta</h2>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }} className="no-print">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="ghost no-print" onClick={() => window.print()}>Imprimir</button>
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
                  <td className="mono" style={{ fontSize: 11 }}>{m.referencia ?? '—'}</td>
                  <td className="num">{m.cargo > 0 ? mxn(m.cargo) : '—'}</td>
                  <td className="num">{m.abono > 0 ? mxn(m.abono) : '—'}</td>
                  <td className={`num ${m.saldo > 0.01 ? '' : 'pos'}`}>{mxn(m.saldo)}</td>
                </tr>
              ))}
              {data.movimientos.length === 0 && <tr><td colSpan={6} className="muted">Sin movimientos en {data.year}.</td></tr>}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {data.resumen.movimientos} movimientos · cargos {mxn(data.resumen.cargos)} · abonos {mxn(data.resumen.abonos)} ·{' '}
            saldo final <b className={data.resumen.saldoFinal > 0.01 ? 'neg' : 'pos'}>{mxn(data.resumen.saldoFinal)}</b>.
            Documental: facturas y NC del CFDI, pagos por REP (con su fecha legal), PUE liquidadas en su emisión y cobros conciliados en banco.
          </p>
        </>
      )}
    </section>
  )
}

export default function ContactoPerfil() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const [lado, setLado] = useState(sp.get('lado') === 'PROVEEDOR' ? 'PROVEEDOR' : 'CLIENTE')
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState(null)

  const [portalMsg, setPortalMsg] = useState(null)
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
      <p><Link to={lado === 'PROVEEDOR' ? '/proveedores' : '/clientes'}>← {lado === 'PROVEEDOR' ? 'Proveedores' : 'Clientes'}</Link></p>
      {error && <div className="error">{error}</div>}
      {perfil && (
        <>
          <header className="page-head">
            <h1>{perfil.contacto.razonSocial}</h1>
            <div className="head-actions">
              <button className={lado === 'CLIENTE' ? '' : 'ghost'} onClick={() => setLado('CLIENTE')}>Como cliente</button>
              <button className={lado === 'PROVEEDOR' ? '' : 'ghost'} onClick={() => setLado('PROVEEDOR')}>Como proveedor</button>
              {lado === 'CLIENTE' && <button className="ghost" onClick={crearPortal}>Crear acceso al portal</button>}
            </div>
          </header>
          {portalMsg && <div className="warn">✓ {portalMsg}</div>}
          <p className="muted">RFC {perfil.contacto.rfc}{perfil.contacto.email ? ` · ${perfil.contacto.email}` : ''}</p>

          <div className="cards">
            <section className="card">
              <h2>Facturado</h2>
              <p className="kpi">{mxn(perfil.resumen.totalFacturado)}</p>
              <p className="muted">
                {perfil.resumen.numFacturas} facturas
                {perfil.resumen.totalNotasCredito > 0
                  ? ` · ${mxn(perfil.resumen.totalNotasCredito)} en notas de crédito`
                  : ''}
              </p>
            </section>
            <section className="card"><h2>{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</h2><p className="kpi">{mxn(perfil.resumen.totalPagado)}</p><p className="muted">Saldo: {mxn(perfil.resumen.saldo)}</p></section>
            {lado === 'CLIENTE' && perfil.rentabilidad && (
              <section className="card">
                <h2>Utilidad generada</h2>
                <p className={`kpi ${perfil.rentabilidad.utilidad >= 0 ? 'pos' : 'neg'}`}>{mxn(perfil.rentabilidad.utilidad)}</p>
                <p className="muted">
                  {perfil.rentabilidad.unidades} unidad(es)
                  {perfil.rentabilidad.margen != null ? ` · margen ${perfil.rentabilidad.margen}%` : ''}
                  {perfil.rentabilidad.sinCosto > 0 ? ` · ${perfil.rentabilidad.sinCosto} sin costo conocido` : ''}
                </p>
              </section>
            )}
            <section className="card">
              <h2>Complementos</h2>
              {perfil.resumen.repPendienteFacturas > 0 ? (
                <>
                  <p className="kpi neg">{mxn(perfil.resumen.repPendienteMonto)}</p>
                  <p className="muted">
                    {perfil.resumen.repPendienteFacturas} factura(s) — {lado === 'CLIENTE'
                      ? 'te falta emitir el REP (vence el día 5 del mes siguiente al cobro)'
                      : 'el proveedor no te ha emitido el REP: riesgo para tu deducción'}
                  </p>
                </>
              ) : <p className="kpi pos">✓ al día</p>}
            </section>
          </div>

          {(() => {
            const abiertas = perfil.facturas.filter((f) => f.saldo > 1)
            if (abiertas.length === 0) return null
            const total = abiertas.reduce((s, f) => s + f.saldo, 0)
            const dias = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)
            return (
              <section className="card">
                <h2>Por cobrar — {abiertas.length} factura(s) · {mxn(total)}</h2>
                <table>
                  <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">Cobrado</th><th className="num">Saldo</th><th className="num">Días</th></tr></thead>
                  <tbody>
                    {abiertas.map((f) => (
                      <tr key={f.id}>
                        <td>{[f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8)}</td>
                        <td>{fecha(f.fecha)}</td>
                        <td>{f.metodoPago}</td>
                        <td className="num">{mxn(f.total)}</td>
                        <td className="num">{mxn(f.pagado)}</td>
                        <td className="num neg">{mxn(f.saldo)}</td>
                        <td className={`num ${dias(f.fecha) > 90 ? 'neg' : ''}`}>{dias(f.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted" style={{ fontSize: 12 }}>
                  PUE se considera cobrada en su emisión; PPD por la mejor evidencia (REP o conciliación bancaria).
                </p>
              </section>
            )
          })()}

          <section className="card">
            <h2>Facturas</h2>
            {perfil.facturas.length === 0 ? <p className="muted">Sin facturas de este lado.</p> : (
              <table>
                <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</th><th className="num">REP pendiente</th><th className="num">Saldo</th></tr></thead>
                <tbody>
                  {perfil.facturas.map((f) => (
                    <tr key={f.id}>
                      <td>{[f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8)}</td>
                      <td>{fecha(f.fecha)}</td>
                      <td>{f.metodoPago}</td>
                      <td className="num">{mxn(f.total)}</td>
                      <td className="num">{mxn(f.pagado)}</td>
                      <td className="num">{f.repPendiente > 1 ? <span className="neg">{mxn(f.repPendiente)}</span> : '—'}</td>
                      <td className="num">{mxn(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {perfil.notasCredito?.length > 0 && (
            <section className="card">
              <h2>Notas de crédito ({perfil.notasCredito.length})</h2>
              <table>
                <thead><tr><th>Folio</th><th>Fecha</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {perfil.notasCredito.map((n) => (
                    <tr key={n.id}>
                      <td>{[n.serie, n.folio].filter(Boolean).join('-') || '—'}</td>
                      <td>{fecha(n.fecha)}</td>
                      <td className="num neg">−{mxn(n.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12 }}>
                Restan a lo facturado; las que referencian un VIN también restan a la utilidad de esa unidad.
              </p>
            </section>
          )}

          {lado === 'CLIENTE' && perfil.servicio?.ordenes > 0 && (
            <section className="card">
              <h2>Taller — {perfil.servicio.ordenes} orden(es) · {mxn(perfil.servicio.total)}</h2>
              <p className="muted">
                Mano de obra {mxn(perfil.servicio.manoObra)} · refacciones {mxn(perfil.servicio.refacciones)} ·
                última visita {fecha(perfil.servicio.ultimaVisita)}
              </p>
              <table>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Unidad</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {perfil.servicio.ultimas.map((s) => (
                    <tr key={s.id}>
                      <td>{fecha(s.fecha)}</td>
                      <td>{s.concepto ?? '—'}</td>
                      <td>{s.vehiculoId ? <Link to={`/vehiculos/${s.vehiculoId}`}>ver unidad</Link> : '—'}</td>
                      <td className="num">{mxn(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {perfil.refacciones?.partes > 0 && (
            <section className="card">
              <h2>Refacciones {lado === 'CLIENTE' ? 'compradas' : 'suministradas'}</h2>
              <p className="muted">
                {perfil.refacciones.partes} parte(s) distintas · {perfil.refacciones.piezas} piezas ·{' '}
                {mxn(perfil.refacciones.importe)}
              </p>
              <table>
                <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Piezas</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {perfil.refacciones.top.map((p) => (
                    <tr key={p.numeroParte}>
                      <td className="mono" style={{ fontSize: 11 }}>{p.numeroParte}</td>
                      <td>{p.descripcion}</td>
                      <td className="num">{p.piezas}</td>
                      <td className="num">{mxn(p.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {lado === 'CLIENTE' && <EstadoDeCuenta clienteId={perfil.contacto.id} />}

          <section className="card">
            <h2>{lado === 'CLIENTE' ? 'Unidades compradas' : 'Unidades suministradas'}</h2>
            {perfil.unidades.length === 0 ? <p className="muted">Sin unidades.</p> : (
              <table>
                <thead><tr><th>VIN</th><th>Unidad</th><th>Estado</th><th className="num">{lado === 'CLIENTE' ? 'Precio' : 'Costo'}</th>{lado === 'CLIENTE' && <th className="num">Utilidad</th>}</tr></thead>
                <tbody>
                  {perfil.unidades.map((v) => (
                    <tr key={v.id}>
                      <td><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                      <td>{v.marca} {v.modelo} {v.anio}</td>
                      <td><span className={`badge badge-${v.estado}`}>{v.estado.replaceAll('_', ' ')}</span></td>
                      <td className="num">{mxn(lado === 'CLIENTE' ? v.precioVenta : v.costoCompra)}</td>
                      {lado === 'CLIENTE' && (
                        <td className={`num ${v.utilidad != null && v.utilidad < 0 ? 'neg' : ''}`}>
                          {v.utilidad != null ? mxn(v.utilidad) : <span className="muted" style={{ fontSize: 11 }}>sin costo</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}

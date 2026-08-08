import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

// Perfil 360° del contacto: pestaña "Como cliente" (lo que le facturamos,
// cobros y REPs que NOSOTROS debemos emitir) y "Como proveedor" (lo que nos
// facturó, pagos y REPs que ÉL nos debe — riesgo de deducción).
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
            <section className="card"><h2>Facturado</h2><p className="kpi">{mxn(perfil.resumen.totalFacturado)}</p><p className="muted">{perfil.resumen.numFacturas} facturas</p></section>
            <section className="card"><h2>{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</h2><p className="kpi">{mxn(perfil.resumen.totalPagado)}</p><p className="muted">Saldo: {mxn(perfil.resumen.saldo)}</p></section>
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

          <section className="card">
            <h2>{lado === 'CLIENTE' ? 'Unidades compradas' : 'Unidades suministradas'}</h2>
            {perfil.unidades.length === 0 ? <p className="muted">Sin unidades.</p> : (
              <table>
                <thead><tr><th>VIN</th><th>Unidad</th><th>Estado</th><th className="num">{lado === 'CLIENTE' ? 'Precio' : 'Costo'}</th></tr></thead>
                <tbody>
                  {perfil.unidades.map((v) => (
                    <tr key={v.id}>
                      <td><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                      <td>{v.marca} {v.modelo} {v.anio}</td>
                      <td><span className={`badge badge-${v.estado}`}>{v.estado.replaceAll('_', ' ')}</span></td>
                      <td className="num">{mxn(lado === 'CLIENTE' ? v.precioVenta : v.costoCompra)}</td>
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

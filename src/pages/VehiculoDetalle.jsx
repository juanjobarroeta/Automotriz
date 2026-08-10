import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiDownload, apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const COSTO_TIPOS = ['ACONDICIONAMIENTO', 'TRASLADO', 'ACCESORIOS', 'INTERES_PISO', 'OTRO']

export default function VehiculoDetalle() {
  const { id } = useParams()
  const [v, setV] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [advertencias, setAdvertencias] = useState([])
  const [cfdiVista, setCfdiVista] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setV(await apiFetch(`/api/automotriz/vehiculos/${id}`))
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  const recibir = async () => {
    setBusy(true); setError(null)
    try { await apiFetch(`/api/automotriz/vehiculos/${id}/recibir`, { method: 'POST', body: {} }); await cargar() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const vender = async () => {
    const precio = window.prompt('Precio de venta (sin IVA):', v?.precioLista ?? '')
    if (!precio) return
    setBusy(true); setError(null)
    try {
      const r = await apiFetch(`/api/automotriz/vehiculos/${id}/vender`, {
        method: 'POST',
        body: { precioVenta: Number(precio) },
      })
      setAdvertencias(r.advertencias ?? [])
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const [costoForm, setCostoForm] = useState({ tipo: 'ACONDICIONAMIENTO', concepto: '', monto: '' })
  const agregarCosto = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/vehiculos/${id}/costos`, {
        method: 'POST',
        body: {
          tipo: costoForm.tipo,
          concepto: costoForm.concepto || costoForm.tipo,
          monto: Number(costoForm.monto),
        },
      })
      setCostoForm({ tipo: 'ACONDICIONAMIENTO', concepto: '', monto: '' })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!v) return <div>{error ? <div className="error">{error}</div> : <p className="muted">Cargando…</p>}</div>

  const puedeRecibir = v.estado === 'EN_TRANSITO'
  const puedeApartar = v.estado === 'DISPONIBLE'
  const puedeDesapartar = v.estado === 'APARTADO'
  const marcarUso = async (uso) => {
    setBusy(true); setError(null)
    try { await apiFetch(`/api/automotriz/vehiculos/${id}`, { method: 'PATCH', body: { uso } }); await cargar() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const transicion = async (accion) => {
    setBusy(true); setError(null)
    try { await apiFetch(`/api/automotriz/vehiculos/${id}/${accion}`, { method: 'POST', body: {} }); await cargar() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const puedeVender = v.estado === 'DISPONIBLE' || v.estado === 'APARTADO'
  const puedeCostos = !['VENDIDO', 'ENTREGADO', 'CANCELADO'].includes(v.estado)

  // Descarga del CFDI ligado: XML siempre que el sync lo guardó; PDF sólo si la
  // factura se emitió en la app (los CFDIs del SAT no traen representación impresa).
  const descargarCfdi = async (inv, format) => {
    if (!inv) return
    setError(null)
    const nombre = `${[inv.serie, inv.folio].filter(Boolean).join('-') || inv.uuid || inv.id}.${format}`
    try { await apiDownload(`/api/facturas/${inv.id}/download?format=${format}`, nombre) }
    catch (err) { setError(err.message) }
  }
  const CfdiLinks = ({ inv }) => inv ? (
    <>
      <span className="mono" style={{ fontSize: 11 }}>{inv.uuid ? `${inv.uuid.slice(0, 8)}…` : inv.id}</span>{' '}
      <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setCfdiVista(inv.id)}>Ver</button>
      <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => descargarCfdi(inv, 'xml')}>XML</button>
      {inv.facturapiId && (
        <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => descargarCfdi(inv, 'pdf')}>PDF</button>
      )}
    </>
  ) : '—'

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      <p><Link to="/">← Inventario</Link></p>
      <header className="page-head">
        <h1>{v.marca} {v.modelo} {v.version ?? ''} {v.anio}</h1>
        <span className={`badge badge-${v.estado}`}>{v.estado.replaceAll('_', ' ')}</span>
      </header>
      <p className="muted">VIN {v.vin} {v.numeroMotor ? `· Motor ${v.numeroMotor}` : ''} · {v.tipo} {v.color ? `· ${v.color}` : ''}</p>

      {error && <div className="error">{error}</div>}
      {advertencias.map((a, i) => <div className="warn" key={i}>⚠️ {a}</div>)}

      <div className="cards">
        <section className="card">
          <h2>Compra</h2>
          <dl>
            <dt>Costo (sin IVA)</dt>
            <dd>
              {mxn(v.costoCompra)}
              {v.autoCreado && !v.compraInvoiceId && (
                <button className="ghost" style={{ padding: '2px 10px', fontSize: 12, marginLeft: 6 }}
                  onClick={async () => {
                    const c = window.prompt('Costo real de compra (sin IVA) — la factura quedó fuera del archivo de 5 años del SAT:', v.costoCompra || '')
                    if (!c) return
                    setBusy(true); setError(null)
                    try { await apiFetch(`/api/automotriz/vehiculos/${id}`, { method: 'PATCH', body: { costoCompra: Number(c) } }); await cargar() }
                    catch (err) { setError(err.message) } finally { setBusy(false) }
                  }} disabled={busy}>
                  {v.costoCompra > 0 ? 'Corregir' : 'Capturar costo'}
                </button>
              )}
            </dd>
            <dt>Fecha</dt><dd>{fecha(v.fechaCompra)}</dd>
            <dt>Proveedor</dt><dd>{v.supplier?.razonSocial ?? '—'}</dd>
            <dt>CFDI compra</dt>
            <dd>{v.compraInvoice ? <CfdiLinks inv={v.compraInvoice} /> : (v.autoCreado ? <span className="muted" style={{ fontSize: 12 }}>fuera del archivo SAT (anterior a sep 2021)</span> : '—')}</dd>
            <dt>Plan piso</dt>
            <dd>{v.planPisoTasaAnual != null ? `${(v.planPisoTasaAnual * 100).toFixed(2)}% anual desde ${fecha(v.planPisoInicio)}` : '—'}</dd>
          </dl>
          {puedeRecibir && (
            <button onClick={recibir} disabled={busy}>Recibir unidad (postea inventario)</button>
          )}
        </section>

        <section className="card">
          <h2>Venta</h2>
          <dl>
            <dt>Precio lista</dt><dd>{mxn(v.precioLista)}</dd>
            <dt>Precio venta (sin IVA)</dt><dd>{mxn(v.precioVenta)}</dd>
            <dt>ISAN</dt><dd>{mxn(v.isan)}</dd>
            <dt>Fecha</dt><dd>{fecha(v.fechaVenta)}</dd>
            <dt>Cliente</dt><dd>{v.cliente?.razonSocial ?? (v.ventaInvoiceId ? 'Público en general' : '—')}</dd>
            <dt>Vendedor</dt><dd>{v.vendedor ? `${v.vendedor.nombre} ${v.vendedor.apellidoPaterno}` : '—'}</dd>
            <dt>Comisión</dt><dd>{mxn(v.comisionMonto)}</dd>
            <dt>CFDI venta</dt><dd><CfdiLinks inv={v.ventaInvoice} /></dd>
          </dl>
          <div className="acciones" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {puedeApartar && <button className="ghost" onClick={() => transicion('apartar')} disabled={busy}>Apartar</button>}
            {puedeDesapartar && <button className="ghost" onClick={() => transicion('desapartar')} disabled={busy}>Des-apartar</button>}
            {puedeVender && <button className="success" onClick={vender} disabled={busy}>Vender (ISAN + IVA + pólizas)</button>}
            {!['VENDIDO', 'ENTREGADO', 'CANCELADO'].includes(v.estado) && (
              <select value={v.uso ?? 'VENTA'} onChange={(e) => marcarUso(e.target.value)} style={{ width: 'auto' }} disabled={busy}>
                <option value="VENTA">Uso: venta</option>
                <option value="DEMO">Uso: demo</option>
                <option value="CORTESIA">Uso: cortesía</option>
              </select>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Rentabilidad por VIN</h2>
          {v.rentabilidad ? (
            <dl>
              <dt>Precio venta</dt><dd>{mxn(v.rentabilidad.precioVenta)}</dd>
              <dt>− Costo compra</dt><dd>{mxn(v.rentabilidad.costoCompra)}</dd>
              <dt>− Costos adicionales</dt><dd>{mxn(v.rentabilidad.costosAdicionales)}</dd>
              <dt className="muted">   (de los cuales interés piso)</dt><dd className="muted">{mxn(v.rentabilidad.interesPiso)}</dd>
              <dt>− Comisión</dt><dd>{mxn(v.rentabilidad.comision)}</dd>
              <dt><strong>Utilidad</strong></dt>
              <dd><strong className={v.rentabilidad.utilidad >= 0 ? 'pos' : 'neg'}>{mxn(v.rentabilidad.utilidad)}</strong></dd>
            </dl>
          ) : (
            <p className="muted">Se calcula al vender. Costos acumulados: {mxn(v.costosTotal)} (interés piso: {mxn(v.interesPiso)}).</p>
          )}
        </section>
      </div>

      {(v.expediente?.length ?? 0) > 0 && (
        <section className="card">
          <h2>Expediente CFDI del VIN</h2>
          <table>
            <thead><tr><th>Fecha</th><th>Folio</th><th>Papel</th><th className="num">Total</th><th>CFDI</th></tr></thead>
            <tbody>
              {[...v.expediente].sort((a, b) => new Date(a.invoice.fecha) - new Date(b.invoice.fecha)).map((e) => (
                <tr key={e.id}>
                  <td>{fecha(e.invoice.fecha)}</td>
                  <td>{[e.invoice.serie, e.invoice.folio].filter(Boolean).join('-') || e.invoice.uuid?.slice(0, 8)}</td>
                  <td>
                    <span className={`badge ${
                      e.rol === 'COMPRA' || e.rol === 'VENTA' ? 'badge-DISPONIBLE'
                      : e.rol === 'NOTA_CREDITO' || e.rol === 'COSTO' ? 'badge-APARTADO'
                      : e.rol === 'SERVICIO' ? 'badge-ENTREGADO'
                      : 'badge-CANCELADO'}`}>
                      {e.rol.replaceAll('_', ' ')}
                    </span>
                    {e.invoice.status === 'CANCELLED' && <span className="badge badge-CANCELADO" style={{ marginLeft: 4 }}>CANCELADA</span>}
                  </td>
                  <td className="num">{mxn(e.invoice.total)}</td>
                  <td>
                    <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setCfdiVista(e.invoice.id)}>Ver</button>{' '}
                    <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => descargarCfdi(e.invoice, 'xml')}>XML</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>Toda factura que menciona este VIN, ligue o no: sustituidas y duplicadas quedan visibles para auditoría.</p>
        </section>
      )}

      <section className="card">
        <h2>Costos de la unidad</h2>
        {v.costos.length === 0 ? (
          <p className="muted">Sin costos registrados.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th className="num">Monto</th><th>CFDI origen</th></tr>
            </thead>
            <tbody>
              {v.costos.map((c) => (
                <tr key={c.id}>
                  <td>{fecha(c.fecha)}</td>
                  <td>{c.tipo.replaceAll('_', ' ')}</td>
                  <td>{c.concepto}</td>
                  <td className={`num ${c.monto < 0 ? 'pos' : ''}`}>{mxn(c.monto)}</td>
                  <td>
                    {c.invoiceId ? (
                      <>
                        <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setCfdiVista(c.invoiceId)}>Ver</button>{' '}
                        <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => descargarCfdi({ id: c.invoiceId }, 'xml')}>XML</button>
                      </>
                    ) : <span className="muted" style={{ fontSize: 12 }}>manual</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {puedeCostos && (
          <form className="inline-form" onSubmit={agregarCosto}>
            <select value={costoForm.tipo} onChange={(e) => setCostoForm((f) => ({ ...f, tipo: e.target.value }))}>
              {COSTO_TIPOS.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
            </select>
            <input placeholder="Concepto" value={costoForm.concepto}
              onChange={(e) => setCostoForm((f) => ({ ...f, concepto: e.target.value }))} />
            <input type="number" step="0.01" min="0.01" placeholder="Monto sin IVA" required value={costoForm.monto}
              onChange={(e) => setCostoForm((f) => ({ ...f, monto: e.target.value }))} />
            <button type="submit" disabled={busy}>Agregar costo</button>
          </form>
        )}
      </section>
    </div>
  )
}

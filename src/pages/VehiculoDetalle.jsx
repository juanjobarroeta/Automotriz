import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiDownload, apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'
import { AvisoError } from '../components/Estados'

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const COSTO_TIPOS = ['ACONDICIONAMIENTO', 'TRASLADO', 'ACCESORIOS', 'INTERES_PISO', 'OTRO']

// Rótulos: ningún chip ni celda va en mayúsculas forzadas (DESIGN §6).
const ESTADO_LABEL = {
  EN_TRANSITO: 'En tránsito', DISPONIBLE: 'Disponible', APARTADO: 'Apartado',
  VENDIDO: 'Vendido', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
}
const COSTO_LABEL = {
  ACONDICIONAMIENTO: 'Acondicionamiento', TRASLADO: 'Traslado', ACCESORIOS: 'Accesorios',
  INTERES_PISO: 'Interés de piso', OTRO: 'Otro',
}
const ROL_LABEL = {
  COMPRA: 'Compra', VENTA: 'Venta', NOTA_CREDITO: 'Nota de crédito',
  COSTO: 'Costo', SERVICIO: 'Servicio',
}
// Par de color del rol dentro del expediente (DESIGN §2 «Estados»).
const ROL_BADGE = {
  COMPRA: 'badge-ok', VENTA: 'badge-ok', NOTA_CREDITO: 'badge-warn',
  COSTO: 'badge-warn', SERVICIO: 'badge-neutral',
}
// Columnas secundarias de tabla: 12.5px --ink-3.
const SEC = { color: 'var(--ink-3)' }
// Botón en línea dentro de celda: mismo control ghost en tamaño compacto.
const MINI = { padding: '2px 10px', fontSize: 12 }

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
  // Edición puntual de un campo de la ficha (mismo idioma window.prompt que
  // «Capturar costo»): vacío = limpiar, Cancelar = no tocar.
  const editar = async (campo, label, { numero } = {}) => {
    const val = window.prompt(`${label}:`, v?.[campo] ?? '')
    if (val === null) return
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/vehiculos/${id}`, {
        method: 'PATCH',
        body: { [campo]: val.trim() === '' ? null : (numero ? Number(val) : val.trim()) },
      })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const Editar = ({ campo, label, numero }) => (
    <button className="ghost" style={{ ...MINI, marginLeft: 6 }} disabled={busy}
      onClick={() => editar(campo, label, { numero })}>Editar</button>
  )
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
      <span className="mono">{inv.uuid ? `${inv.uuid.slice(0, 8)}…` : inv.id}</span>{' '}
      <button className="ghost" style={MINI} onClick={() => setCfdiVista(inv.id)}>Ver</button>{' '}
      <button className="ghost" style={MINI} onClick={() => descargarCfdi(inv, 'xml')}>XML</button>
      {inv.facturapiId && (
        <> <button className="ghost" style={MINI} onClick={() => descargarCfdi(inv, 'pdf')}>PDF</button></>
      )}
    </>
  ) : '—'

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      <p style={{ margin: '0 0 10px', fontSize: 12.5 }}><Link to="/" className="muted">← Inventario</Link></p>
      <header className="page-head">
        <h1>{v.marca} {v.modelo} {v.version ?? ''} {v.anio}</h1>
        <span className="glosa">
          VIN <span className="mono">{v.vin}</span>
          {v.numeroMotor ? <> · motor <span className="mono">{v.numeroMotor}</span></> : null}
          {v.claveVehicular ? <> · clave <span className="mono">{v.claveVehicular}</span></> : null}
          {' · '}{v.tipo === 'NUEVO' ? 'Nuevo' : 'Seminuevo'}{v.color ? ` · ${v.color}` : ''}
          {(v.otrosCiclos?.length ?? 0) > 0 ? <> · ciclo {v.ciclo} de {v.otrosCiclos.length + 1}</> : null}
        </span>
        <div className="head-actions">
          <span className={`badge badge-${v.estado}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span>
        </div>
      </header>

      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}
      {advertencias.map((a, i) => <div className="warn" key={i}>{a}</div>)}

      <div className="cards">
        <section className="card">
          <div className="card-head"><span>Compra</span></div>
          <dl>
            <dt>Costo (sin IVA)</dt>
            <dd>
              {mxn(v.costoCompra)}
              {v.autoCreado && !v.compraInvoiceId && (
                <button className="ghost" style={{ ...MINI, marginLeft: 6 }}
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
            <dd>{v.compraInvoice ? <CfdiLinks inv={v.compraInvoice} /> : (v.autoCreado ? <span className="muted">fuera del archivo SAT (anterior a sep 2021)</span> : '—')}</dd>
            <dt>Plan piso</dt>
            <dd>{v.planPisoTasaAnual != null ? `${(v.planPisoTasaAnual * 100).toFixed(2)}% anual desde ${fecha(v.planPisoInicio)}` : '—'}</dd>
          </dl>
          {puedeRecibir && (
            <div className="card-divider">
              <button onClick={recibir} disabled={busy}>Recibir unidad (postea inventario)</button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><span>Venta</span></div>
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
          <div className="acciones card-divider" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {puedeApartar && <button className="ghost" onClick={() => transicion('apartar')} disabled={busy}>Apartar</button>}
            {puedeDesapartar && <button className="ghost" onClick={() => transicion('desapartar')} disabled={busy}>Des-apartar</button>}
            {puedeVender && <button onClick={vender} disabled={busy}>Vender (ISAN + IVA + pólizas)</button>}
            {['DISPONIBLE', 'APARTADO'].includes(v.estado) && v.autoCreado && !v.ventaInvoiceId && (
              <button className="ghost" disabled={busy} onClick={async () => {
                const f = window.prompt('Marcar VENDIDA sin CFDI ligable (sólo dato, no postea).\nFecha de venta (AAAA-MM-DD, vacío = hoy):', '')
                if (f === null) return
                const p = window.prompt('Precio de venta sin IVA (vacío = desconocido):', '')
                if (p === null) return
                setBusy(true); setError(null)
                try {
                  await apiFetch(`/api/automotriz/vehiculos/${id}/marcar-vendida`, {
                    method: 'POST',
                    body: {
                      ...(f.trim() ? { fechaVenta: new Date(`${f.trim()}T12:00:00Z`).toISOString() } : {}),
                      precioVenta: p.trim() ? Number(p) : null,
                    },
                  })
                  await cargar()
                } catch (err) { setError(err.message) } finally { setBusy(false) }
              }}>Marcar vendida (sin CFDI)</button>
            )}
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
          <div className="card-head"><span>Rentabilidad por VIN</span></div>
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

        <section className="card">
          <div className="card-head"><span>Ficha de la unidad</span></div>
          <dl>
            <dt>Color</dt>
            <dd>{v.color ?? '—'}<Editar campo="color" label="Color" /></dd>
            <dt>N.º económico</dt>
            <dd>{v.numeroEconomico ?? '—'}<Editar campo="numeroEconomico" label="Número económico" /></dd>
            <dt>Kilometraje</dt>
            <dd>{v.kilometraje != null ? `${v.kilometraje.toLocaleString('es-MX')} km` : '—'}<Editar campo="kilometraje" label="Kilometraje" numero /></dd>
            <dt>Clave vehicular</dt>
            <dd>{v.claveVehicular ? <span className="mono">{v.claveVehicular}</span> : '—'}</dd>
            <dt>Notas</dt>
            <dd style={SEC}>{v.notas ?? '—'}<Editar campo="notas" label="Notas" /></dd>
          </dl>
          {(v.otrosCiclos?.length ?? 0) > 0 && (
            <div className="card-divider">
              <div className="glosa" style={{ marginBottom: 4 }}>Otros ciclos de este VIN</div>
              {v.otrosCiclos.map((c) => (
                <div key={c.id} style={{ fontSize: 12.5 }}>
                  <Link to={`/vehiculos/${c.id}`}>Ciclo {c.ciclo}</Link>{' '}
                  <span className="muted">
                    {fecha(c.fechaCompra)} → {c.fechaVenta ? fecha(c.fechaVenta) : 'en piso'}
                  </span>{' '}
                  <span className={`badge badge-${c.estado}`}>{ESTADO_LABEL[c.estado] ?? c.estado}</span>
                </div>
              ))}
            </div>
          )}
          {v.descripcionCfdi && (
            <div className="card-note" title={v.descripcionCfdi}>
              CFDI de origen: «{v.descripcionCfdi.length > 140 ? `${v.descripcionCfdi.slice(0, 140)}…` : v.descripcionCfdi}»
            </div>
          )}
        </section>
      </div>

      {(v.expediente?.length ?? 0) > 0 && (
        <section className="card">
          <div className="card-head"><span>Expediente CFDI del VIN</span></div>
          <table>
            <thead><tr><th>Fecha</th><th>Folio</th><th>Papel</th><th className="num">Total</th><th>CFDI</th></tr></thead>
            <tbody>
              {[...v.expediente].sort((a, b) => new Date(a.invoice.fecha) - new Date(b.invoice.fecha)).map((e) => (
                <tr key={e.id}>
                  <td style={SEC}>{fecha(e.invoice.fecha)}</td>
                  <td className="mono">{[e.invoice.serie, e.invoice.folio].filter(Boolean).join('-') || e.invoice.uuid?.slice(0, 8)}</td>
                  <td>
                    <span className={`badge ${ROL_BADGE[e.rol] ?? 'badge-danger'}`}>
                      {ROL_LABEL[e.rol] ?? e.rol.replaceAll('_', ' ')}
                    </span>
                    {e.invoice.status === 'CANCELLED' && <span className="badge badge-danger" style={{ marginLeft: 4 }}>Cancelada</span>}
                  </td>
                  <td className="num">{mxn(e.invoice.total)}</td>
                  <td>
                    <button className="ghost" style={MINI} onClick={() => setCfdiVista(e.invoice.id)}>Ver</button>{' '}
                    <button className="ghost" style={MINI} onClick={() => descargarCfdi(e.invoice, 'xml')}>XML</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-note">Toda factura que menciona este VIN, ligue o no: sustituidas y duplicadas quedan visibles para auditoría.</div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><span>Costos de la unidad</span></div>
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
                  <td style={SEC}>{fecha(c.fecha)}</td>
                  <td>{COSTO_LABEL[c.tipo] ?? c.tipo.replaceAll('_', ' ')}</td>
                  <td style={SEC}>{c.concepto}</td>
                  <td className={`num ${c.monto < 0 ? 'pos' : ''}`}>{mxn(c.monto)}</td>
                  <td>
                    {c.invoiceId ? (
                      <>
                        <button className="ghost" style={MINI} onClick={() => setCfdiVista(c.invoiceId)}>Ver</button>{' '}
                        <button className="ghost" style={MINI} onClick={() => descargarCfdi({ id: c.invoiceId }, 'xml')}>XML</button>
                      </>
                    ) : <span className="muted">manual</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {puedeCostos && (
          <form className="inline-form" onSubmit={agregarCosto}>
            <select value={costoForm.tipo} onChange={(e) => setCostoForm((f) => ({ ...f, tipo: e.target.value }))}>
              {COSTO_TIPOS.map((t) => <option key={t} value={t}>{COSTO_LABEL[t] ?? t}</option>)}
            </select>
            <input placeholder="Concepto" value={costoForm.concepto}
              onChange={(e) => setCostoForm((f) => ({ ...f, concepto: e.target.value }))} />
            <input type="number" step="0.01" min="0.01" placeholder="Monto sin IVA" required value={costoForm.monto}
              onChange={(e) => setCostoForm((f) => ({ ...f, monto: e.target.value }))} />
            <button type="submit" className="ghost" disabled={busy}>Agregar costo</button>
          </form>
        )}
      </section>
    </div>
  )
}

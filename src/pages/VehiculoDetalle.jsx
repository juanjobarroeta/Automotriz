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

const CAMPO_LABEL = {
  costoCompra: 'Costo de compra', precioLista: 'Precio de lista', kilometraje: 'Kilometraje',
  color: 'Color', numeroEconomico: 'Número económico', uso: 'Uso',
  planPisoTasaAnual: 'Tasa de plan piso', planPisoInicio: 'Inicio de plan piso',
  notas: 'Notas', marca: 'Marca', modelo: 'Modelo', version: 'Versión', anio: 'Año',
}

// Un valor vacío se dice «vacío», no se pinta como una celda en blanco: en un
// diff, la ausencia ES el dato.
function valorLegible(campo, valor) {
  if (valor == null || valor === '') return 'vacío'
  if (campo === 'costoCompra' || campo === 'precioLista') {
    return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
  }
  if (campo === 'planPisoTasaAnual') return `${(Number(valor) * 100).toFixed(2)}%`
  if (campo === 'planPisoInicio') return String(valor).slice(0, 10)
  if (campo === 'kilometraje') return `${Number(valor).toLocaleString('es-MX')} km`
  return String(valor)
}

const fechaHora = (d) =>
  d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

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
        <h1>{v.marca} {v.modelo} {v.anio}</h1>
        <span className="glosa" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--ink3)' }}>{(v.vin ?? '').slice(0, -6)}</span>
            <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{(v.vin ?? '').slice(-6)}</b>
          </span>
          <button
            type="button"
            className="ghost"
            style={{ ...MINI }}
            onClick={() => navigator.clipboard?.writeText(v.vin ?? '')}
            title="Copiar el VIN completo"
          >
            Copiar
          </button>
          <span className="muted" style={{ fontSize: 11 }}>
            los últimos 6 son los que dicta la gente por teléfono
          </span>
        </span>
        {v.version && (
          <span className="glosa" style={{ display: 'block', marginTop: 2 }}>{v.version}</span>
        )}
        <div className="head-actions">
          <span className={`badge badge-${v.estado}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span>
          {v.diasEnPiso != null && (
            <span
              className="badge"
              style={v.diasEnPiso > 90
                ? { background: 'var(--negBg)', color: 'var(--neg)' }
                : { background: 'var(--panel3)', color: 'var(--ink2)' }}
            >
              {v.diasEnPiso} días en piso
            </span>
          )}
          {(v.otrosCiclos?.length ?? 0) > 0 && (
            <span className="badge" title="La unidad ya pasó antes por el piso">
              ciclo {v.ciclo} de {v.otrosCiclos.length + 1}
            </span>
          )}
        </div>
      </header>

      {/* La tira de cuatro: precio, lo que lleva costado, lo que devenga y lo
          que quedaría. Un número no se enseña sin el que lo contradice. */}
      <div className="kpi-strip densa" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <div className="kpi-item">
          <span className="kpi-label">Precio de lista</span>
          <span className="kpi">{v.precioLista ? mxn(v.precioLista) : <span style={{ color: 'var(--ink3)' }}>n/d</span>}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Costo acumulado</span>
          <span className="kpi">
            {v.costoCompra
              ? mxn(v.costoCompra + (v.costosTotal ?? 0))
              : <span style={{ color: 'var(--neg)' }}>sin documentar</span>}
          </span>
          <span className="kpi-sub">compra {mxn(v.costoCompra)} + costos {mxn(v.costosTotal)}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Interés devengado</span>
          <span className="kpi" style={v.interesPiso > 0 ? { color: 'var(--neg)' } : undefined}>
            {mxn(v.interesPiso)}
          </span>
          {v.planPisoTasaAnual != null && (
            <span className="kpi-sub">{(v.planPisoTasaAnual * 100).toFixed(2)}% anual devengado a diario</span>
          )}
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Utilidad proyectada</span>
          <span className="kpi" style={(() => {
            const u = v.costoCompra && v.precioLista
              ? v.precioLista - v.costoCompra - (v.costosTotal ?? 0) : null
            return u != null && u < 0 ? { color: 'var(--neg)' } : undefined
          })()}>
            {v.costoCompra && v.precioLista
              ? mxn(v.precioLista - v.costoCompra - (v.costosTotal ?? 0))
              : <span style={{ color: 'var(--ink3)' }}>n/d</span>}
          </span>
          {!(v.costoCompra && v.precioLista) && (
            <span className="kpi-sub">falta {!v.costoCompra ? 'el costo' : 'el precio de lista'}</span>
          )}
        </div>
      </div>

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
              <dd><strong className={v.rentabilidad.utilidad >= 0 ? '' : 'neg'}>{mxn(v.rentabilidad.utilidad)}</strong></dd>
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
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th><th>Concepto</th><th>CFDI</th><th>Origen</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {v.costos.map((c) => (
                <tr key={c.id}>
                  <td style={SEC}>{fecha(c.fecha)}</td>
                  <td className="celda2">
                    <b>{c.concepto || (COSTO_LABEL[c.tipo] ?? c.tipo.replaceAll('_', ' '))}</b>
                    <span>{COSTO_LABEL[c.tipo] ?? c.tipo.replaceAll('_', ' ')}</span>
                  </td>
                  <td>
                    {c.invoiceId ? (
                      <>
                        <button className="ghost" style={MINI} onClick={() => setCfdiVista(c.invoiceId)}>Ver</button>{' '}
                        <button className="ghost" style={MINI} onClick={() => descargarCfdi({ id: c.invoiceId }, 'xml')}>XML</button>
                      </>
                    ) : <span style={{ color: 'var(--neg)' }}>sin CFDI</span>}
                  </td>
                  {/* Quién escribió el renglón. Sin esta marca no se puede
                      volver a derivar una factura sin arriesgarse a borrar un
                      costo que alguien capturó a mano. */}
                  <td>
                    {c.autoCreado
                      ? <span className="badge" style={{ background: 'var(--accSoft)', color: 'var(--acc)' }}>Derivador</span>
                      : <span className="badge">Persona</span>}
                  </td>
                  <td className="num">{mxn(c.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="alcance">{v.costos.length} concepto(s)</td>
                <td /><td /><td />
                <td style={{ textAlign: 'right' }}>{mxn(v.costosTotal)}</td>
              </tr>
            </tfoot>
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

      {/* ── Bitácora del expediente ─────────────────────────────────────────
          Quién escribió qué, qué decía antes y qué dice ahora. Es la pregunta
          que meses después nadie podía contestar: «¿de dónde salió este
          costo?». Sólo existe desde que se empezó a registrar, y el pie lo
          dice en vez de fingir un historial completo. */}
      <section className="card">
        <div className="card-head"><span>Bitácora del expediente</span></div>
        {(v.bitacora?.length ?? 0) === 0 ? (
          <p className="muted">
            Todavía no hay cambios registrados en esta unidad. La bitácora anota cada campo que se
            edita —lo que decía antes y lo que dice ahora— desde que se empezó a registrar.
          </p>
        ) : (
          <>
            <table className="tabla">
              <thead>
                <tr><th>Cuándo</th><th>Quién</th><th>Campo</th><th>Cambio</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {v.bitacora.flatMap((e) => {
                  const d = e.detalle ?? {}
                  const cambios = Array.isArray(d.cambios) ? d.cambios : []
                  if (cambios.length === 0) return []
                  return cambios.map((c, i) => (
                    <tr key={`${e.id}-${i}`}>
                      <td style={SEC}>{fechaHora(e.createdAt)}</td>
                      <td>
                        {e.actorEmail
                          ? <span className="badge">{e.actorEmail.split('@')[0]}</span>
                          : <span className="badge" style={{ background: 'var(--accSoft)', color: 'var(--acc)' }}>Derivador</span>}
                      </td>
                      <td style={SEC}>{CAMPO_LABEL[c.campo] ?? c.campo}</td>
                      <td>
                        {/* Tachado el valor viejo, en rojo; el nuevo en verde.
                            Aquí el color SÍ es información: dice qué se fue. */}
                        <span style={{ color: 'var(--neg)', textDecoration: 'line-through' }}>
                          {valorLegible(c.campo, c.antes)}
                        </span>
                        {' → '}
                        <span style={{ color: 'var(--pos)' }}>{valorLegible(c.campo, c.despues)}</span>
                      </td>
                      <td style={SEC}>{d.motivo || <span style={{ color: 'var(--ink3)' }}>—</span>}</td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
              El historial arranca cuando se empezó a registrar: lo anterior a eso no está aquí.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

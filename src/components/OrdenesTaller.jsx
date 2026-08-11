import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from './CfdiVista'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const ESTADOS = ['RECIBIDA', 'EN_PROCESO', 'LISTA', 'ENTREGADA', 'CANCELADA']
const BADGE = {
  RECIBIDA: 'badge-EN_TRANSITO',
  EN_PROCESO: 'badge-APARTADO',
  LISTA: 'badge-DISPONIBLE',
  ENTREGADA: 'badge-ENTREGADO',
  CANCELADA: 'badge-CANCELADO',
}
const nombreEmp = (e) => (e ? `${e.nombre} ${e.apellidoPaterno ?? ''}`.trim() : null)

// Órdenes de servicio (fase 5b): el workflow diario del taller — recepción →
// técnico → lista → entregada. La factura NO se captura: el CFDI llega por el
// sync y el derivador liga la orden solo (o con «Ligar CFDI» si no empata).
export default function OrdenesTaller() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [filtro, setFiltro] = useState('ABIERTAS')
  const [q, setQ] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [creando, setCreando] = useState(false)
  const [clientes, setClientes] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [abierta, setAbierta] = useState(null) // orden expandida (detalle/edición)
  const [cfdiVista, setCfdiVista] = useState(null)

  const form0 = { clienteId: '', vin: '', descripcionUnidad: '', placas: '', kilometraje: '', fallaReportada: '', asesorId: '', tecnicoId: '', prometidaAt: '' }
  const [form, setForm] = useState(form0)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const params = new URLSearchParams({ companyId: activeCompany.id })
      if (filtro === 'ABIERTAS') params.set('abiertas', '1')
      else if (filtro !== 'TODAS') params.set('estado', filtro)
      if (busqueda) params.set('q', busqueda)
      setData(await apiFetch(`/api/automotriz/ordenes?${params}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id, filtro, busqueda])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const cargarCatalogos = async () => {
    try {
      const [cs, es] = await Promise.all([
        apiFetch(`/api/automotriz/contactos?companyId=${activeCompany.id}`),
        apiFetch(`/api/automotriz/empleados?companyId=${activeCompany.id}`),
      ])
      setClientes(cs.filter((c) => c.esCliente || !c.esProveedor))
      setEmpleados(es)
    } catch (err) { setError(err.message) }
  }

  const abrirCrear = async () => { setCreando(true); setError(null); await cargarCatalogos() }

  const crear = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiFetch('/api/automotriz/ordenes', {
        method: 'POST',
        body: {
          companyId: activeCompany.id,
          clienteId: form.clienteId || null,
          vin: form.vin.trim() || null,
          descripcionUnidad: form.descripcionUnidad.trim() || null,
          placas: form.placas.trim() || null,
          kilometraje: form.kilometraje ? Number(form.kilometraje) : null,
          fallaReportada: form.fallaReportada.trim(),
          asesorId: form.asesorId || null,
          tecnicoId: form.tecnicoId || null,
          prometidaAt: form.prometidaAt ? new Date(form.prometidaAt).toISOString() : null,
        },
      })
      setForm(form0)
      setCreando(false)
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const accion = async (orden, nombre) => {
    let extra = {}
    if (nombre === 'iniciar' && !orden.tecnico) {
      if (!empleados.length) await cargarCatalogos()
      // sin roster no bloqueamos: inicia sin técnico y se asigna después
    }
    if (nombre === 'cancelar' && !window.confirm(`¿Cancelar la orden #${orden.folio}?`)) return
    if (nombre === 'ligarFactura') {
      const inv = window.prompt('ID de la factura (invoiceId de la venta de servicio derivada):', '')
      if (!inv) return
      extra = { invoiceId: inv.trim() }
    }
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/ordenes/${orden.id}/accion`, { method: 'POST', body: { accion: nombre, ...extra } })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const ordenes = data?.ordenes ?? []
  const n = (e) => data?.porEstado?.[e] ?? 0
  const abiertasN = n('RECIBIDA') + n('EN_PROCESO') + n('LISTA')

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      <div className="head-actions" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={filtro === 'ABIERTAS' ? '' : 'ghost'} onClick={() => setFiltro('ABIERTAS')}>Abiertas · {abiertasN}</button>
        {ESTADOS.map((e) => (
          <button key={e} className={filtro === e ? '' : 'ghost'} onClick={() => setFiltro(e)}>
            {e.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())} · {n(e)}
          </button>
        ))}
        <button className={filtro === 'TODAS' ? '' : 'ghost'} onClick={() => setFiltro('TODAS')}>Todas</button>
        <input placeholder="Folio, VIN, placas, cliente…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220, marginLeft: 'auto' }} />
        <button onClick={() => (creando ? setCreando(false) : abrirCrear())}>{creando ? 'Cerrar' : 'Nueva orden'}</button>
      </div>
      {error && <div className="error">{error}</div>}

      {creando && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Recepción de unidad</h2>
          <form onSubmit={crear} className="inline-form" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))} style={{ minWidth: 220 }}>
              <option value="">Cliente (opcional — mostrador)…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </select>
            <input placeholder="VIN (liga la unidad si existe)" maxLength={17} value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))} style={{ width: 190 }} className="mono" />
            <input required placeholder="Unidad (marca modelo año color)" value={form.descripcionUnidad} onChange={(e) => setForm((f) => ({ ...f, descripcionUnidad: e.target.value }))} style={{ minWidth: 230 }} />
            <input placeholder="Placas" value={form.placas} onChange={(e) => setForm((f) => ({ ...f, placas: e.target.value.toUpperCase() }))} style={{ width: 110 }} />
            <input type="number" min="0" placeholder="Km" value={form.kilometraje} onChange={(e) => setForm((f) => ({ ...f, kilometraje: e.target.value }))} style={{ width: 110 }} />
            <input required placeholder="Falla reportada / trabajo solicitado" value={form.fallaReportada} onChange={(e) => setForm((f) => ({ ...f, fallaReportada: e.target.value }))} style={{ minWidth: 300, flex: 1 }} />
            <select value={form.asesorId} onChange={(e) => setForm((f) => ({ ...f, asesorId: e.target.value }))} style={{ minWidth: 170 }}>
              <option value="">Asesor…</option>
              {empleados.map((e2) => <option key={e2.id} value={e2.id}>{nombreEmp(e2)}</option>)}
            </select>
            <select value={form.tecnicoId} onChange={(e) => setForm((f) => ({ ...f, tecnicoId: e.target.value }))} style={{ minWidth: 170 }}>
              <option value="">Técnico…</option>
              {empleados.map((e2) => <option key={e2.id} value={e2.id}>{nombreEmp(e2)}</option>)}
            </select>
            <label className="muted" style={{ fontSize: 12 }}>Promesa:{' '}
              <input type="date" value={form.prometidaAt} onChange={(e) => setForm((f) => ({ ...f, prometidaAt: e.target.value }))} />
            </label>
            <button type="submit" disabled={busy}>Recibir unidad</button>
          </form>
          <p className="muted" style={{ fontSize: 12 }}>La factura del cierre NO se captura: cuando el CFDI se emita, el sync la liga solo a esta orden (por VIN o cliente).</p>
        </section>
      )}

      <table>
        <thead><tr><th>#</th><th>Unidad</th><th>Cliente</th><th>Falla / trabajo</th><th>Técnico</th><th>Estado</th><th>Promesa</th><th>Factura</th><th>Acciones</th></tr></thead>
        <tbody>
          {ordenes.map((o) => (
            <OrdenRow key={o.id} o={o} busy={busy} accion={accion}
              abierta={abierta === o.id} onToggle={() => setAbierta(abierta === o.id ? null : o.id)}
              onVerCfdi={setCfdiVista} onRefrescar={cargar} empleados={empleados} cargarCatalogos={cargarCatalogos} />
          ))}
          {ordenes.length === 0 && <tr><td colSpan={9} className="muted">Sin órdenes{filtro !== 'TODAS' ? ' con este filtro' : ' aún — recibe la primera unidad'}.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function OrdenRow({ o, busy, accion, abierta, onToggle, onVerCfdi, onRefrescar, empleados, cargarCatalogos }) {
  const vencida = o.prometidaAt && !o.entregadaAt && new Date(o.prometidaAt) < new Date() && (o.estado === 'RECIBIDA' || o.estado === 'EN_PROCESO')
  const btn = { padding: '2px 10px', fontSize: 12 }
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td className="mono">{o.folio}</td>
        <td>
          {o.vehiculo
            ? <Link to={`/vehiculos/${o.vehiculo.id}`} onClick={(e) => e.stopPropagation()}>{o.vehiculo.marca} {o.vehiculo.modelo} {o.vehiculo.anio}</Link>
            : (o.descripcionUnidad ?? '—')}
          {o.vin && <div className="mono muted" style={{ fontSize: 10 }}>{o.vin}{o.placas ? ` · ${o.placas}` : ''}</div>}
        </td>
        <td>{o.cliente ? <Link to={`/contactos/${o.cliente.id}`} onClick={(e) => e.stopPropagation()}>{o.cliente.razonSocial}</Link> : <span className="muted">Mostrador</span>}</td>
        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.fallaReportada}>{o.fallaReportada}</td>
        <td>{nombreEmp(o.tecnico) ?? <span className="muted">—</span>}</td>
        <td><span className={`badge ${BADGE[o.estado]}`}>{o.estado.replace('_', ' ')}</span></td>
        <td className={vencida ? 'neg' : ''}>{fecha(o.prometidaAt)}</td>
        <td>
          {o.servicioVenta
            ? <button className="ghost" style={btn} onClick={(e) => { e.stopPropagation(); onVerCfdi(o.servicioVenta.invoiceId) }}>{mxn(o.servicioVenta.total)}</button>
            : <span className="muted">—</span>}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="head-actions" style={{ gap: 4 }}>
            {o.estado === 'RECIBIDA' && <button style={btn} disabled={busy} onClick={() => accion(o, 'iniciar')}>Iniciar</button>}
            {o.estado === 'EN_PROCESO' && <button className="success" style={btn} disabled={busy} onClick={() => accion(o, 'terminar')}>Terminar</button>}
            {o.estado === 'LISTA' && <button style={btn} disabled={busy} onClick={() => accion(o, 'entregar')}>Entregar</button>}
            {o.estado === 'LISTA' && !o.servicioVenta && <button className="ghost" style={btn} disabled={busy} onClick={() => accion(o, 'ligarFactura')}>Ligar CFDI</button>}
            {(o.estado === 'RECIBIDA' || o.estado === 'EN_PROCESO') && <button className="ghost" style={btn} disabled={busy} onClick={() => accion(o, 'cancelar')}>Cancelar</button>}
          </div>
        </td>
      </tr>
      {abierta && <tr><td colSpan={9} style={{ background: 'var(--panel-2, rgba(0,0,0,0.03))' }}>
        <OrdenDetalle o={o} onRefrescar={onRefrescar} empleados={empleados} cargarCatalogos={cargarCatalogos} />
      </td></tr>}
    </>
  )
}

// Detalle expandido: diagnóstico + presupuesto (líneas). Se edita en sitio y
// guarda con PATCH (reemplaza las líneas completas — es un presupuesto corto).
function OrdenDetalle({ o, onRefrescar, empleados, cargarCatalogos }) {
  const [diagnostico, setDiagnostico] = useState(o.diagnostico ?? '')
  const [tecnicoId, setTecnicoId] = useState(o.tecnico?.id ?? '')
  const [lineas, setLineas] = useState(o.lineas?.map((l) => ({ tipo: l.tipo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario })) ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cerrada = o.estado === 'ENTREGADA' || o.estado === 'CANCELADA'

  useEffect(() => { if (!empleados.length && !cerrada) cargarCatalogos() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0)
  const setLinea = (i, campo, valor) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const guardar = async () => {
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/ordenes/${o.id}`, {
        method: 'PATCH',
        body: {
          diagnostico: diagnostico.trim() || null,
          tecnicoId: tecnicoId || null,
          lineas: lineas
            .filter((l) => l.descripcion.trim())
            .map((l) => ({ tipo: l.tipo, descripcion: l.descripcion.trim(), cantidad: Number(l.cantidad) || 1, precioUnitario: Number(l.precioUnitario) || 0 })),
        },
      })
      await onRefrescar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '10px 6px', display: 'grid', gap: 10 }}>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <span className="muted">Recibida {fecha(o.recibidaAt)}{o.asesor ? ` · asesor ${nombreEmp(o.asesor)}` : ''}{o.kilometraje ? ` · ${o.kilometraje.toLocaleString('es-MX')} km` : ''}</span>
        {o.servicioVenta && <span>Facturada: <b>{mxn(o.servicioVenta.total)}</b> el {fecha(o.servicioVenta.fecha)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <textarea rows={2} placeholder="Diagnóstico del técnico…" value={diagnostico} disabled={cerrada}
          onChange={(e) => setDiagnostico(e.target.value)} style={{ flex: 1, minWidth: 280 }} />
        <select value={tecnicoId} disabled={cerrada} onChange={(e) => setTecnicoId(e.target.value)} style={{ minWidth: 170 }}>
          <option value="">Técnico…</option>
          {empleados.map((e2) => <option key={e2.id} value={e2.id}>{nombreEmp(e2)}</option>)}
        </select>
      </div>
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>Tipo</th><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unitario</th><th className="num">Importe</th><th /></tr></thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td>
                <select value={l.tipo} disabled={cerrada} onChange={(e) => setLinea(i, 'tipo', e.target.value)}>
                  <option value="MANO_OBRA">Mano de obra</option>
                  <option value="REFACCION">Refacción</option>
                </select>
              </td>
              <td><input value={l.descripcion} disabled={cerrada} onChange={(e) => setLinea(i, 'descripcion', e.target.value)} style={{ width: '100%' }} /></td>
              <td className="num"><input type="number" min="0" step="0.01" value={l.cantidad} disabled={cerrada} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} style={{ width: 70 }} /></td>
              <td className="num"><input type="number" min="0" step="0.01" value={l.precioUnitario} disabled={cerrada} onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)} style={{ width: 110 }} /></td>
              <td className="num">{mxn((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}</td>
              <td>{!cerrada && <button className="ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
          {lineas.length === 0 && <tr><td colSpan={6} className="muted">Sin presupuesto — agrega mano de obra y refacciones.</td></tr>}
        </tbody>
      </table>
      <div className="head-actions" style={{ gap: 8 }}>
        {!cerrada && (
          <>
            <button className="ghost" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setLineas((ls) => [...ls, { tipo: 'MANO_OBRA', descripcion: '', cantidad: 1, precioUnitario: 0 }])}>+ Mano de obra</button>
            <button className="ghost" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setLineas((ls) => [...ls, { tipo: 'REFACCION', descripcion: '', cantidad: 1, precioUnitario: 0 }])}>+ Refacción</button>
            <button disabled={busy} style={{ padding: '4px 14px', fontSize: 12 }} onClick={guardar}>Guardar</button>
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>Presupuesto: <b>{mxn(total)}</b> <span className="muted">(sin IVA — el importe fiscal es el del CFDI)</span></span>
      </div>
    </div>
  )
}

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
const titulo = (e) => e.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
// Botón dentro de fila de tabla — medida del mockup (3px 9px / 11.5px / radio 6px).
const BTN_FILA = { padding: '3px 9px', fontSize: 11.5, borderRadius: 6, whiteSpace: 'nowrap' }

// Píldora conmutable de la barra de filtros (§6 «Filtros conmutables»).
function Filtro({ activo, onClick, children }) {
  return (
    <span role="button" tabIndex={0} aria-pressed={activo}
      className={`filtro${activo ? ' activo' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}>
      {children}
    </span>
  )
}

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
      <div className="head-actions" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        <Filtro activo={filtro === 'ABIERTAS'} onClick={() => setFiltro('ABIERTAS')}>Abiertas · {abiertasN}</Filtro>
        {ESTADOS.map((e) => (
          <Filtro key={e} activo={filtro === e} onClick={() => setFiltro(e)}>{titulo(e)} · {n(e)}</Filtro>
        ))}
        <Filtro activo={filtro === 'TODAS'} onClick={() => setFiltro('TODAS')}>Todas</Filtro>
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
            <label>Promesa
              <input type="date" value={form.prometidaAt} onChange={(e) => setForm((f) => ({ ...f, prometidaAt: e.target.value }))} />
            </label>
            <button type="submit" disabled={busy}>Recibir unidad</button>
          </form>
          <div className="card-note">La factura del cierre no se captura: cuando el CFDI se emita, el sync lo liga solo a esta orden por VIN o cliente. Si no empata, «Ligar CFDI» lo hace a mano.</div>
        </section>
      )}

      <table>
        <thead><tr><th>#</th><th>Unidad</th><th>Cliente</th><th>Falla / trabajo</th><th>Técnico</th><th>Estado</th><th>Promesa</th><th className="num">Factura</th><th>Acciones</th></tr></thead>
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
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td className="mono">{o.folio}</td>
        <td>
          {o.vehiculo
            ? <Link to={`/vehiculos/${o.vehiculo.id}`} onClick={(e) => e.stopPropagation()}>{o.vehiculo.marca} {o.vehiculo.modelo} {o.vehiculo.anio}</Link>
            : (o.descripcionUnidad ?? '—')}
          {o.vin && <div className="mono" style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2 }}>{o.vin}{o.placas ? ` · ${o.placas}` : ''}</div>}
        </td>
        <td style={{ color: 'var(--ink-3)' }}>{o.cliente ? <Link to={`/contactos/${o.cliente.id}`} onClick={(e) => e.stopPropagation()}>{o.cliente.razonSocial}</Link> : <span className="muted">Mostrador</span>}</td>
        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.fallaReportada}>{o.fallaReportada}</td>
        <td style={{ color: 'var(--ink-3)' }}>{nombreEmp(o.tecnico) ?? <span className="muted">—</span>}</td>
        <td><span className={`badge ${BADGE[o.estado]}`} style={{ whiteSpace: 'nowrap' }}>{o.estado.replace('_', ' ')}</span></td>
        <td className={vencida ? 'neg' : ''} style={{ whiteSpace: 'nowrap' }}>{fecha(o.prometidaAt)}</td>
        <td className="num">
          {o.servicioVenta
            ? <button className="ghost" style={BTN_FILA} onClick={(e) => { e.stopPropagation(); onVerCfdi(o.servicioVenta.invoiceId) }}>{mxn(o.servicioVenta.total)}</button>
            : <span className="muted">—</span>}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 5 }}>
            {o.estado === 'RECIBIDA' && <button style={BTN_FILA} disabled={busy} onClick={() => accion(o, 'iniciar')}>Iniciar</button>}
            {o.estado === 'EN_PROCESO' && <button style={BTN_FILA} disabled={busy} onClick={() => accion(o, 'terminar')}>Terminar</button>}
            {o.estado === 'LISTA' && <button style={BTN_FILA} disabled={busy} onClick={() => accion(o, 'entregar')}>Entregar</button>}
            {o.estado === 'LISTA' && !o.servicioVenta && <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => accion(o, 'ligarFactura')}>Ligar CFDI</button>}
            {(o.estado === 'RECIBIDA' || o.estado === 'EN_PROCESO') && <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => accion(o, 'cancelar')}>Cancelar</button>}
          </div>
        </td>
      </tr>
      {abierta && <tr><td colSpan={9} style={{ background: 'var(--surface-subtle)', padding: '18px 20px' }}>
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

  const importe = (l) => (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0)
  const totalMO = lineas.filter((l) => l.tipo === 'MANO_OBRA').reduce((s, l) => s + importe(l), 0)
  const totalRef = lineas.filter((l) => l.tipo === 'REFACCION').reduce((s, l) => s + importe(l), 0)
  const total = totalMO + totalRef
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
    <div style={{ display: 'grid', gap: 12 }}>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>Orden <span className="mono" style={{ fontSize: 16 }}>{o.folio}</span></span>
        <span className={`badge ${BADGE[o.estado]}`}>{o.estado.replace('_', ' ')}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          Recibida {fecha(o.recibidaAt)}{o.asesor ? ` · asesor ${nombreEmp(o.asesor)}` : ''}{o.kilometraje ? ` · ${o.kilometraje.toLocaleString('es-MX')} km` : ''}{o.prometidaAt ? ` · promesa ${fecha(o.prometidaAt)}` : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 1fr)', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Falla reportada</div>
          <div style={{ fontSize: 12.5, marginBottom: 14 }}>{o.fallaReportada}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Diagnóstico del técnico</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
            <textarea rows={2} placeholder="Diagnóstico del técnico…" value={diagnostico} disabled={cerrada}
              onChange={(e) => setDiagnostico(e.target.value)} style={{ flex: 1, minWidth: 280, color: 'var(--ink-2)', lineHeight: 1.5 }} />
            <select value={tecnicoId} disabled={cerrada} onChange={(e) => setTecnicoId(e.target.value)} style={{ minWidth: 170, width: 'auto' }}>
              <option value="">Técnico…</option>
              {empleados.map((e2) => <option key={e2.id} value={e2.id}>{nombreEmp(e2)}</option>)}
            </select>
          </div>
          <table>
            <thead><tr><th>Tipo</th><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unitario</th><th className="num">Importe</th><th /></tr></thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td>
                    {cerrada
                      ? <span className={`badge ${l.tipo === 'MANO_OBRA' ? 'badge-info' : 'badge-neutral'}`}>{l.tipo === 'MANO_OBRA' ? 'Mano de obra' : 'Refacción'}</span>
                      : (
                        <select value={l.tipo} onChange={(e) => setLinea(i, 'tipo', e.target.value)} style={{ width: 'auto' }}>
                          <option value="MANO_OBRA">Mano de obra</option>
                          <option value="REFACCION">Refacción</option>
                        </select>
                      )}
                  </td>
                  <td><input value={l.descripcion} disabled={cerrada} onChange={(e) => setLinea(i, 'descripcion', e.target.value)} style={{ width: '100%' }} /></td>
                  <td className="num"><input type="number" min="0" step="0.01" value={l.cantidad} disabled={cerrada} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" min="0" step="0.01" value={l.precioUnitario} disabled={cerrada} onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)} style={{ width: 110, textAlign: 'right' }} /></td>
                  <td className="num">{mxn(importe(l))}</td>
                  <td>{!cerrada && <button className="ghost" style={BTN_FILA} onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              ))}
              {lineas.length === 0 && <tr><td colSpan={6} className="muted">Sin presupuesto — agrega mano de obra y refacciones.</td></tr>}
            </tbody>
          </table>
          {!cerrada && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="ghost" style={{ fontSize: 12 }} onClick={() => setLineas((ls) => [...ls, { tipo: 'MANO_OBRA', descripcion: '', cantidad: 1, precioUnitario: 0 }])}>+ Mano de obra</button>
              <button className="ghost" style={{ fontSize: 12 }} onClick={() => setLineas((ls) => [...ls, { tipo: 'REFACCION', descripcion: '', cantidad: 1, precioUnitario: 0 }])}>+ Refacción</button>
              <button disabled={busy} style={{ padding: '6px 13px', fontSize: 12 }} onClick={guardar}>Guardar</button>
            </div>
          )}
        </div>
        <div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span className="muted">Mano de obra</span><span className="tnum">{mxn(totalMO)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span className="muted">Refacciones</span><span className="tnum">{mxn(totalRef)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--surface-hover)', paddingTop: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Presupuesto</span>
              <span className="tnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em' }}>{mxn(total)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>sin IVA — el importe fiscal es el del CFDI</div>
          </div>
          {o.servicioVenta && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              Facturada: <b className="tnum">{mxn(o.servicioVenta.total)}</b> el {fecha(o.servicioVenta.fecha)}
            </div>
          )}
          <div className="card-note" style={{ marginTop: 12 }}>
            La factura del cierre no se captura: cuando el CFDI se emita, el sync del SAT lo liga solo a esta orden por VIN o cliente. Si no empata, «Ligar CFDI» lo hace a mano.
          </div>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from './CfdiVista'
import { LineaProceso } from './Primitivos'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const fechaHora = (d) => (d
  ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—')

const ESTADOS = ['RECIBIDA', 'EN_PROCESO', 'LISTA', 'ENTREGADA', 'CANCELADA']

// El color marca lo que pide acción y nada más (DESIGN §2): en proceso avisa,
// entregada y cancelada no dicen nada porque ya no hay nada que hacer.
const TONO = {
  RECIBIDA: 'neutro', EN_PROCESO: 'warn', LISTA: 'pos', ENTREGADA: 'neutro', CANCELADA: 'neutro',
}

// Una promesa está vencida si pasó la fecha y la unidad sigue adentro. Se
// mide contra el ESTADO, no contra entregadaAt: una orden LISTA ya cumplió el
// trabajo aunque no se haya entregado.
// Los cuatro sellos de la orden. `actual` es la etapa en la que está parada;
// lo anterior queda «hecho» y lo que sigue «pendiente». Cancelada no avanza.
function pasosDe(o) {
  const orden = ['RECIBIDA', 'EN_PROCESO', 'LISTA', 'ENTREGADA']
  const sellos = [o.recibidaAt, o.enProcesoAt, o.listaAt, o.entregadaAt]
  const etiquetas = ['Recibida', 'En proceso', 'Lista', 'Entregada']
  const aqui = o.estado === 'CANCELADA' ? -1 : orden.indexOf(o.estado)
  return etiquetas.map((etiqueta, i) => ({
    etiqueta,
    estado: aqui === -1 ? 'pendiente' : i < aqui ? 'hecho' : i === aqui ? 'actual' : 'pendiente',
    nota: sellos[i] ? fechaHora(sellos[i]) : '—',
  }))
}

function presupuestoDe(o) {
  return (o.lineas ?? []).reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0)
}

function esVencida(o) {
  return Boolean(
    o.prometidaAt && new Date(o.prometidaAt) < new Date() &&
    (o.estado === 'RECIBIDA' || o.estado === 'EN_PROCESO')
  )
}
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
    <button type="button" aria-pressed={activo}
      className={`filtro${activo ? ' activo' : ''}`}
      onClick={onClick}>
      {children}
    </button>
  )
}

// Órdenes de servicio (fase 5b): el workflow diario del taller — recepción →
// técnico → lista → entregada. La factura NO se captura: el CFDI llega por el
// sync y el derivador liga la orden solo (o con «Ligar CFDI» si no empata).
export default function OrdenesTaller() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  // La paleta de comandos abre /servicio?q=<folio>. Dos cosas hay que sembrar,
  // no una: el texto Y el filtro. Con el filtro en «Abiertas» —el default—
  // buscar el folio de una orden ya cerrada caería en una lista vacía, que es
  // justo el resultado que hace desconfiar de un buscador.
  const [params] = useSearchParams()
  const qInicial = params.get('q') ?? ''
  const [filtro, setFiltro] = useState(qInicial ? 'TODAS' : 'ABIERTAS')
  const [q, setQ] = useState(qInicial)
  const [busqueda, setBusqueda] = useState(qInicial)
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
      // El satélite y el hub se despliegan por separado: si un día el catálogo
      // deja de venir como arreglo, esto se cae con «filter is not a function»
      // en la cara del usuario. Con la guarda queda una lista vacía, que es lo
      // que el formulario ya sabe manejar.
      setClientes(Array.isArray(cs) ? cs.filter((c) => c.esCliente || !c.esProveedor) : [])
      setEmpleados(Array.isArray(es) ? es : [])
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
  // El importe por estado lo suma el hub sobre TODAS las órdenes; no se puede
  // derivar de `ordenes`, que viene filtrada y cortada a 200.
  const montoDe = (estados) => estados.reduce((a, e) => a + (data?.montoPorEstado?.[e] ?? 0), 0)
  // Promesa vencida: prometida en el pasado y la unidad todavía no sale.
  const vencidasN = (data?.ordenes ?? []).filter(esVencida).length
  const totalEnVista = ordenes.reduce((a, o) => a + presupuestoDe(o), 0)
  const vencidasEnVista = ordenes.filter(esVencida).length

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      {/* Renglón de situación: lo que un jefe de taller pregunta al llegar.
          Las bahías NO van —no hay modelo de bahías, y ponerlas inventadas
          sería peor que no ponerlas—. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="glosa">
          {abiertasN} {abiertasN === 1 ? 'orden abierta' : 'órdenes abiertas'}
          {vencidasN > 0 && (
            <> · <span style={{ color: 'var(--neg)' }}>
              {vencidasN} {vencidasN === 1 ? 'promesa vencida' : 'promesas vencidas'}
            </span></>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Folio, VIN, placas, cliente…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <button onClick={() => (creando ? setCreando(false) : abrirCrear())}>{creando ? 'Cerrar' : 'Nueva recepción'}</button>
        </div>
      </div>

      {/* Tira de estados: cuántas órdenes y cuánto dinero detiene cada una.
          Son filtros —se tocan—. «Abiertas» es la suma de las tres primeras. */}
      <div className="tira-estados">
        <button type="button"
          className={`estado-tarjeta${filtro === 'ABIERTAS' ? ' activo' : ''}`}
          onClick={() => setFiltro('ABIERTAS')}>
          <span className="fila"><span className="punto" /><span className="rotulo">Abiertas</span></span>
          <span className="cuenta">{abiertasN}</span>
          <span className="monto">{mxn(montoDe(['RECIBIDA', 'EN_PROCESO', 'LISTA']))}</span>
        </button>
        {ESTADOS.map((e) => (
          <button type="button" key={e}
            className={`estado-tarjeta tono-${TONO[e]}${filtro === e ? ' activo' : ''}`}
            onClick={() => setFiltro(e)}>
            <span className="fila"><span className="punto" /><span className="rotulo">{titulo(e)}</span></span>
            <span className="cuenta">{n(e)}</span>
            <span className="monto">{mxn(montoDe([e]))}</span>
          </button>
        ))}
        <button type="button"
          className={`estado-tarjeta${filtro === 'TODAS' ? ' activo' : ''}`}
          onClick={() => setFiltro('TODAS')}>
          <span className="fila"><span className="punto" /><span className="rotulo">Todas</span></span>
          <span className="cuenta">{ESTADOS.reduce((a, e) => a + n(e), 0)}</span>
          <span className="monto">del ejercicio</span>
        </button>
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

      <table className="tabla">
        <thead><tr>
          <th>Folio</th><th>Unidad</th><th>Cliente</th><th>Trabajo</th><th>Técnico</th>
          <th>Estado</th><th>Promesa</th><th className="num">Presupuesto</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          {ordenes.map((o) => (
            <OrdenRow key={o.id} o={o} busy={busy} accion={accion}
              abierta={abierta === o.id} onToggle={() => setAbierta(abierta === o.id ? null : o.id)}
              onVerCfdi={setCfdiVista} onRefrescar={cargar} empleados={empleados} cargarCatalogos={cargarCatalogos} />
          ))}
          {ordenes.length === 0 && (
            <tr><td colSpan={9} className="muted">
              {filtro === 'TODAS' || filtro === 'ABIERTAS'
                ? 'Todavía no se ha recibido ninguna unidad en el taller.'
                : 'Sin órdenes con este filtro.'}
            </td></tr>
          )}
        </tbody>
        {ordenes.length > 0 && (
          <tfoot>
            <tr>
              <td className="alcance">
                {ordenes.length} orden{ordenes.length === 1 ? '' : 'es'}
                {ordenes.length === 200 ? ' (tope de la vista)' : ''}
              </td>
              <td /><td /><td /><td /><td />
              <td style={{ color: vencidasEnVista > 0 ? 'var(--neg)' : undefined }}>
                {vencidasEnVista > 0 ? `${vencidasEnVista} vencida${vencidasEnVista === 1 ? '' : 's'}` : ''}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>{mxn(totalEnVista)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function OrdenRow({ o, busy, accion, abierta, onToggle, onVerCfdi, onRefrescar, empleados, cargarCatalogos }) {
  const vencida = esVencida(o)
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }} className={vencida ? 'vencida' : undefined}>
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
        {/* Cuando el CFDI existe manda él: es lo que de verdad se cobró.
            Hasta entonces vale el presupuesto de las líneas. Nunca los dos,
            porque puestos juntos se leen como dos cargos. */}
        <td className="num">
          {o.servicioVenta
            ? <button className="ghost" style={BTN_FILA} title="Total facturado — abre el CFDI"
                onClick={(e) => { e.stopPropagation(); onVerCfdi(o.servicioVenta.invoiceId) }}>
                {mxn(o.servicioVenta.total)}
              </button>
            : presupuestoDe(o) > 0
              ? mxn(presupuestoDe(o))
              : <span className="muted">sin presupuesto</span>}
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
        <span className="muted" style={{ fontSize: 12 }}>recibida {fechaHora(o.recibidaAt)}</span>
        {o.prometidaAt && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: esVencida(o) ? 'var(--neg)' : 'var(--ink2)' }}>
            promesa {fecha(o.prometidaAt)}
          </span>
        )}
      </div>

      {/* Los datos de recepción, en rejilla. La BAHÍA que pide el handoff no
          va: no hay modelo de bahías y dibujarla inventada sería peor. */}
      <div className="meta-orden">
        <div><span className="k">Cliente</span><span className="v">{o.cliente?.razonSocial ?? 'Mostrador'}</span></div>
        <div><span className="k">Unidad</span><span className="v">
          {o.vehiculo ? `${o.vehiculo.marca} ${o.vehiculo.modelo} ${o.vehiculo.anio}` : (o.descripcionUnidad ?? '—')}
        </span></div>
        <div><span className="k">VIN</span><span className="v mono">{o.vin ?? '—'}</span></div>
        <div><span className="k">Placas</span><span className="v mono">{o.placas ?? '—'}</span></div>
        <div><span className="k">Kilometraje</span><span className="v">
          {o.kilometraje != null ? `${o.kilometraje.toLocaleString('es-MX')} km` : '—'}
        </span></div>
        <div><span className="k">Asesor</span><span className="v">{nombreEmp(o.asesor) ?? '—'}</span></div>
      </div>

      {/* Dónde va la orden. Los cuatro sellos existen en el modelo, así que la
          línea se dibuja con horas reales y no con etapas de adorno. */}
      <div style={{ maxWidth: 520, margin: '4px 0 8px' }}>
        <LineaProceso pasos={pasosDe(o)} />
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

          {/* ── Lo que el tablero todavía no puede contestar ─────────────────
              El handoff dibuja cuatro cosas más en esta pantalla y ninguna
              tiene dónde vivir. Se enumeran en vez de dibujarlas con datos
              falsos: así se sabe qué pedirle al modelo, y no parece que el
              tablero ya lo cubra todo. */}
          <div className="card-note" style={{ marginTop: 12, lineHeight: 1.55 }}>
            <b style={{ color: 'var(--ink)' }}>Lo que este tablero todavía no contesta.</b>{' '}
            <b>Surtido de cada refacción</b> — la línea sabe qué pieza es, no si ya se entregó al
            técnico; sin eso no hay estado «espera refacción», que en el handoff es un bucket propio.{' '}
            <b>Autorización del cliente</b> — no se guarda si autorizó ni cuándo, y es lo que
            legítimamente detiene una orden.{' '}
            <b>Productividad del técnico</b> — la línea de mano de obra no trae horas vendidas, así
            que no hay contra qué comparar las trabajadas.{' '}
            <b>Bahías</b> — no existen como modelo, por eso el encabezado no dice «9 de 12».
          </div>
        </div>
      </div>
    </div>
  )
}

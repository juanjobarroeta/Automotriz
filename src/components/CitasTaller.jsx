import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { useEsMovil } from '../lib/pantalla'

// La agenda del taller: lo que viene (portal o teléfono) antes de ser orden.
// El titular de cada fila es «Recibir» — un tap y la cita se vuelve recepción
// pre-llenada en /servicio/recepcion. Confirmar/cancelar/no-show son la
// compuerta humana de capacidad (R1 no tiene modelo de bahías a propósito).

const fechaHora = (d) => (d
  ? new Date(d).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—')
const dia = (n = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d }

const RANGOS = [['HOY', 'Hoy'], ['MANANA', 'Mañana'], ['SEMANA', '7 días'], ['TODAS', 'Todas']]
const ETIQUETA = { PENDIENTE: 'por confirmar', CONFIRMADA: 'confirmada', CANCELADA: 'cancelada', RECIBIDA: 'recibida', NO_SHOW: 'no llegó' }

export default function CitasTaller() {
  const { activeCompany } = useAuth()
  const navigate = useNavigate()
  const esMovil = useEsMovil()
  const [vista, setVista] = useState('CALENDARIO')
  const [rango, setRango] = useState('SEMANA')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const params = new URLSearchParams({ companyId: activeCompany.id })
      if (rango === 'HOY') { params.set('desde', dia(0).toISOString()); params.set('hasta', dia(1).toISOString()) }
      if (rango === 'MANANA') { params.set('desde', dia(1).toISOString()); params.set('hasta', dia(2).toISOString()) }
      if (rango === 'SEMANA') { params.set('desde', dia(0).toISOString()); params.set('hasta', dia(7).toISOString()) }
      if (rango !== 'TODAS') params.set('abiertas', '1')
      setData(await apiFetch(`/api/automotriz/citas?${params}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id, rango])

  useEffect(() => { cargar() }, [cargar])

  const accion = async (cita, nombre) => {
    setBusy(cita.id); setError(null)
    try { await apiFetch(`/api/automotriz/citas/${cita.id}/accion`, { method: 'POST', body: { accion: nombre } }); await cargar() }
    catch (err) { setError(err.message) } finally { setBusy(null) }
  }

  const unidadDe = (c) => c.vehiculo
    ? `${c.vehiculo.marca ?? ''} ${c.vehiculo.modelo ?? ''} ${c.vehiculo.anio ?? ''}`.trim()
    : (c.descripcionUnidad || c.vin || 'Unidad por identificar')
  const clienteDe = (c) => c.customer?.razonSocial ?? c.clienteNombre ?? 'Mostrador'
  const pasada = (c) => new Date(c.fecha) < new Date()

  const Acciones = ({ c }) => (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {(c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA') && (
        <button type="button" disabled={busy === c.id}
          onClick={(e) => { e.stopPropagation(); navigate(`/servicio/recepcion?citaId=${c.id}`) }}>
          Recibir
        </button>
      )}
      {c.estado === 'PENDIENTE' && (
        <button type="button" className="ghost" disabled={busy === c.id}
          onClick={(e) => { e.stopPropagation(); accion(c, 'confirmar') }}>Confirmar</button>
      )}
      {(c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA') && (
        <>
          <button type="button" className="ghost" disabled={busy === c.id}
            onClick={(e) => { e.stopPropagation(); accion(c, 'cancelar') }}>Cancelar</button>
          {pasada(c) && (
            <button type="button" className="ghost" disabled={busy === c.id}
              onClick={(e) => { e.stopPropagation(); accion(c, 'no_show') }}>No llegó</button>
          )}
        </>
      )}
      {c.estado === 'RECIBIDA' && c.orden && (
        <button type="button" className="ghost"
          onClick={(e) => { e.stopPropagation(); navigate(`/servicio?q=${c.orden.folio}`) }}>
          OS-{c.orden.folio} · {c.orden.estado.replace('_', ' ')}
        </button>
      )}
    </span>
  )

  const citas = data?.citas ?? []
  const pendientes = data?.porEstado?.PENDIENTE ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="tabs" role="tablist">
          {[['CALENDARIO', 'Calendario'], ['LISTA', 'Lista']].map(([k, etiqueta]) => (
            <button type="button" key={k} role="tab" aria-selected={vista === k}
              className={vista === k ? 'activo' : ''} onClick={() => setVista(k)}>{etiqueta}</button>
          ))}
        </div>
        {vista === 'LISTA' && (
          <div className="tabs" role="tablist">
            {RANGOS.map(([k, etiqueta]) => (
              <button type="button" key={k} role="tab" aria-selected={rango === k}
                className={rango === k ? 'activo' : ''} onClick={() => setRango(k)}>{etiqueta}</button>
            ))}
          </div>
        )}
        {pendientes > 0 && <span className="glosa">{pendientes} por confirmar</span>}
        <button type="button" style={{ marginLeft: 'auto' }} onClick={() => setCreando(true)}>Nueva cita</button>
      </div>

      {vista === 'CALENDARIO' && <CalendarioSemana navigate={navigate} />}

      {vista === 'LISTA' && (<>
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Leyendo la agenda…</p>}

      {data && citas.length === 0 && (
        <p className="muted">Sin citas en este rango. Las del portal del cliente llegan aquí como «por confirmar».</p>
      )}

      {data && citas.length > 0 && (esMovil ? (
        <div className="lista-tarjetas">
          {citas.map((c) => (
            <div key={c.id} className="tarjeta-fila">
              <div className="tf-alto">
                <span className="tf-titulo">{fechaHora(c.fecha)} · {unidadDe(c)}</span>
                <span className="badge">{ETIQUETA[c.estado]}</span>
              </div>
              <div className="tf-bajo">
                <span className="tf-sub" style={{ fontFamily: 'inherit' }}>{clienteDe(c)} · {c.motivo}</span>
              </div>
              <div style={{ marginTop: 8 }}><Acciones c={c} /></div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr><th>Cuándo</th><th>Cliente</th><th>Unidad</th><th>Motivo</th><th>Canal</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {citas.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(c.fecha)}</td>
                  <td>{clienteDe(c)}</td>
                  <td>{unidadDe(c)}{c.vin ? <div className="muted mono" style={{ fontSize: 11 }}>{c.vin}</div> : null}</td>
                  <td style={{ maxWidth: 280 }}>{c.motivo}</td>
                  <td><span className="muted">{c.canal === 'PORTAL' ? 'portal' : 'taller'}</span></td>
                  <td><span className="badge">{ETIQUETA[c.estado]}</span></td>
                  <td><Acciones c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      </>)}

      {creando && <AltaCita onCerrar={() => setCreando(false)} onCreada={() => { setCreando(false); cargar() }} />}
    </div>
  )
}

// ── El calendario del taller: la semana con lo que ENTRA y lo que SALE ──────
// ↓ recepciones = citas (portal o staff) en su hora; ↑ entregas = órdenes
// abiertas en su fecha prometida. Es la cara de agenda del control de
// servicio: quién llega, qué se promete, y arriba —en rojo— lo ya vencido.
// Tocar una cita abierta abre la recepción; tocar una entrega abre su orden.
function CalendarioSemana({ navigate }) {
  const { activeCompany } = useAuth()
  const [inicio, setInicio] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [citas, setCitas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [error, setError] = useState(null)

  const fin = useMemo(() => { const d = new Date(inicio); d.setDate(d.getDate() + 7); return d }, [inicio])

  useEffect(() => {
    if (!activeCompany?.id) return
    setError(null)
    const params = new URLSearchParams({
      companyId: activeCompany.id, desde: inicio.toISOString(), hasta: fin.toISOString(),
    })
    Promise.all([
      apiFetch(`/api/automotriz/citas?${params}`),
      apiFetch(`/api/automotriz/ordenes?companyId=${activeCompany.id}&abiertas=1`),
    ])
      .then(([c, o]) => {
        setCitas((c?.citas ?? []).filter((x) => x.estado !== 'CANCELADA' && x.estado !== 'NO_SHOW'))
        setOrdenes(o?.ordenes ?? [])
      })
      .catch((err) => setError(err.message))
  }, [activeCompany?.id, inicio, fin])

  const hoy0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return d })
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const citasDe = (d) => citas.filter((c) => mismoDia(new Date(c.fecha), d)).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  const entregasDe = (d) => ordenes.filter((o) => o.prometidaAt && mismoDia(new Date(o.prometidaAt), d))
  // Lo vencido no vive en ningún día visible (la ventana arranca hoy): se
  // enseña arriba, en rojo, porque es lo primero que un jefe de taller ataca.
  const vencidas = ordenes.filter((o) => o.prometidaAt && new Date(o.prometidaAt) < hoy0)
  const mover = (n) => setInicio((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x })
  const irHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setInicio(d) }

  const hora = (x) => new Date(x).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const rotuloDia = (d) => d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })
  const unidadCita = (c) => c.customer?.razonSocial ?? c.clienteNombre ?? c.descripcionUnidad ?? c.vin?.slice(-6) ?? 'Mostrador'
  const unidadOrden = (o) => o.vehiculo ? `${o.vehiculo.marca} ${o.vehiculo.modelo}` : (o.descripcionUnidad ?? o.vin?.slice(-6) ?? 'Unidad')

  const abrirCita = (c) => {
    if (c.estado === 'RECIBIDA' && c.orden) navigate(`/servicio?q=${c.orden.folio}`)
    else navigate(`/servicio/recepcion?citaId=${c.id}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" className="ghost" onClick={() => mover(-7)} aria-label="Semana anterior">‹</button>
        <button type="button" className="ghost" onClick={irHoy}>Hoy</button>
        <button type="button" className="ghost" onClick={() => mover(7)} aria-label="Semana siguiente">›</button>
        <span className="glosa">
          {inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — {new Date(fin - 1).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
          {' · '}↓ recepción · ↑ entrega
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      {vencidas.length > 0 && (
        <div className="cal-vencidas">
          <b>{vencidas.length} {vencidas.length === 1 ? 'entrega vencida' : 'entregas vencidas'}:</b>
          {vencidas.slice(0, 8).map((o) => (
            <button type="button" key={o.id} className="cal-chip entrega vencida"
              onClick={() => navigate(`/servicio?q=${o.folio}`)}>
              ↑ OS-{o.folio} · {unidadOrden(o)} · {new Date(o.prometidaAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
            </button>
          ))}
          {vencidas.length > 8 && <span className="muted">y {vencidas.length - 8} más…</span>}
        </div>
      )}

      <div className="cal-semana">
        {dias.map((d) => {
          const cs = citasDe(d)
          const es = entregasDe(d)
          const esHoy = mismoDia(d, new Date())
          return (
            <div key={d.toISOString()} className={`cal-dia${esHoy ? ' hoy' : ''}`}>
              <div className="cal-dia-cab">
                <span>{rotuloDia(d)}</span>
                {(cs.length > 0 || es.length > 0) && (
                  <span className="muted" style={{ fontSize: 10.5 }}>
                    {cs.length > 0 && `↓${cs.length}`}{cs.length > 0 && es.length > 0 && ' '}{es.length > 0 && `↑${es.length}`}
                  </span>
                )}
              </div>
              {cs.map((c) => (
                <button type="button" key={c.id}
                  className={`cal-chip cita ${c.estado === 'PENDIENTE' ? 'pendiente' : c.estado === 'RECIBIDA' ? 'hecha' : ''}`}
                  title={c.motivo}
                  onClick={() => abrirCita(c)}>
                  ↓ {hora(c.fecha)} {unidadCita(c)}
                </button>
              ))}
              {es.map((o) => (
                <button type="button" key={o.id} className="cal-chip entrega" title={o.fallaReportada}
                  onClick={() => navigate(`/servicio?q=${o.folio}`)}>
                  ↑ OS-{o.folio} · {unidadOrden(o)}
                </button>
              ))}
              {cs.length === 0 && es.length === 0 && <span className="cal-vacio">—</span>}
            </div>
          )
        })}
      </div>
      <p className="glosa" style={{ marginTop: 8 }}>
        Cita punteada = por confirmar · sólida = confirmada · tenue = ya recibida. Las entregas salen de la
        promesa de cada orden abierta.
      </p>
    </div>
  )
}

// Cita capturada por el taller (teléfono/mostrador): nace CONFIRMADA — quien
// la anota, la confirma. Cliente del padrón o nombre/teléfono libres.
function AltaCita({ onCerrar, onCreada }) {
  const { activeCompany } = useAuth()
  const [clientes, setClientes] = useState([])
  const [f, setF] = useState({ customerId: '', clienteNombre: '', telefono: '', descripcionUnidad: '', vin: '', fecha: '', hora: '10:00', motivo: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!activeCompany?.id) return
    apiFetch(`/api/automotriz/contactos?companyId=${activeCompany.id}`)
      .then((r) => setClientes(Array.isArray(r) ? r : r?.contactos ?? []))
      .catch(() => {})
  }, [activeCompany?.id])

  const submit = async (e) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      await apiFetch('/api/automotriz/citas', {
        method: 'POST',
        body: {
          companyId: activeCompany.id,
          customerId: f.customerId || null,
          clienteNombre: f.customerId ? null : f.clienteNombre || null,
          telefono: f.customerId ? null : f.telefono || null,
          vin: f.vin || null,
          descripcionUnidad: f.descripcionUnidad || null,
          fecha: new Date(`${f.fecha}T${f.hora}`).toISOString(),
          motivo: f.motivo,
        },
      })
      onCreada()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Nueva cita</h2>
        <div className="grid2">
          <label>Cliente del padrón
            <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">— sin expediente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </select>
          </label>
          {!f.customerId && (
            <label>Nombre (walk-in)
              <input value={f.clienteNombre} onChange={(e) => setF({ ...f, clienteNombre: e.target.value })} placeholder="Quién llamó" />
            </label>
          )}
          {!f.customerId && (
            <label>Teléfono
              <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            </label>
          )}
          <label>Unidad
            <input value={f.descripcionUnidad} onChange={(e) => setF({ ...f, descripcionUnidad: e.target.value })} placeholder="Marca modelo año" />
          </label>
          <label>NIV (si lo dictan)
            <input className="mono" maxLength={17} value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} />
          </label>
          <label>Fecha
            <input required type="date" min={new Date().toISOString().slice(0, 10)} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
          <label>Hora
            <select value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })}>
              {Array.from({ length: 20 }, (_, i) => {
                const h = 8 + Math.floor(i / 2); const m = i % 2 ? '30' : '00'
                return <option key={i} value={`${String(h).padStart(2, '0')}:${m}`}>{`${String(h).padStart(2, '0')}:${m}`}</option>
              })}
            </select>
          </label>
        </div>
        <label>Motivo
          <textarea required rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Servicio de 10,000 km / ruido en suspensión…" />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCerrar}>Cancelar</button>
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Agendar'}</button>
        </div>
      </form>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
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
          {RANGOS.map(([k, etiqueta]) => (
            <button type="button" key={k} role="tab" aria-selected={rango === k}
              className={rango === k ? 'activo' : ''} onClick={() => setRango(k)}>{etiqueta}</button>
          ))}
        </div>
        {pendientes > 0 && <span className="glosa">{pendientes} por confirmar</span>}
        <button type="button" style={{ marginLeft: 'auto' }} onClick={() => setCreando(true)}>Nueva cita</button>
      </div>

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

      {creando && <AltaCita onCerrar={() => setCreando(false)} onCreada={() => { setCreando(false); cargar() }} />}
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

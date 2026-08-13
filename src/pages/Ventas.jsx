import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const nombreEmp = (e) => (e ? `${e.nombre} ${e.apellidoPaterno ?? ''}`.trim() : null)

const ESTADOS = ['NUEVO', 'CONTACTADO', 'CITA', 'DEMO', 'NEGOCIACION', 'GANADO', 'PERDIDO']
const SIGUIENTE = { NUEVO: 'CONTACTADO', CONTACTADO: 'CITA', CITA: 'DEMO', DEMO: 'NEGOCIACION', NEGOCIACION: 'GANADO' }
// Etiqueta legible del estado: los chips nunca van en mayúsculas forzadas.
const ETIQUETA = {
  NUEVO: 'Nuevo', CONTACTADO: 'Contactado', CITA: 'Cita', DEMO: 'Demo',
  NEGOCIACION: 'Negociación', GANADO: 'Ganado', PERDIDO: 'Perdido',
}
const BADGE = {
  NUEVO: 'badge-info', CONTACTADO: 'badge-info', CITA: 'badge-warn',
  DEMO: 'badge-warn', NEGOCIACION: 'badge-ok', GANADO: 'badge-neutral', PERDIDO: 'badge-danger',
}
const MEDIOS = ['PISO', 'TELEFONO', 'DIGITAL', 'REFERIDO', 'OTRO']

// Botón de acción dentro de una fila (medidas del mockup: 3px 9px / 11.5px / radio 6px).
const BTN_FILA = { padding: '3px 9px', fontSize: 11.5, borderRadius: 6 }
const NOTA = { marginTop: 12, fontSize: 12, lineHeight: 1.5 }

// Ventas y CRM (fase 2): dos caras —
//   Pipeline: el registro de guardia y el avance de prospectos.
//   WhatsApp: la cola de mensajes del día (fase 2b) — seguimientos vencidos y
//   clientes de taller que dejaron de venir, con el mensaje ya escrito y su
//   link wa.me. Sin API de Meta: el asesor da clic y decide enviar.
export default function Ventas() {
  const [tab, setTab] = useState('PIPELINE')

  // El encabezado (h1 + glosa + tabs segmentados) es común a las dos vistas; la
  // vista activa le entrega su acción principal para que viva a la derecha.
  const encabezado = (acciones = null) => (
    <header className="page-head">
      <h1>Ventas y CRM</h1>
      <span className="glosa">
        {tab === 'PIPELINE'
          ? 'el piso, el teléfono y el seguimiento de cada prospecto'
          : 'la cola del día con el mensaje ya escrito — el asesor decide si lo envía'}
      </span>
      <div className="tabs" style={{ alignSelf: 'center' }}>
        <span className={tab === 'PIPELINE' ? 'activo' : ''} onClick={() => setTab('PIPELINE')}>Pipeline</span>
        <span className={tab === 'WHATSAPP' ? 'activo' : ''} onClick={() => setTab('WHATSAPP')}>WhatsApp</span>
      </div>
      <div className="head-actions">{acciones}</div>
    </header>
  )

  return tab === 'PIPELINE' ? <Pipeline encabezado={encabezado} /> : <ColaWhatsApp encabezado={encabezado} />
}

function ColaWhatsApp({ encabezado }) {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try { setData(await apiFetch(`/api/automotriz/whatsapp?companyId=${activeCompany.id}`)) }
    catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const reprogramar = async (prospectoId, dias) => {
    setBusy(true); setError(null)
    try {
      const f = new Date()
      f.setDate(f.getDate() + dias)
      await apiFetch(`/api/automotriz/prospectos/${prospectoId}`, { method: 'PATCH', body: { proximaAccion: f.toISOString() } })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const copiar = async (mensaje) => {
    try { await navigator.clipboard.writeText(mensaje) } catch { /* http o permisos: el link wa.me sigue funcionando */ }
  }

  const fechaCorta = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

  if (error) return <div>{encabezado()}<div className="error">{error}</div></div>
  if (!data) return <div>{encabezado()}<p className="muted">Componiendo la cola del día…</p></div>

  const sinTelefono = data.sinTelefono.crm + data.sinTelefono.servicio

  const Fila = ({ item, acciones }) => (
    <tr>
      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {item.nombre}
        <div className="mono faint" style={{ marginTop: 2 }}>{item.telefono}</div>
      </td>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.mensaje}</div>
        {item.nota && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>Nota: {item.nota}</div>}
      </td>
      <td className="neg" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {item.tipo === 'CRM' ? `venció ${fechaCorta(item.vencidaDesde)}` : `última visita ${fechaCorta(item.ultimaVisita)}`}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <a href={item.link} target="_blank" rel="noreferrer">
            <button style={BTN_FILA} onClick={() => copiar(item.mensaje)}>Abrir WhatsApp</button>
          </a>
          {acciones}
        </div>
      </td>
    </tr>
  )

  return (
    <div>
      {encabezado()}

      <div className="kpi-strip">
        <div className="kpi-item">
          <span className="kpi-label">Mensajes en cola</span>
          <span className="kpi">{data.total}</span>
          <span className="kpi-sub">CRM {data.crm.length} · taller {data.servicio.length}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Sin teléfono</span>
          <span className={`kpi ${sinTelefono > 0 ? 'neg' : ''}`}>{sinTelefono}</span>
          <span className="kpi-sub">candidatos fuera de la cola — captura el teléfono</span>
        </div>
      </div>

      <h2 style={{ marginBottom: 10 }}>Seguimientos vencidos (CRM)</h2>
      <table>
        <thead><tr><th>Prospecto</th><th>Mensaje</th><th>Vencido</th><th>Acciones</th></tr></thead>
        <tbody>
          {data.crm.map((i) => (
            <Fila key={i.prospectoId} item={i} acciones={
              <>
                <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => reprogramar(i.prospectoId, 3)}>+3d</button>
                <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => reprogramar(i.prospectoId, 7)}>+7d</button>
              </>
            } />
          ))}
          {data.crm.length === 0 && <tr><td colSpan={4} className="muted">Sin seguimientos vencidos con teléfono — al día.</td></tr>}
        </tbody>
      </table>
      <p className="faint" style={NOTA}>
        «Abrir WhatsApp» copia el mensaje y abre el chat con el texto listo; al enviarlo, reprograma el seguimiento (+3d/+7d).
      </p>

      <h2 style={{ margin: '26px 0 10px' }}>Taller — dejaron de venir</h2>
      <table>
        <thead><tr><th>Cliente</th><th>Mensaje</th><th>Última visita</th><th>Acciones</th></tr></thead>
        <tbody>
          {data.servicio.map((i) => <Fila key={i.clienteId} item={i} acciones={null} />)}
          {data.servicio.length === 0 && <tr><td colSpan={4} className="muted">Nadie con ≥2 servicios lleva más de 6 meses sin venir (o falta teléfono).</td></tr>}
        </tbody>
      </table>
      <p className="faint" style={NOTA}>Salen de esta lista solos cuando su siguiente CFDI de servicio entra por el sync.</p>
    </div>
  )
}

function Pipeline({ encabezado }) {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [filtro, setFiltro] = useState('ABIERTOS')
  const [q, setQ] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [creando, setCreando] = useState(false)
  const [empleados, setEmpleados] = useState([])
  const [clientes, setClientes] = useState([])

  const form0 = { nombre: '', telefono: '', medio: 'PISO', interes: '', vendedorId: '', proximaAccion: '', proximaNota: '' }
  const [form, setForm] = useState(form0)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const params = new URLSearchParams({ companyId: activeCompany.id })
      if (filtro === 'VENCIDOS') params.set('vencidos', '1')
      else if (filtro !== 'TODOS') params.set('estado', filtro)
      if (busqueda) params.set('q', busqueda)
      setData(await apiFetch(`/api/automotriz/prospectos?${params}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id, filtro, busqueda])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const cargarCatalogos = async () => {
    try {
      const [es, cs] = await Promise.all([
        apiFetch(`/api/automotriz/empleados?companyId=${activeCompany.id}`),
        apiFetch(`/api/automotriz/contactos?companyId=${activeCompany.id}`),
      ])
      setEmpleados(es)
      setClientes(cs.filter((c) => c.esCliente || !c.esProveedor))
    } catch (err) { setError(err.message) }
  }

  const crear = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiFetch('/api/automotriz/prospectos', {
        method: 'POST',
        body: {
          companyId: activeCompany.id,
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim() || null,
          medio: form.medio,
          interes: form.interes.trim() || null,
          vendedorId: form.vendedorId || null,
          proximaAccion: form.proximaAccion ? new Date(form.proximaAccion).toISOString() : null,
          proximaNota: form.proximaNota.trim() || null,
        },
      })
      setForm(form0)
      setCreando(false)
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const patch = async (p, cambios) => {
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/prospectos/${p.id}`, { method: 'PATCH', body: cambios })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const avanzar = async (p) => {
    const siguiente = SIGUIENTE[p.estado]
    if (!siguiente) return
    if (siguiente === 'GANADO') {
      if (!clientes.length) await cargarCatalogos()
      return ganar(p)
    }
    // Al avanzar, propone reprogramar el seguimiento.
    const dias = window.prompt(`→ ${siguiente}. ¿Próximo seguimiento en cuántos días? (vacío = sin cambio)`, '3')
    if (dias === null) return
    const cambios = { estado: siguiente }
    if (dias !== '') {
      const f = new Date()
      f.setDate(f.getDate() + Number(dias))
      cambios.proximaAccion = f.toISOString()
    }
    await patch(p, cambios)
  }

  const ganar = async (p) => {
    if (!clientes.length) await cargarCatalogos()
    const nombre = window.prompt('GANADO 🎉 — razón social del cliente en el directorio (exacta o parte):', p.nombre)
    if (nombre === null) return
    const encontrados = clientes.filter((c) => c.razonSocial.toLowerCase().includes(nombre.trim().toLowerCase()))
    if (encontrados.length !== 1) {
      setError(encontrados.length === 0
        ? 'Cliente no encontrado en el directorio — dalo de alta primero (los que facturan ya existen por el sync).'
        : `${encontrados.length} clientes coinciden con «${nombre}» — sé más específico.`)
      return
    }
    await patch(p, { estado: 'GANADO', clienteId: encontrados[0].id, proximaAccion: null })
  }

  const perder = async (p) => {
    const motivo = window.prompt('Motivo de pérdida (precio, inventario, financiamiento, dejó de contestar…):', '')
    if (motivo === null) return
    await patch(p, { estado: 'PERDIDO', perdidoMotivo: motivo.trim() || null, proximaAccion: null })
  }

  const reprogramar = async (p) => {
    const dias = window.prompt('Próximo seguimiento en cuántos días:', '3')
    if (dias === null || dias === '') return
    const f = new Date()
    f.setDate(f.getDate() + Number(dias))
    const nota = window.prompt('Nota del seguimiento (opcional):', p.proximaNota ?? '')
    await patch(p, { proximaAccion: f.toISOString(), ...(nota !== null ? { proximaNota: nota.trim() || null } : {}) })
  }

  const prospectos = data?.prospectos ?? []
  const n = (e) => data?.porEstado?.[e] ?? 0
  const abiertos = ESTADOS.slice(0, 5).reduce((s, e) => s + n(e), 0)
  const mes = data?.mes

  const pill = (clave, etiqueta) => (
    <span key={clave} className={`filtro ${filtro === clave ? 'activo' : ''}`} onClick={() => setFiltro(clave)}>{etiqueta}</span>
  )

  return (
    <div>
      {encabezado(
        <button onClick={async () => { if (!creando) { setCreando(true); await cargarCatalogos() } else setCreando(false) }}>
          {creando ? 'Cerrar' : 'Registrar visita'}
        </button>,
      )}
      {error && <div className="error">{error}</div>}

      {mes && (
        <div className="kpi-strip">
          <div className="kpi-item">
            <span className="kpi-label">Leads del mes</span>
            <span className="kpi">{mes.nuevos}</span>
            <span className="kpi-sub">
              {MEDIOS.filter((m) => mes.porMedio[m]).map((m) => `${m.toLowerCase()} ${mes.porMedio[m]}`).join(' · ') || 'sin registros'}
            </span>
          </div>
          <div className="kpi-item">
            <span className="kpi-label">Cerrados en el mes</span>
            <span className="kpi">{mes.ganados}</span>
            <span className="kpi-sub">{mes.perdidos} perdidos · conversión {mes.nuevos ? Math.round((mes.ganados / mes.nuevos) * 100) : 0}%</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-label">Seguimientos vencidos</span>
            <span className={`kpi ${data.vencidos > 0 ? 'neg' : ''}`}>{data.vencidos}</span>
            <span className="kpi-sub">la lista de llamadas de hoy</span>
          </div>
        </div>
      )}

      {creando && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Registro de guardia</h2>
          <form onSubmit={crear} className="inline-form" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input required placeholder="Nombre del prospecto" value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} style={{ minWidth: 200 }} />
            <input placeholder="Teléfono / WhatsApp" value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} style={{ width: 160 }} />
            <select value={form.medio} onChange={(e) => setForm((f) => ({ ...f, medio: e.target.value }))}>
              {MEDIOS.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
            </select>
            <input placeholder="Interés (modelo, versión, presupuesto…)" value={form.interes}
              onChange={(e) => setForm((f) => ({ ...f, interes: e.target.value }))} style={{ minWidth: 240, flex: 1 }} />
            <select value={form.vendedorId} onChange={(e) => setForm((f) => ({ ...f, vendedorId: e.target.value }))} style={{ minWidth: 170 }}>
              <option value="">Vendedor…</option>
              {empleados.map((e2) => <option key={e2.id} value={e2.id}>{nombreEmp(e2)}</option>)}
            </select>
            <label className="muted">Seguir el:{' '}
              <input type="datetime-local" value={form.proximaAccion} onChange={(e) => setForm((f) => ({ ...f, proximaAccion: e.target.value }))} />
            </label>
            <input placeholder="Nota del seguimiento" value={form.proximaNota}
              onChange={(e) => setForm((f) => ({ ...f, proximaNota: e.target.value }))} style={{ minWidth: 180 }} />
            <button type="submit" disabled={busy}>Registrar</button>
          </form>
        </section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {pill('ABIERTOS', `Abiertos · ${abiertos}`)}
        {pill('VENCIDOS', `Vencidos · ${data?.vencidos ?? 0}`)}
        {ESTADOS.map((e) => pill(e, `${ETIQUETA[e]} · ${n(e)}`))}
        <input placeholder="Nombre, teléfono, interés…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: 220, marginLeft: 'auto' }} />
      </div>

      <table>
        <thead><tr><th>Prospecto</th><th>Interés</th><th>Medio</th><th>Vendedor</th><th>Estado</th><th>Próxima acción</th><th>Acciones</th></tr></thead>
        <tbody>
          {prospectos.map((p) => {
            const vencida = p.proximaAccion && new Date(p.proximaAccion) < new Date() && !['GANADO', 'PERDIDO'].includes(p.estado)
            return (
              <tr key={p.id}>
                <td style={{ fontSize: 13 }}>
                  {p.nombre}
                  {p.cliente && <div style={{ fontSize: 11.5 }}><Link to={`/contactos/${p.cliente.id}`}>{p.cliente.razonSocial}</Link></div>}
                  {p.telefono && <div className="mono faint" style={{ marginTop: 2 }}>{p.telefono}</div>}
                </td>
                <td style={{ maxWidth: 220 }}>
                  {p.interes ?? '—'}
                  {p.vehiculo && <div style={{ fontSize: 11.5 }}><Link to={`/vehiculos/${p.vehiculo.id}`}>{p.vehiculo.marca} {p.vehiculo.modelo} {p.vehiculo.anio}</Link></div>}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{p.medio.charAt(0) + p.medio.slice(1).toLowerCase()}</td>
                <td style={{ color: 'var(--ink-3)' }}>{nombreEmp(p.vendedor) ?? <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${BADGE[p.estado]}`}>{ETIQUETA[p.estado]}</span>
                  {p.estado === 'PERDIDO' && p.perdidoMotivo && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{p.perdidoMotivo}</div>}
                </td>
                <td className={vencida ? 'neg' : ''}>
                  {fechaHora(p.proximaAccion)}
                  {p.proximaNota && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{p.proximaNota}</div>}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {SIGUIENTE[p.estado] && SIGUIENTE[p.estado] !== 'GANADO' && (
                      <button style={BTN_FILA} disabled={busy} onClick={() => avanzar(p)}>→ {ETIQUETA[SIGUIENTE[p.estado]]}</button>
                    )}
                    {p.estado === 'NEGOCIACION' && <button style={BTN_FILA} disabled={busy} onClick={() => ganar(p)}>Ganado</button>}
                    {!['GANADO', 'PERDIDO'].includes(p.estado) && (
                      <>
                        <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => reprogramar(p)}>Reprogramar</button>
                        <button className="ghost" style={BTN_FILA} disabled={busy} onClick={() => perder(p)}>Perdido</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {prospectos.length === 0 && <tr><td colSpan={7} className="muted">Sin prospectos{filtro !== 'TODOS' ? ' con este filtro' : ''} — registra la primera visita de piso.</td></tr>}
        </tbody>
      </table>
      <p className="faint" style={NOTA}>
        Al marcar <b>Ganado</b> se liga el cliente del directorio (los que facturan ya existen por el sync) y la venta
        sigue su curso en <Link to="/pedidos">Pedidos</Link>. Los seguimientos vencidos alimentan la cola de WhatsApp.
      </p>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const nombreEmp = (e) => (e ? `${e.nombre} ${e.apellidoPaterno ?? ''}`.trim() : null)

const ESTADOS = ['NUEVO', 'CONTACTADO', 'CITA', 'DEMO', 'NEGOCIACION', 'GANADO', 'PERDIDO']
const SIGUIENTE = { NUEVO: 'CONTACTADO', CONTACTADO: 'CITA', CITA: 'DEMO', DEMO: 'NEGOCIACION', NEGOCIACION: 'GANADO' }
const BADGE = {
  NUEVO: 'badge-EN_TRANSITO', CONTACTADO: 'badge-EN_TRANSITO', CITA: 'badge-APARTADO',
  DEMO: 'badge-APARTADO', NEGOCIACION: 'badge-DISPONIBLE', GANADO: 'badge-ENTREGADO', PERDIDO: 'badge-CANCELADO',
}
const MEDIOS = ['PISO', 'TELEFONO', 'DIGITAL', 'REFERIDO', 'OTRO']

// Ventas y CRM (fase 2): dos caras —
//   Pipeline: el registro de guardia y el avance de prospectos.
//   WhatsApp: la cola de mensajes del día (fase 2b) — seguimientos vencidos y
//   clientes de taller que dejaron de venir, con el mensaje ya escrito y su
//   link wa.me. Sin API de Meta: el asesor da clic y decide enviar.
export default function Ventas() {
  const [tab, setTab] = useState('PIPELINE')
  return (
    <div>
      <header className="page-head">
        <h1>Ventas y CRM</h1>
        <div className="head-actions">
          <button className={tab === 'PIPELINE' ? '' : 'ghost'} onClick={() => setTab('PIPELINE')}>Pipeline</button>
          <button className={tab === 'WHATSAPP' ? '' : 'ghost'} onClick={() => setTab('WHATSAPP')}>WhatsApp</button>
        </div>
      </header>
      {tab === 'PIPELINE' ? <Pipeline /> : <ColaWhatsApp />}
    </div>
  )
}

function ColaWhatsApp() {
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
  const btn = { padding: '2px 10px', fontSize: 12 }

  if (error) return <div className="error">{error}</div>
  if (!data) return <p className="muted">Componiendo la cola del día…</p>

  const Fila = ({ item, acciones }) => (
    <tr>
      <td>
        {item.nombre}
        <div className="mono muted" style={{ fontSize: 11 }}>{item.telefono}</div>
      </td>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.mensaje}</div>
        {item.nota && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Nota: {item.nota}</div>}
      </td>
      <td className="neg" style={{ fontSize: 12 }}>
        {item.tipo === 'CRM' ? `venció ${fechaCorta(item.vencidaDesde)}` : `última visita ${fechaCorta(item.ultimaVisita)}`}
      </td>
      <td>
        <div className="head-actions" style={{ gap: 4 }}>
          <a href={item.link} target="_blank" rel="noreferrer">
            <button className="success" style={btn} onClick={() => copiar(item.mensaje)}>Abrir WhatsApp</button>
          </a>
          {acciones}
        </div>
      </td>
    </tr>
  )

  return (
    <div>
      <div className="cards" style={{ marginBottom: 14 }}>
        <section className="card"><h2>Mensajes en cola</h2><p className="kpi">{data.total}</p>
          <p className="muted">CRM {data.crm.length} · taller {data.servicio.length}</p></section>
        <section className="card"><h2>Sin teléfono</h2><p className="kpi">{data.sinTelefono.crm + data.sinTelefono.servicio}</p>
          <p className="muted">candidatos que no entraron a la cola — captura el teléfono</p></section>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Seguimientos vencidos (CRM)</h2>
        <table>
          <thead><tr><th>Prospecto</th><th>Mensaje</th><th>Vencido</th><th>Acciones</th></tr></thead>
          <tbody>
            {data.crm.map((i) => (
              <Fila key={i.prospectoId} item={i} acciones={
                <>
                  <button className="ghost" style={btn} disabled={busy} onClick={() => reprogramar(i.prospectoId, 3)}>+3d</button>
                  <button className="ghost" style={btn} disabled={busy} onClick={() => reprogramar(i.prospectoId, 7)}>+7d</button>
                </>
              } />
            ))}
            {data.crm.length === 0 && <tr><td colSpan={4} className="muted">Sin seguimientos vencidos con teléfono — al día. 🎯</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>«Abrir WhatsApp» copia el mensaje y abre el chat con el texto listo; al enviarlo, reprograma el seguimiento (+3d/+7d).</p>
      </section>

      <section className="card">
        <h2>Taller — dejaron de venir</h2>
        <table>
          <thead><tr><th>Cliente</th><th>Mensaje</th><th>Última visita</th><th>Acciones</th></tr></thead>
          <tbody>
            {data.servicio.map((i) => <Fila key={i.clienteId} item={i} acciones={null} />)}
            {data.servicio.length === 0 && <tr><td colSpan={4} className="muted">Nadie con ≥2 servicios lleva más de 6 meses sin venir (o falta teléfono).</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>Salen de esta lista solos cuando su siguiente CFDI de servicio entra por el sync.</p>
      </section>
    </div>
  )
}

function Pipeline() {
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

  return (
    <div>
      <div className="head-actions" style={{ marginBottom: 14 }}>
        <button onClick={async () => { if (!creando) { setCreando(true); await cargarCatalogos() } else setCreando(false) }}>
          {creando ? 'Cerrar' : 'Registrar visita'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {mes && (
        <div className="cards" style={{ marginBottom: 14 }}>
          <section className="card"><h2>Leads del mes</h2><p className="kpi">{mes.nuevos}</p>
            <p className="muted">{MEDIOS.filter((m) => mes.porMedio[m]).map((m) => `${m.toLowerCase()} ${mes.porMedio[m]}`).join(' · ') || 'sin registros'}</p></section>
          <section className="card"><h2>Cerrados en el mes</h2><p className="kpi">{mes.ganados}</p>
            <p className="muted">{mes.perdidos} perdidos · conversión {mes.nuevos ? Math.round((mes.ganados / mes.nuevos) * 100) : 0}%</p></section>
          <section className="card"><h2>Seguimientos vencidos</h2>
            <p className={`kpi ${data.vencidos > 0 ? 'neg' : ''}`}>{data.vencidos}</p>
            <p className="muted">la lista de llamadas de hoy</p></section>
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
            <label className="muted" style={{ fontSize: 12 }}>Seguir el:{' '}
              <input type="datetime-local" value={form.proximaAccion} onChange={(e) => setForm((f) => ({ ...f, proximaAccion: e.target.value }))} />
            </label>
            <input placeholder="Nota del seguimiento" value={form.proximaNota}
              onChange={(e) => setForm((f) => ({ ...f, proximaNota: e.target.value }))} style={{ minWidth: 180 }} />
            <button type="submit" disabled={busy}>Registrar</button>
          </form>
        </section>
      )}

      <div className="head-actions" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={filtro === 'ABIERTOS' ? '' : 'ghost'} onClick={() => setFiltro('ABIERTOS')}>Abiertos · {abiertos}</button>
        <button className={filtro === 'VENCIDOS' ? '' : 'ghost'} onClick={() => setFiltro('VENCIDOS')}>Vencidos · {data?.vencidos ?? 0}</button>
        {ESTADOS.map((e) => (
          <button key={e} className={filtro === e ? '' : 'ghost'} onClick={() => setFiltro(e)}>
            {e.charAt(0) + e.slice(1).toLowerCase()} · {n(e)}
          </button>
        ))}
        <input placeholder="Nombre, teléfono, interés…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200, marginLeft: 'auto' }} />
      </div>

      <table>
        <thead><tr><th>Prospecto</th><th>Interés</th><th>Medio</th><th>Vendedor</th><th>Estado</th><th>Próxima acción</th><th>Acciones</th></tr></thead>
        <tbody>
          {prospectos.map((p) => {
            const vencida = p.proximaAccion && new Date(p.proximaAccion) < new Date() && !['GANADO', 'PERDIDO'].includes(p.estado)
            const btn = { padding: '2px 10px', fontSize: 12 }
            return (
              <tr key={p.id}>
                <td>
                  {p.nombre}
                  {p.cliente && <div style={{ fontSize: 11 }}><Link to={`/contactos/${p.cliente.id}`}>{p.cliente.razonSocial}</Link></div>}
                  {p.telefono && <div className="mono muted" style={{ fontSize: 11 }}>{p.telefono}</div>}
                </td>
                <td style={{ maxWidth: 220 }}>
                  {p.interes ?? '—'}
                  {p.vehiculo && <div style={{ fontSize: 11 }}><Link to={`/vehiculos/${p.vehiculo.id}`}>{p.vehiculo.marca} {p.vehiculo.modelo} {p.vehiculo.anio}</Link></div>}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{p.medio.charAt(0) + p.medio.slice(1).toLowerCase()}</td>
                <td>{nombreEmp(p.vendedor) ?? <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${BADGE[p.estado]}`}>{p.estado}</span>
                  {p.estado === 'PERDIDO' && p.perdidoMotivo && <div className="muted" style={{ fontSize: 11 }}>{p.perdidoMotivo}</div>}
                </td>
                <td className={vencida ? 'neg' : ''}>
                  {fechaHora(p.proximaAccion)}
                  {p.proximaNota && <div className="muted" style={{ fontSize: 11 }}>{p.proximaNota}</div>}
                </td>
                <td>
                  <div className="head-actions" style={{ gap: 4 }}>
                    {SIGUIENTE[p.estado] && SIGUIENTE[p.estado] !== 'GANADO' && (
                      <button style={btn} disabled={busy} onClick={() => avanzar(p)}>→ {SIGUIENTE[p.estado].charAt(0) + SIGUIENTE[p.estado].slice(1).toLowerCase()}</button>
                    )}
                    {p.estado === 'NEGOCIACION' && <button className="success" style={btn} disabled={busy} onClick={() => ganar(p)}>Ganado</button>}
                    {!['GANADO', 'PERDIDO'].includes(p.estado) && (
                      <>
                        <button className="ghost" style={btn} disabled={busy} onClick={() => reprogramar(p)}>Reprogramar</button>
                        <button className="ghost" style={btn} disabled={busy} onClick={() => perder(p)}>Perdido</button>
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
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Al marcar <b>Ganado</b> se liga el cliente del directorio (los que facturan ya existen por el sync) y la venta
        sigue su curso en <Link to="/pedidos">Pedidos</Link>. Los seguimientos vencidos alimentarán el bot de WhatsApp.
      </p>
    </div>
  )
}

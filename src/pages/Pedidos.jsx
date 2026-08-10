import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const ESTADOS = ['COTIZACION', 'APARTADO', 'FACTURADO', 'ENTREGADO', 'CANCELADO']
const BADGE = { COTIZACION: 'badge-EN_TRANSITO', APARTADO: 'badge-APARTADO', FACTURADO: 'badge-DISPONIBLE', ENTREGADO: 'badge-ENTREGADO', CANCELADO: 'badge-CANCELADO' }

// Pedidos de unidades (ROADMAP §4.2, handoff 3c): el pipeline de la venta —
// cotización → apartado (con anticipo) → factura (ISAN+IVA+pólizas, la misma
// venta que el botón Vender) → entrega. El anticipo es dato de control; el
// dinero real entra por conciliación bancaria.
export default function Pedidos() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [creando, setCreando] = useState(false)
  const [unidades, setUnidades] = useState([])
  const [clientes, setClientes] = useState([])
  const [form, setForm] = useState({ vehiculoId: '', clienteId: '', precio: '', enganche: '', notas: '' })

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try { setData(await apiFetch(`/api/automotriz/pedidos?companyId=${activeCompany.id}`)) }
    catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const abrirCrear = async () => {
    setCreando(true); setError(null)
    try {
      const [vs, cs] = await Promise.all([
        apiFetch(`/api/automotriz/vehiculos?companyId=${activeCompany.id}&estado=DISPONIBLE`),
        apiFetch(`/api/automotriz/contactos?companyId=${activeCompany.id}`),
      ])
      setUnidades(vs)
      setClientes(cs.filter((c) => c.esCliente || (!c.esCliente && !c.esProveedor)))
    } catch (err) { setError(err.message) }
  }

  const crear = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiFetch('/api/automotriz/pedidos', {
        method: 'POST',
        body: {
          companyId: activeCompany.id,
          vehiculoId: form.vehiculoId,
          clienteId: form.clienteId,
          precio: Number(form.precio),
          enganche: form.enganche ? Number(form.enganche) : 0,
          notas: form.notas || null,
        },
      })
      setForm({ vehiculoId: '', clienteId: '', precio: '', enganche: '', notas: '' })
      setCreando(false)
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const accion = async (pedido, accionNombre) => {
    let extra = {}
    if (accionNombre === 'apartar') {
      const ant = window.prompt('Anticipo recibido (opcional, MXN):', '')
      if (ant === null) return
      if (ant) extra = { anticipo: Number(ant) }
    }
    if (accionNombre === 'facturar' && !window.confirm(`Facturar la unidad en ${mxn(pedido.precio)} + ISAN + IVA (postea pólizas)?`)) return
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/automotriz/pedidos/${pedido.id}/accion`, { method: 'POST', body: { accion: accionNombre, ...extra } })
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const pedidos = (data?.pedidos ?? []).filter((p) => filtro === 'TODOS' || p.estado === filtro)
  const n = (e) => data?.porEstado?.[e] ?? 0

  return (
    <div>
      <header className="page-head">
        <h1>Pedidos</h1>
        <button onClick={() => (creando ? setCreando(false) : abrirCrear())}>{creando ? 'Cerrar' : 'Nuevo pedido'}</button>
      </header>
      <div className="head-actions" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={filtro === 'TODOS' ? '' : 'ghost'} onClick={() => setFiltro('TODOS')}>Todos</button>
        {ESTADOS.map((e) => (
          <button key={e} className={filtro === e ? '' : 'ghost'} onClick={() => setFiltro(e)}>
            {e.charAt(0) + e.slice(1).toLowerCase()} · {n(e)}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}

      {creando && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Nuevo pedido</h2>
          <form onSubmit={crear} className="inline-form" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select required value={form.vehiculoId} onChange={(e) => {
              const v = unidades.find((u) => u.id === e.target.value)
              setForm((f) => ({ ...f, vehiculoId: e.target.value, precio: f.precio || (v?.precioLista ?? '') }))
            }} style={{ minWidth: 260 }}>
              <option value="">Unidad disponible…</option>
              {unidades.map((v) => <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.anio} — {v.vin}</option>)}
            </select>
            <select required value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))} style={{ minWidth: 220 }}>
              <option value="">Cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </select>
            <input type="number" step="0.01" min="1" required placeholder="Precio (sin IVA)" value={form.precio}
              onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} style={{ width: 160 }} />
            <input type="number" step="0.01" min="0" placeholder="Enganche" value={form.enganche}
              onChange={(e) => setForm((f) => ({ ...f, enganche: e.target.value }))} style={{ width: 130 }} />
            <input placeholder="Notas" value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} style={{ minWidth: 200 }} />
            <button type="submit" disabled={busy}>Crear cotización</button>
          </form>
          <p className="muted" style={{ fontSize: 12 }}>El cliente debe existir en el directorio (los derivados de CFDIs ya están; los nuevos se dan de alta en ContabilidadOS).</p>
        </section>
      )}

      <table>
        <thead><tr><th>Unidad</th><th>Cliente</th><th>Estado</th><th className="num">Precio</th><th className="num">Anticipo</th><th>Actualizado</th><th>Acciones</th></tr></thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td><Link to={`/vehiculos/${p.vehiculo.id}`}>{p.vehiculo.marca} {p.vehiculo.modelo} {p.vehiculo.anio}</Link><div className="mono muted" style={{ fontSize: 10 }}>{p.vehiculo.vin}</div></td>
              <td><Link to={`/contactos/${p.cliente.id}`}>{p.cliente.razonSocial}</Link></td>
              <td><span className={`badge ${BADGE[p.estado]}`}>{p.estado}</span></td>
              <td className="num">{mxn(p.precio)}</td>
              <td className="num">{p.anticipoRecibido > 0 ? mxn(p.anticipoRecibido) : '—'}</td>
              <td>{fecha(p.updatedAt)}</td>
              <td>
                <div className="head-actions" style={{ gap: 4 }}>
                  {p.estado === 'COTIZACION' && <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => accion(p, 'apartar')}>Apartar</button>}
                  {(p.estado === 'COTIZACION' || p.estado === 'APARTADO') && <button className="success" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => accion(p, 'facturar')}>Facturar</button>}
                  {p.estado === 'FACTURADO' && <button style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => accion(p, 'entregar')}>Entregar</button>}
                  {(p.estado === 'COTIZACION' || p.estado === 'APARTADO') && <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => accion(p, 'cancelar')}>Cancelar</button>}
                </div>
              </td>
            </tr>
          ))}
          {pedidos.length === 0 && <tr><td colSpan={7} className="muted">Sin pedidos{filtro !== 'TODOS' ? ' en este estado' : ' aún — crea la primera cotización'}.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

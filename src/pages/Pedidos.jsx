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
  const [form, setForm] = useState({ vehiculoId: '', clienteId: '', precio: '', enganche: '', tomaDesc: '', tomaMonto: '', notas: '' })

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
          tomaACuentaDesc: form.tomaDesc.trim() || null,
          tomaACuentaMonto: form.tomaMonto ? Number(form.tomaMonto) : null,
          notas: form.notas || null,
        },
      })
      setForm({ vehiculoId: '', clienteId: '', precio: '', enganche: '', tomaDesc: '', tomaMonto: '', notas: '' })
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
    if (accionNombre === 'facturar') {
      if (!window.confirm(`Facturar la unidad en ${mxn(pedido.precio)} + ISAN + IVA (postea pólizas)?`)) return
      // Toma a cuenta: el usado entra a inventario como SEMINUEVO con costo =
      // valor de toma. Sin VIN se omite y se da de alta después en Inventario.
      if (pedido.tomaACuentaMonto > 0) {
        const vin = window.prompt(`Toma a cuenta por ${mxn(pedido.tomaACuentaMonto)} — VIN del usado (17 caracteres; vacío = darlo de alta después):`, '')
        if (vin === null) return
        const vinLimpio = vin.trim().toUpperCase()
        if (vinLimpio.length === 17) {
          const desc = window.prompt('Marca, modelo y año del usado (ej. "NISSAN VERSA 2022"):', pedido.tomaACuentaDesc ?? '')
          if (desc === null) return
          const partes = desc.trim().split(/\s+/)
          const anio = Number(partes[partes.length - 1])
          if (partes.length >= 3 && Number.isInteger(anio) && anio > 1980) {
            const km = window.prompt('Kilometraje (opcional):', '')
            if (km === null) return
            extra = {
              toma: {
                vin: vinLimpio,
                marca: partes[0],
                modelo: partes.slice(1, -1).join(' '),
                anio,
                kilometraje: km.trim() ? Number(km) : null,
              },
            }
          } else if (vinLimpio) {
            window.alert('No entendí "marca modelo año" — la unidad se da de alta después desde Inventario.')
          }
        } else if (vinLimpio) {
          window.alert('El VIN debe tener 17 caracteres — la unidad se da de alta después desde Inventario.')
        }
      }
    }
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
        <span className="glosa">cotización → apartado → factura → entrega</span>
        <div className="head-actions">
          <button onClick={() => (creando ? setCreando(false) : abrirCrear())}>{creando ? 'Cerrar' : 'Nuevo pedido'}</button>
        </div>
      </header>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span className={`filtro ${filtro === 'TODOS' ? 'activo' : ''}`} onClick={() => setFiltro('TODOS')}>Todos</span>
        {ESTADOS.map((e) => (
          <span key={e} className={`filtro ${filtro === e ? 'activo' : ''}`} onClick={() => setFiltro(e)}>
            {e.charAt(0) + e.slice(1).toLowerCase()} · {n(e)}
          </span>
        ))}
      </div>
      {error && <div className="error">{error}</div>}

      {creando && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">Nuevo pedido</div>
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
            <input placeholder="Toma a cuenta (descripción del usado)" value={form.tomaDesc}
              onChange={(e) => setForm((f) => ({ ...f, tomaDesc: e.target.value }))} style={{ minWidth: 220 }} />
            <input type="number" step="0.01" min="0" placeholder="Valor de toma" value={form.tomaMonto}
              onChange={(e) => setForm((f) => ({ ...f, tomaMonto: e.target.value }))} style={{ width: 140 }} />
            <input placeholder="Notas" value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} style={{ minWidth: 200 }} />
            <button type="submit" disabled={busy}>Crear cotización</button>
          </form>
          <div className="card-note">El cliente debe existir en el directorio (los derivados de CFDIs ya están; los nuevos se dan de alta en ContabilidadOS).</div>
        </section>
      )}

      <table>
        <thead><tr><th>Unidad</th><th>Cliente</th><th>Estado</th><th className="num">Precio sin IVA</th><th className="num">Anticipo</th><th>Actualizado</th><th>Acciones</th></tr></thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td style={{ fontSize: 13 }}>
                <Link to={`/vehiculos/${p.vehiculo.id}`}>{p.vehiculo.marca} {p.vehiculo.modelo} {p.vehiculo.anio}</Link>
                <div className="mono faint" style={{ marginTop: 2 }}>{p.vehiculo.vin}</div>
              </td>
              <td><Link to={`/contactos/${p.cliente.id}`}>{p.cliente.razonSocial}</Link></td>
              <td><span className={`badge ${BADGE[p.estado]}`}>{p.estado.charAt(0) + p.estado.slice(1).toLowerCase()}</span></td>
              <td className="num">{mxn(p.precio)}</td>
              <td className="num">{p.anticipoRecibido > 0 ? mxn(p.anticipoRecibido) : '—'}</td>
              <td style={{ color: 'var(--ink-3)' }}>{fecha(p.updatedAt)}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.estado === 'COTIZACION' && <button className="ghost" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => accion(p, 'apartar')}>Apartar</button>}
                  {(p.estado === 'COTIZACION' || p.estado === 'APARTADO') && <button className="ghost" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => accion(p, 'facturar')}>Facturar</button>}
                  {p.estado === 'FACTURADO' && <button className="ghost" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => accion(p, 'entregar')}>Entregar</button>}
                  {(p.estado === 'COTIZACION' || p.estado === 'APARTADO') && <button className="ghost" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => accion(p, 'cancelar')}>Cancelar</button>}
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

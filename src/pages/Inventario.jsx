import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const ESTADOS = ['', 'EN_TRANSITO', 'DISPONIBLE', 'APARTADO', 'VENDIDO', 'ENTREGADO', 'CANCELADO']

// Los chips nunca van en mayúsculas forzadas (DESIGN §6): el enum se rotula.
const ESTADO_LABEL = {
  EN_TRANSITO: 'En tránsito', DISPONIBLE: 'Disponible', APARTADO: 'Apartado',
  VENDIDO: 'Vendido', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
}
const USO_LABEL = { VENTA: 'Venta', DEMO: 'Demo', CORTESIA: 'Cortesía' }
const TIPO_LABEL = { NUEVO: 'Nuevo', SEMINUEVO: 'Seminuevo' }

// Columnas secundarias de la tabla: 12.5px --ink-3 (DESIGN §6 «Tabla»).
const SEC = { color: 'var(--ink-3)' }

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export default function Inventario() {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  const [estado, setEstado] = useState('')
  const [soloUso, setSoloUso] = useState('')
  const [q, setQ] = useState('')
  const [marca, setMarca] = useState('')
  const [anio, setAnio] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAlta, setShowAlta] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ companyId: activeCompany.id })
      if (estado) qs.set('estado', estado)
      const data = await apiFetch(`/api/automotriz/vehiculos?${qs}`)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [activeCompany?.id, estado])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div>
      <header className="page-head">
        <h1>Inventario de unidades</h1>
        {!loading && items.length > 0 && (
          <span className="glosa">{items.length} unidades en el padrón</span>
        )}
        <div className="head-actions">
          <input
            placeholder="Buscar VIN, marca, modelo, motor, cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260, width: 'auto' }}
          />
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 'auto' }}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e ? ESTADO_LABEL[e] : 'Todos los estados'}</option>
            ))}
          </select>
          <select value={soloUso} onChange={(e) => setSoloUso(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los usos</option>
            <option value="VENTA">Venta</option>
            <option value="DEMO">Demo</option>
            <option value="CORTESIA">Cortesía</option>
          </select>
          <select value={marca} onChange={(e) => setMarca(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las marcas</option>
            {[...new Set(items.map((v) => v.marca))].sort().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Año</option>
            {[...new Set(items.map((v) => v.anio))].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowAlta(true)}>+ Alta de unidad</button>
        </div>
      </header>

      {!loading && items.length > 0 && (() => {
        const enPiso = items.filter((v) => (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO') && (v.uso ?? 'VENTA') === 'VENTA')
        const vendidas = items.filter((v) => v.estado === 'VENDIDO' || v.estado === 'ENTREGADO')
        const sinCosto = vendidas.filter((v) => !v.costoCompra)
        const demos = items.filter((v) => v.uso && v.uso !== 'VENTA' && v.estado !== 'VENDIDO' && v.estado !== 'ENTREGADO')
        // Cinco columnas ⇒ la cifra baja a 27px; cuatro ⇒ se queda en 30px.
        const cols = sinCosto.length > 0 ? 5 : 4
        const cifra = cols === 5 ? { fontSize: 27 } : undefined
        return (
          <div className="kpi-strip" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, paddingBottom: 20, marginBottom: 20 }}>
            <div className="kpi-item">
              <span className="kpi-label">En piso</span>
              <span className="kpi" style={cifra}>{enPiso.length}</span>
              <span className="kpi-sub">{mxn(enPiso.reduce((s, v) => s + v.costoCompra, 0))} en inventario</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Apartadas</span>
              <span className="kpi" style={cifra}>{items.filter((v) => v.estado === 'APARTADO').length}</span>
              <span className="kpi-sub">comprometidas con cliente</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Vendidas</span>
              <span className="kpi" style={cifra}>{vendidas.length}</span>
              <span className="kpi-sub">facturadas y entregadas</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Demos / cortesía</span>
              <span className="kpi" style={cifra}>{demos.length}</span>
              <span className="kpi-sub">fuera del piso de venta</span>
            </div>
            {sinCosto.length > 0 && (
              <div className="kpi-item">
                <span className="kpi-label">Sin costo (pre-2021)</span>
                <span className="kpi neg" style={cifra}>{sinCosto.length}</span>
                <span className="kpi-sub">captúralos en el detalle</span>
              </div>
            )}
          </div>
        )
      })()}
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="muted">Sin unidades{estado ? ` en ${ESTADO_LABEL[estado].toLowerCase()}` : ''}. Da de alta la primera.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>VIN</th><th>Unidad</th><th>Tipo</th><th>Estado</th>
              <th className="num">Costo</th><th className="num">Costos adic.</th>
              <th className="num">Precio venta</th><th>Cliente</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((v) => !soloUso || v.uso === soloUso)
              .filter((v) => !marca || v.marca === marca)
              .filter((v) => !anio || String(v.anio) === String(anio))
              .filter((v) => {
                if (!q.trim()) return true
                const texto = `${v.vin} ${v.marca} ${v.modelo} ${v.version ?? ''} ${v.anio} ${v.color ?? ''} ${v.numeroMotor ?? ''} ${v.numeroEconomico ?? ''} ${v.cliente?.razonSocial ?? ''} ${v.supplier?.razonSocial ?? ''}`.toLowerCase()
                // Cada palabra de la búsqueda debe aparecer (VIN parcial cuenta).
                return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => texto.includes(t))
              })
              .map((v) => (
              <tr key={v.id}>
                <td className="mono"><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                <td style={{ fontSize: 13 }}>{v.marca} {v.modelo} {v.version ?? ''} {v.anio}</td>
                <td style={SEC}>
                  {TIPO_LABEL[v.tipo] ?? v.tipo}
                  {v.uso && v.uso !== 'VENTA' ? <> <span className="badge">{USO_LABEL[v.uso] ?? v.uso}</span></> : null}
                </td>
                <td><span className={`badge badge-${v.estado}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span></td>
                <td className="num">{mxn(v.costoCompra)}</td>
                <td className="num" style={SEC}>{mxn(v.costosTotal)}</td>
                <td className="num">{mxn(v.precioVenta)}</td>
                <td style={SEC}>{v.cliente ? <Link to={`/contactos/${v.cliente.id}`}>{v.cliente.razonSocial}</Link> : (v.ventaInvoiceId ? <span className="muted">Público en general</span> : '—')}</td>
              </tr>
              ))}
          </tbody>
        </table>
      )}

      {showAlta && (
        <AltaUnidad
          companyId={activeCompany.id}
          onClose={() => setShowAlta(false)}
          onCreated={() => { setShowAlta(false); cargar() }}
        />
      )}
    </div>
  )
}

function AltaUnidad({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({
    vin: '', marca: '', modelo: '', version: '', anio: new Date().getFullYear(),
    tipo: 'NUEVO', color: '', costoCompra: '', precioLista: '', planPisoTasaAnual: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await apiFetch('/api/automotriz/vehiculos', {
        method: 'POST',
        body: {
          companyId,
          vin: form.vin,
          marca: form.marca,
          modelo: form.modelo,
          version: form.version || null,
          anio: Number(form.anio),
          tipo: form.tipo,
          color: form.color || null,
          costoCompra: form.costoCompra ? Number(form.costoCompra) : 0,
          precioLista: form.precioLista ? Number(form.precioLista) : null,
          planPisoTasaAnual: form.planPisoTasaAnual ? Number(form.planPisoTasaAnual) / 100 : null,
        },
      })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Alta de unidad</h2>
        <div className="grid2">
          <label>VIN<input className="mono" style={{ fontSize: 12.5 }} value={form.vin} onChange={set('vin')} required minLength={11} maxLength={17} /></label>
          <label>Tipo
            <select value={form.tipo} onChange={set('tipo')}>
              <option value="NUEVO">Nuevo</option>
              <option value="SEMINUEVO">Seminuevo</option>
            </select>
          </label>
          <label>Marca<input value={form.marca} onChange={set('marca')} required /></label>
          <label>Modelo<input value={form.modelo} onChange={set('modelo')} required /></label>
          <label>Versión<input value={form.version} onChange={set('version')} /></label>
          <label>Año<input type="number" value={form.anio} onChange={set('anio')} required /></label>
          <label>Color<input value={form.color} onChange={set('color')} /></label>
          <label>Costo compra (sin IVA)<input type="number" step="0.01" value={form.costoCompra} onChange={set('costoCompra')} /></label>
          <label>Precio lista<input type="number" step="0.01" value={form.precioLista} onChange={set('precioLista')} /></label>
          <label>Tasa plan piso (% anual)<input type="number" step="0.01" value={form.planPisoTasaAnual} onChange={set('planPisoTasaAnual')} /></label>
        </div>
        <div className="card-note">
          La unidad nace en tránsito; al recibirla se postea el inventario a contabilidad.
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

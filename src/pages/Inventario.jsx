import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const ESTADOS = ['', 'EN_TRANSITO', 'DISPONIBLE', 'APARTADO', 'VENDIDO', 'ENTREGADO', 'CANCELADO']

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export default function Inventario() {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  const [estado, setEstado] = useState('')
  const [soloUso, setSoloUso] = useState('')
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
        <div className="head-actions">
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e ? e.replaceAll('_', ' ') : 'Todos los estados'}</option>
            ))}
          </select>
          <select value={soloUso} onChange={(e) => setSoloUso(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los usos</option>
            <option value="VENTA">Venta</option>
            <option value="DEMO">Demo</option>
            <option value="CORTESIA">Cortesía</option>
          </select>
          <button onClick={() => setShowAlta(true)}>+ Alta de unidad</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="muted">Sin unidades{estado ? ` en ${estado}` : ''}. Da de alta la primera.</p>
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
            {items.filter((v) => !soloUso || v.uso === soloUso).map((v) => (
              <tr key={v.id}>
                <td><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                <td>{v.marca} {v.modelo} {v.version ?? ''} {v.anio}</td>
                <td>{v.tipo}{v.uso && v.uso !== 'VENTA' ? <> <span className="badge">{v.uso}</span></> : null}</td>
                <td><span className={`badge badge-${v.estado}`}>{v.estado.replaceAll('_', ' ')}</span></td>
                <td className="num">{mxn(v.costoCompra)}</td>
                <td className="num">{mxn(v.costosTotal)}</td>
                <td className="num">{mxn(v.precioVenta)}</td>
                <td>{v.cliente?.razonSocial ?? '—'}</td>
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
          <label>VIN<input value={form.vin} onChange={set('vin')} required minLength={11} maxLength={17} /></label>
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
        <p className="muted">
          La unidad nace EN TRÁNSITO; al recibirla se postea el inventario a contabilidad.
        </p>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))

// Directorio de contactos (handoff 3e): chips Todos / Clientes / Proveedores.
// La dirección se deriva de los CFDIs (INGRESO=cliente, EGRESO=proveedor —
// un contacto puede ser ambos); ordenado por monto total de la relación.
export default function Contactos() {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const data = await apiFetch(`/api/automotriz/contactos?companyId=${activeCompany.id}`)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = items
    .filter((c) => filtro === 'TODOS' || (filtro === 'CLIENTES' ? c.esCliente : c.esProveedor))
    .filter((c) => `${c.razonSocial} ${c.rfc}`.toLowerCase().includes(q.toLowerCase()))

  const nCli = items.filter((c) => c.esCliente).length
  const nProv = items.filter((c) => c.esProveedor).length

  return (
    <div>
      <header className="page-head">
        <h1>Contactos</h1>
        <input placeholder="Buscar por nombre o RFC…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </header>
      <div className="head-actions" style={{ marginBottom: 14 }}>
        <button className={filtro === 'TODOS' ? '' : 'ghost'} onClick={() => setFiltro('TODOS')}>Todos · {items.length}</button>
        <button className={filtro === 'CLIENTES' ? '' : 'ghost'} onClick={() => setFiltro('CLIENTES')}>Clientes · {nCli}</button>
        <button className={filtro === 'PROVEEDORES' ? '' : 'ghost'} onClick={() => setFiltro('PROVEEDORES')}>Proveedores · {nProv}</button>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Cargando…</p> : (
        <table>
          <thead><tr><th>Razón social</th><th>RFC</th><th>Relación</th><th className="num">Facturas</th><th className="num">Como cliente</th><th className="num">Como proveedor</th></tr></thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/contactos/${c.id}`}>{c.razonSocial}</Link></td>
                <td className="mono" style={{ fontSize: 11 }}>{c.rfc}</td>
                <td>
                  {c.esCliente && <span className="badge badge-DISPONIBLE">Cliente</span>}{' '}
                  {c.esProveedor && <span className="badge badge-APARTADO">Proveedor</span>}
                  {!c.esCliente && !c.esProveedor && <span className="muted">—</span>}
                </td>
                <td className="num">{c.facturasCliente + c.facturasProveedor}</td>
                <td className="num">{c.esCliente ? mxn(c.montoCliente) : '—'}</td>
                <td className="num">{c.esProveedor ? mxn(c.montoProveedor) : '—'}</td>
              </tr>
            ))}
            {filtrados.length === 0 && <tr><td colSpan={6} className="muted">Sin contactos con este filtro.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}

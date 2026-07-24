import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

// Directorio de contactos (clientes y proveedores). El hub registra la
// contraparte de todo CFDI como Customer por RFC, así que un mismo contacto
// puede ser ambos — el detalle (ContactoPerfil) muestra los dos lados.
export default function Contactos() {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const data = await apiFetch(`/api/clientes?companyId=${activeCompany.id}`)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = items.filter((c) =>
    `${c.razonSocial} ${c.rfc}`.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      <header className="page-head">
        <h1>Clientes y proveedores</h1>
        <input placeholder="Buscar por nombre o RFC…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </header>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Cargando…</p> : (
        <table>
          <thead><tr><th>Razón social</th><th>RFC</th><th className="num">CFDIs</th></tr></thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/contactos/${c.id}`}>{c.razonSocial}</Link></td>
                <td>{c.rfc}</td>
                <td className="num">{c._count?.invoices ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

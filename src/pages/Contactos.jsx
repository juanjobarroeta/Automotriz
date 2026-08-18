import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { AvisoError, EsqueletoTabla, Vacio } from '../components/Estados'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))

// Directorio (handoff 3e) servido en dos páginas: Clientes y Proveedores.
// La dirección se deriva de los CFDIs (INGRESO=cliente, EGRESO=proveedor); un
// contacto puede ser ambos y aparece en las dos, con su columna del otro lado
// como contexto. Ordenado por monto de la relación.
export default function Contactos({ lado = 'CLIENTES' }) {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const esClientes = lado === 'CLIENTES'

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
    .filter((c) => (esClientes ? c.esCliente : c.esProveedor))
    .filter((c) => `${c.razonSocial} ${c.rfc}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (esClientes ? b.montoCliente - a.montoCliente : b.montoProveedor - a.montoProveedor))

  const perfilUrl = (c) => `/contactos/${c.id}${esClientes ? '' : '?lado=PROVEEDOR'}`

  // Franja de KPIs derivada del mismo directorio ya cargado (sin llamadas extra).
  const delLado = items.filter((c) => (esClientes ? c.esCliente : c.esProveedor))
  const monto = delLado.reduce((s, c) => s + (esClientes ? c.montoCliente : c.montoProveedor), 0)
  const facturas = delLado.reduce((s, c) => s + (esClientes ? c.facturasCliente : c.facturasProveedor), 0)
  const ambos = delLado.filter((c) => (esClientes ? c.esProveedor : c.esCliente)).length

  return (
    <div>
      <header className="page-head">
        <h1>{esClientes ? 'Clientes' : 'Proveedores'}</h1>
        <span className="glosa">
          {esClientes
            ? 'derivados de los CFDIs de ingreso — ordenados por lo facturado'
            : 'derivados de los CFDIs de egreso — ordenados por lo que nos han facturado'}
        </span>
        <div className="head-actions">
          <input placeholder="Buscar por nombre o RFC…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        </div>
      </header>
      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}

      <div className="kpi-strip">
        <div className="kpi-item">
          <span className="kpi-label">{esClientes ? 'Clientes' : 'Proveedores'}</span>
          <span className="kpi">{delLado.length}</span>
          <span className="kpi-sub">{ambos} también son {esClientes ? 'proveedores' : 'clientes'}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">{esClientes ? 'Facturado' : 'Nos han facturado'}</span>
          <span className="kpi">{mxn(monto)}</span>
          <span className="kpi-sub">histórico del sync del SAT</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Facturas</span>
          <span className="kpi">{facturas}</span>
          <span className="kpi-sub">CFDIs de {esClientes ? 'ingreso' : 'egreso'} ligados al directorio</span>
        </div>
      </div>

      {loading ? (
        <EsqueletoTabla columnas={[3, 2, 1, 1, 1]} filas={7} />
      ) : filtrados.length === 0 ? (
        // Mismo caso que en Inventario: la tabla se pintaba con encabezado y
        // cero filas, sin decir nada. Y «no hay» por búsqueda no es lo mismo
        // que «no hay» a secas.
        error ? null : q.trim() ? (
          <Vacio
            icono="busca"
            titulo={`Ningún ${esClientes ? 'cliente' : 'proveedor'} coincide con «${q.trim()}»`}
            detalle="La búsqueda mira la razón social y el RFC."
            accion={<button type="button" className="ghost" onClick={() => setQ('')}>Limpiar la búsqueda</button>}
          />
        ) : (
          <Vacio
            titulo={`Todavía no hay ${esClientes ? 'clientes' : 'proveedores'} en el directorio`}
            detalle={`El directorio se llena solo con el sync del SAT: cada CFDI de ${esClientes ? 'ingreso' : 'egreso'} da de alta a su contraparte.`}
          />
        )
      ) : (
        <table>
          <thead>
            <tr>
              <th>Razón social</th><th>RFC</th>
              <th className="num">Facturas</th>
              <th className="num">{esClientes ? 'Facturado' : 'Nos ha facturado'}</th>
              <th>También es</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 13 }}><Link to={perfilUrl(c)}>{c.razonSocial}</Link></td>
                <td className="mono">{c.rfc}</td>
                <td className="num">{esClientes ? c.facturasCliente : c.facturasProveedor}</td>
                <td className="num">{mxn(esClientes ? c.montoCliente : c.montoProveedor)}</td>
                <td>
                  {esClientes && c.esProveedor && <Link to={`/contactos/${c.id}?lado=PROVEEDOR`}><span className="badge badge-warn">Proveedor · {mxn(c.montoProveedor)}</span></Link>}
                  {!esClientes && c.esCliente && <Link to={`/contactos/${c.id}`}><span className="badge badge-ok">Cliente · {mxn(c.montoCliente)}</span></Link>}
                  {(esClientes ? !c.esProveedor : !c.esCliente) && <span className="muted">—</span>}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={5} className="muted">
                {q ? 'Sin resultados para la búsqueda.' : esClientes
                  ? 'Aún no hay clientes derivados de los CFDIs.'
                  : 'Aún no hay proveedores derivados de los CFDIs.'}
              </td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

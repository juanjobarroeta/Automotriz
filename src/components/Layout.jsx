import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Sólo páginas realmente construidas (patrón `ported: true` de la guía).
const NAV = [
  { to: '/', label: 'Inventario', ported: true },
  { to: '/contactos', label: 'Clientes y proveedores', ported: true },
  { to: '/pedidos', label: 'Pedidos', ported: false },
  { to: '/crm', label: 'CRM', ported: false },
  { to: '/refacciones', label: 'Refacciones', ported: false },
  { to: '/servicio', label: 'Servicio', ported: false },
]

export default function Layout() {
  const { user, companies, activeCompany, selectCompany, logout } = useAuth()
  const conModulo = companies.filter((c) => c.modulos?.includes('AUTOMOTRIZ'))

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Automotriz</div>
        <select
          value={activeCompany?.id ?? ''}
          onChange={(e) => selectCompany(e.target.value)}
        >
          {conModulo.map((c) => (
            <option key={c.id} value={c.id}>{c.razonSocial}</option>
          ))}
        </select>
        <nav>
          {NAV.filter((n) => n.ported).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{user?.email}</span>
          <button onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

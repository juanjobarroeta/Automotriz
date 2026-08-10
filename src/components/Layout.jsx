import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Navegación global del handoff «Nórdico» (README §Global Navigation).
// ported:false = pantalla aún no construida (patrón de la guía de satélites).
const NAV = [
  { to: '/panel', label: 'Panel', ported: true },
  { to: '/', label: 'Inventario', ported: true },
  { to: '/pedidos', label: 'Pedidos', ported: true },
  { to: '/rentabilidad', label: 'Rentabilidad', ported: true },
  { to: '/ventas', label: 'Ventas y CRM', ported: false },
  { to: '/servicio', label: 'Servicio', ported: false },
  { to: '/refacciones', label: 'Refacciones', ported: true },
  { to: '/cartera', label: 'Contabilidad', ported: true },
  { to: '/fiscal', label: 'Impuestos', ported: true },
  { to: '/alertas', label: 'Alertas', ported: true },
  { to: '/clientes', label: 'Clientes', ported: true },
  { to: '/proveedores', label: 'Proveedores', ported: true },
  { to: '/configuracion', label: 'Configuración', ported: true },
]

export function BrandLockup({ tagline = false }) {
  return (
    <div>
      <div className="brand">
        <span className="brand-icon">A</span>
        <span className="brand-name">Automotriz</span>
        <span className="brand-pro">PRO</span>
      </div>
      {tagline && (
        <div className="brand-tagline">powered by <b>Contabilidad OS</b></div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, companies, activeCompany, selectCompany, logout } = useAuth()
  const conModulo = companies.filter((c) => c.modulos?.includes('AUTOMOTRIZ'))
  const iniciales = (user?.name || user?.email || '?')
    .split(/[\s@]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')

  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandLockup tagline />
        <select value={activeCompany?.id ?? ''} onChange={(e) => selectCompany(e.target.value)}>
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
          <span className="avatar">{iniciales}</span>
          <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name || user?.email}
          </span>
          <button className="ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

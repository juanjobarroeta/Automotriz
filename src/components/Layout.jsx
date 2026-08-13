import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Icons from './Icons'

// Rail del mockup «Automotriz PRO»: 60px de iconos que se despliegan a 216px
// al pasar el mouse. El orden agrupa operación → dinero → catálogos → ajustes.
const NAV = [
  { to: '/panel', label: 'Panel', icon: 'panel' },
  { to: '/', label: 'Inventario', icon: 'inventario' },
  { to: '/pedidos', label: 'Pedidos', icon: 'pedidos' },
  { to: '/rentabilidad', label: 'Rentabilidad', icon: 'rentabilidad' },
  { to: '/ventas', label: 'Ventas y CRM', icon: 'ventas' },
  { to: '/servicio', label: 'Servicio', icon: 'servicio' },
  { to: '/refacciones', label: 'Refacciones', icon: 'refacciones' },
  { to: '/cartera', label: 'Contabilidad', icon: 'contabilidad' },
  { to: '/fiscal', label: 'Impuestos', icon: 'impuestos' },
  { to: '/alertas', label: 'Alertas', icon: 'alertas' },
  { to: '/cobertura', label: 'Cobertura', icon: 'cobertura' },
  { to: '/clientes', label: 'Clientes', icon: 'clientes' },
  { to: '/proveedores', label: 'Proveedores', icon: 'proveedores' },
]

export function BrandLockup({ tagline = false }) {
  return (
    <div>
      <div className="rail-brand" style={{ marginBottom: 0 }}>
        <span className="rail-mark">A</span>
        <span className="rail-label" style={{ opacity: 1, fontWeight: 600 }}>Automotriz PRO</span>
      </div>
      {tagline && (
        <div style={{ fontSize: 11, color: 'var(--muted-2)', margin: '6px 0 0 40px' }}>
          powered by Contabilidad OS
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, companies, activeCompany, selectCompany, logout } = useAuth()
  const [railOpen, setRailOpen] = useState(false)
  const conModulo = companies.filter((c) => c.modulos?.includes('AUTOMOTRIZ'))
  const iniciales = (user?.name || user?.email || '?')
    .split(/[\s@]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')

  return (
    <div className="shell">
      <div
        className="rail-slot"
        onMouseEnter={() => setRailOpen(true)}
        onMouseLeave={() => setRailOpen(false)}
      >
        <div className={railOpen ? 'rail open' : 'rail'}>
          <div className="rail-brand">
            <span className="rail-mark">A</span>
            <span className="rail-label">Automotriz PRO</span>
          </div>

          {NAV.map((n) => {
            const Icon = Icons[n.icon]
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                title={n.label}
                className={({ isActive }) => (isActive ? 'rail-item active' : 'rail-item')}
              >
                <Icon />
                <span className="rail-label">{n.label}</span>
              </NavLink>
            )
          })}

          <div className="rail-foot">
            <NavLink
              to="/configuracion"
              title="Configuración"
              className={({ isActive }) => (isActive ? 'rail-item active' : 'rail-item')}
            >
              <Icons.configuracion />
              <span className="rail-label">Configuración</span>
            </NavLink>
            <div className="rail-user">
              <span className="avatar">{iniciales}</span>
              <span className="rail-label">
                <span className="rail-user-name">{user?.name || user?.email}</span>
                <span className="rail-user-role" style={{ display: 'block' }}>
                  <span
                    onClick={logout}
                    style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                  >
                    Cerrar sesión
                  </span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="topbar-company">
            <span className="mark">{(activeCompany?.razonSocial || '?')[0]}</span>
            <span className="name">{activeCompany?.razonSocial || 'Sin agencia'}</span>
            <span className="caret">▾</span>
            <select
              value={activeCompany?.id ?? ''}
              onChange={(e) => selectCompany(e.target.value)}
              aria-label="Cambiar de agencia"
            >
              {conModulo.map((c) => (
                <option key={c.id} value={c.id}>{c.razonSocial}</option>
              ))}
            </select>
          </div>

          <div className="topbar-search">
            <Icons.buscar />
            Buscar VIN, cliente, orden, refacción…
          </div>

          <div className="topbar-right">
            <div className="sync-pill">
              <span className="sync-dot" />
              SAT sincronizado
            </div>
            <NavLink to="/alertas" className="icon-btn" title="Alertas">
              <Icons.campana />
              <span className="dot" />
            </NavLink>
            <span className="avatar">{iniciales}</span>
          </div>
        </div>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

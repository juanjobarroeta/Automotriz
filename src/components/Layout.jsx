import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import CompanySwitcher from './CompanySwitcher'
import PaletaComandos, { TECLA_PALETA, useAtajoPaleta } from './PaletaComandos'
import Icons from './Icons'

// Los 14 destinos en cuatro bloques. Una lista plana de 14 no tiene forma: se
// lee entera cada vez. Agrupada por para-qué-sirve —lo que se mueve, lo que se
// cobra, lo que se declara, a quién le vendes— se navega por posición.
const NAV = [
  {
    grupo: 'Operación',
    items: [
      { to: '/panel', label: 'Panel', icon: 'panel' },
      { to: '/', label: 'Inventario', icon: 'inventario' },
      { to: '/pedidos', label: 'Pedidos', icon: 'pedidos' },
      { to: '/servicio', label: 'Servicio', icon: 'servicio' },
      { to: '/refacciones', label: 'Refacciones', icon: 'refacciones' },
    ],
  },
  {
    grupo: 'Comercial',
    items: [
      { to: '/ventas', label: 'Ventas y CRM', icon: 'ventas' },
      { to: '/rentabilidad', label: 'Rentabilidad', icon: 'rentabilidad' },
      { to: '/cartera', label: 'Cartera', icon: 'clientes' },
    ],
  },
  {
    grupo: 'Contabilidad',
    items: [
      { to: '/contabilidad', label: 'Contabilidad (CE)', icon: 'contabilidad' },
      { to: '/fiscal', label: 'Impuestos', icon: 'impuestos' },
      { to: '/alertas', label: 'Alertas', icon: 'alertas' },
      { to: '/cobertura', label: 'Cobertura', icon: 'cobertura' },
    ],
  },
  {
    grupo: 'Directorio',
    items: [
      { to: '/clientes', label: 'Clientes', icon: 'clientes' },
      { to: '/proveedores', label: 'Proveedores', icon: 'proveedores' },
    ],
  },
]

// La barra colapsada es una preferencia de espacio de trabajo: se recuerda.
const MINI_KEY = 'automotriz.railMini'


/**
 * La marca. Va inline y no como <img>: hereda `currentColor` donde hace falta,
 * no pide una petición extra y no parpadea en el primer render.
 * El dibujo es EL MISMO de public/marca.svg, que es de donde salen los iconos
 * del instalable — si se cambia uno, hay que cambiar el otro.
 */
export function Marca({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="var(--ink)" />
      <path d="M118 410 L256 102 L394 410" fill="none" stroke="#FFFFFF"
            strokeWidth="64" strokeLinejoin="miter" />
      <path d="M180 322 H332" fill="none" stroke="#6E93E8" strokeWidth="44" />
    </svg>
  )
}

/** «Automotriz PRO»: el PRO va aparte, en versalita espaciada, para que el
 *  logotipo tenga jerarquía en vez de ser una cadena de texto. */
export function Wordmark() {
  return (
    <span className="rail-label wordmark">
      Automotriz<span className="wordmark-pro">PRO</span>
    </span>
  )
}

export function BrandLockup({ tagline = false }) {
  return (
    <div>
      <div className="rail-brand" style={{ marginBottom: 0 }}>
        <Marca size={30} />
        <Wordmark />
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
  const { user, logout } = useAuth()
  const [mini, setMini] = useState(() => {
    try {
      const guardado = localStorage.getItem(MINI_KEY)
      if (guardado !== null) return guardado === '1'
    } catch {}
    // Sin preferencia guardada, la decide la pantalla: en una laptop de 1440
    // la barra con rótulos le quita a la tabla de inventario el ancho que
    // necesita para no partir la fila en dos. Arriba de eso, rótulos.
    return typeof window !== 'undefined' && window.innerWidth < 1440
  })
  useEffect(() => {
    try { localStorage.setItem(MINI_KEY, mini ? '1' : '0') } catch {}
  }, [mini])

  const [paleta, setPaleta] = useState(false)
  const abrirPaleta = useCallback(() => setPaleta(true), [])
  useAtajoPaleta(abrirPaleta)

  const iniciales = (user?.name || user?.email || '?')
    .split(/[\s@]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')

  return (
    <div className="shell">
      <div className={mini ? 'rail-slot mini' : 'rail-slot'}>
        <div className={mini ? 'rail mini' : 'rail'}>
          <div className="rail-brand">
            <Marca size={30} />
            <Wordmark />
            <button
              type="button"
              className="rail-collapse"
              onClick={() => setMini((v) => !v)}
              title={mini ? 'Expandir la barra' : 'Colapsar la barra'}
              aria-label={mini ? 'Expandir la barra' : 'Colapsar la barra'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
              </svg>
            </button>
          </div>

          <nav className="rail-nav">
            {NAV.map((g) => (
              <div className="nav-group" key={g.grupo}>
                <div className="nav-group-title">{g.grupo}</div>
                {g.items.map((n) => {
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
              </div>
            ))}
          </nav>

          <div className="rail-foot">
            <NavLink
              to="/configuracion"
              title="Configuración"
              className={({ isActive }) => (isActive ? 'rail-item active' : 'rail-item')}
            >
              <Icons.configuracion />
              <span className="rail-label">Configuración</span>
            </NavLink>
            <div className="rail-user" title={user?.name || user?.email}>
              <span className="avatar">{iniciales}</span>
              <span className="rail-user-ident">
                <span className="rail-user-name">{user?.name || user?.email}</span>
                <button type="button" className="rail-user-role" onClick={logout}>
                  Cerrar sesión
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <CompanySwitcher />

          <button type="button" className="topbar-search" onClick={abrirPaleta}>
            <Icons.buscar />
            Buscar VIN, cliente, orden, refacción…
            <kbd className="paleta-kbd topbar-search-kbd">{TECLA_PALETA}</kbd>
          </button>

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

      <PaletaComandos abierta={paleta} onCerrar={() => setPaleta(false)} />
    </div>
  )
}

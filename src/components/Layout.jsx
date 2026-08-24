import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import CompanySwitcher from './CompanySwitcher'
import PaletaComandos, { TECLA_PALETA, useAtajoPaleta } from './PaletaComandos'
import Icons from './Icons'
import { aplicarTema, temaGuardado } from '../lib/tema'

// La navegación se organiza por DEPARTAMENTO, no por tarea, porque así está
// armada una agencia: cada grupo es un escritorio con su responsable. Con seis
// roles usando el mismo sistema (dueño, contador, gerente de servicio, de
// refacciones, F&I, vendedores) agrupar por «lo que se lee» y «lo que se
// mueve» obliga a todos a aprender el árbol de todos.
//
// El árbol es IDÉNTICO para cualquiera: predecible y enseñable. Lo que cambia
// por rol es qué grupos se ven — eso llega con AutomotrizRol.
//
// `porConstruir: true` pinta el destino tenue y sin liga, como manda el
// handoff: la arquitectura se ve completa sin fingir destinos que no existen.
const NAV = [
  {
    grupo: 'Dirección',
    items: [
      { to: '/panel', label: 'Panel', icon: 'panel' },
      { to: '/rentabilidad', label: 'Rentabilidad', icon: 'rentabilidad' },
      { to: '/cobertura', label: 'Cobertura', icon: 'cobertura' },
      { to: '/alertas', label: 'Alertas', icon: 'alertas' },
    ],
  },
  {
    grupo: 'CRM',
    items: [
      { to: '/ventas', label: 'Ventas y CRM', icon: 'ventas' },
      { to: '/clientes', label: 'Clientes', icon: 'clientes' },
      { label: 'Prospectos', icon: 'clientes', porConstruir: true },
    ],
  },
  {
    grupo: 'Nuevos',
    items: [
      { to: '/', label: 'Inventario', icon: 'inventario' },
      { to: '/pedidos', label: 'Pedidos a planta', icon: 'pedidos' },
      { label: 'Intercambios', icon: 'inventario', porConstruir: true },
    ],
  },
  {
    grupo: 'Seminuevos',
    items: [
      // Misma pantalla, otra rebanada: el inventario ya tiene su vista guardada.
      { to: '/?vista=SEMINUEVO', label: 'Inventario', icon: 'inventario' },
      { label: 'Toma a cuenta', icon: 'inventario', porConstruir: true },
    ],
  },
  {
    grupo: 'Post venta',
    items: [
      { to: '/servicio', label: 'Órdenes de servicio', icon: 'servicio' },
      { to: '/refacciones', label: 'Refacciones', icon: 'refacciones' },
    ],
  },
  {
    grupo: 'F&I',
    items: [
      { to: '/cartera', label: 'Cartera', icon: 'clientes' },
      { label: 'Contratos', icon: 'contabilidad', porConstruir: true },
    ],
  },
  {
    grupo: 'Compras',
    items: [
      { to: '/proveedores', label: 'Proveedores', icon: 'proveedores' },
      { label: 'Órdenes de compra', icon: 'pedidos', porConstruir: true },
      { label: 'Cuentas por pagar', icon: 'contabilidad', porConstruir: true },
    ],
  },
  {
    grupo: 'Contabilidad',
    items: [
      // Contabilidad (CE) se retira: el estado de resultados son las cuentas
      // 4–9 de esa balanza y el balance las 1–3. Entre los dos la cubren
      // entera, y tenerla aparte era una tercera vista de lo mismo.
      { to: '/estado-resultados', label: 'Estado de resultados', icon: 'contabilidad' },
      { to: '/balance', label: 'Balance general', icon: 'contabilidad' },
      { to: '/nomina', label: 'Nómina', icon: 'impuestos' },
      { to: '/fiscal', label: 'Impuestos', icon: 'impuestos' },
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
      <g fill="#FFFFFF" fillRule="evenodd">
        <path d="M114 256 a118 118 0 1 0 236 0 a118 118 0 1 0 -236 0 M146 256 a86 86 0 1 0 172 0 a86 86 0 1 0 -172 0" />
        <path d="M170 256 a62 62 0 1 0 124 0 a62 62 0 1 0 -124 0 M188 256 a44 44 0 1 0 88 0 a44 44 0 1 0 -88 0" />
        <rect x="306" y="138" width="58" height="236" rx="6" />
      </g>
    </svg>
  )
}

/** «AutomotrizPro»: una sola palabra, con el «Pro» en otro peso para que se
 *  lea la jerarquía sin partir el nombre en dos. */
export function Wordmark() {
  return (
    <span className="rail-label wordmark">Automotriz<span className="wordmark-pro">Pro</span></span>
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

// Segmentado Oscuro / Claro. El handoff lo pone en el header, a la derecha.
// Cambia UN atributo del documento: los tokens hacen el resto.
function TemaToggle() {
  const [tema, setTema] = useState(() => temaGuardado())
  const elegir = (t) => setTema(aplicarTema(t))
  return (
    <div className="tema-toggle" role="group" aria-label="Tema">
      {['oscuro', 'claro'].map((t) => (
        <button
          key={t}
          type="button"
          className={tema === t ? 'activo' : undefined}
          aria-pressed={tema === t}
          onClick={() => elegir(t)}
        >
          {t === 'oscuro' ? 'Oscuro' : 'Claro'}
        </button>
      ))}
    </div>
  )
}


// Los cinco destinos del teléfono. NO son los cinco primeros del árbol: son los
// que alguien abre de pie —el piso, el taller, un cliente, el panel— más la
// puerta al resto. El escritorio enseña el organigrama completo; el teléfono
// enseña lo que se hace parado junto a un coche.
const BARRA_MOVIL = [
  { to: '/', label: 'Piso', icon: 'inventario', end: true },
  { to: '/servicio', label: 'Taller', icon: 'servicio' },
  { to: '/clientes', label: 'Clientes', icon: 'clientes' },
  { to: '/panel', label: 'Panel', icon: 'panel' },
]

function BarraInferior({ onMas }) {
  return (
    <nav className="barra-inferior" aria-label="Navegación principal">
      {BARRA_MOVIL.map((n) => {
        const Icon = Icons[n.icon]
        return (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => (isActive ? 'activo' : undefined)}
          >
            <Icon />
            <span>{n.label}</span>
          </NavLink>
        )
      })}
      <button type="button" onClick={onMas} aria-haspopup="dialog">
        <Icons.configuracion />
        <span>Más</span>
      </button>
    </nav>
  )
}

// La hoja «Más» trae el árbol COMPLETO, el mismo de la barra lateral, más lo
// que la topbar deja de enseñar en pantalla chica: empresa, tema y sesión.
function HojaMas({ onCerrar, user, logout }) {
  return (
    <div className="hoja-fondo" onClick={onCerrar} role="presentation">
      <div
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-label="Más destinos"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hoja-asa" />

        <div style={{ padding: '0 18px 12px' }}>
          <CompanySwitcher />
        </div>

        {NAV.map((g) => (
          <div className="nav-group" key={g.grupo}>
            <div className="nav-group-title">{g.grupo}</div>
            {g.items.map((n) => {
              const Icon = Icons[n.icon]
              if (n.porConstruir) {
                return (
                  <span key={n.label} className="rail-item por-construir" aria-disabled="true">
                    <Icon /><span className="rail-label">{n.label}</span>
                  </span>
                )
              }
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={onCerrar}
                  className={({ isActive }) => (isActive ? 'rail-item active' : 'rail-item')}
                >
                  <Icon /><span className="rail-label">{n.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}

        <div className="nav-group">
          <div className="nav-group-title">Sesión</div>
          <NavLink to="/configuracion" onClick={onCerrar} className="rail-item">
            <Icons.configuracion /><span className="rail-label">Configuración</span>
          </NavLink>
          <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <TemaToggle />
            <span className="muted" style={{ fontSize: 11.5 }}>{user?.name || user?.email}</span>
          </div>
          <button type="button" className="ghost hoja-cierre" onClick={() => { onCerrar(); logout() }}>
            Cerrar sesión
          </button>
        </div>
      </div>
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
  const [mas, setMas] = useState(false)
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
                  // Destino aún no construido: se enseña tenue y sin liga. La
                  // arquitectura se ve completa sin fingir a dónde se llega.
                  if (n.porConstruir) {
                    return (
                      <span
                        key={n.label}
                        className="rail-item por-construir"
                        title={`${n.label} — todavía no se construye`}
                        aria-disabled="true"
                      >
                        <Icon />
                        <span className="rail-label">{n.label}</span>
                      </span>
                    )
                  }
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
            <TemaToggle />
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

      <BarraInferior onMas={() => setMas(true)} />
      {mas && <HojaMas onCerrar={() => setMas(false)} user={user} logout={logout} />}

      <PaletaComandos abierta={paleta} onCerrar={() => setPaleta(false)} />
    </div>
  )
}

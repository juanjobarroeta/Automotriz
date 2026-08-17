import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Sentry } from './sentry'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Panel from './pages/Panel'
import Cartera from './pages/Cartera'
import Inventario from './pages/Inventario'
import Contactos from './pages/Contactos'
import Fiscal from './pages/Fiscal'
import Alertas from './pages/Alertas'
import Portal from './pages/Portal'
import Rentabilidad from './pages/Rentabilidad'
import Cobertura from './pages/Cobertura'
import Configuracion from './pages/Configuracion'
import Pedidos from './pages/Pedidos'
import Refacciones from './pages/Refacciones'
import Servicio from './pages/Servicio'
import Ventas from './pages/Ventas'
import ContactoPerfil from './pages/ContactoPerfil'
import VehiculoDetalle from './pages/VehiculoDetalle'

function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

/**
 * Lo que ve el usuario cuando un render truena. Sin esta frontera, React 19
 * desmonta el árbol completo y deja la pantalla en blanco: el vendedor cree
 * que "se trabó el sistema", cierra la pestaña y nadie se entera del error.
 */
function PantallaDeError({ resetError }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: '30rem' }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 .5rem' }}>Algo se rompió</h1>
        <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          El error quedó registrado y lo estamos revisando. Nada de lo que
          hayas guardado se perdió.
        </p>
        <button
          onClick={resetError}
          style={{
            border: 0, borderRadius: '.5rem', padding: '.625rem 1.25rem',
            background: '#111', color: '#fff', fontSize: '.9375rem', cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <PantallaDeError resetError={resetError} />}
    >
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/portal" element={<Portal />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Inventario />} />
            <Route path="/panel" element={<Panel />} />
            <Route path="/cartera" element={<Cartera />} />
            <Route path="/fiscal" element={<Fiscal />} />
            <Route path="/alertas" element={<Alertas />} />
            <Route path="/rentabilidad" element={<Rentabilidad />} />
            <Route path="/cobertura" element={<Cobertura />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/refacciones" element={<Refacciones />} />
            <Route path="/servicio" element={<Servicio />} />
            <Route path="/ventas" element={<Ventas />} />
            <Route path="/vehiculos/:id" element={<VehiculoDetalle />} />
            <Route path="/clientes" element={<Contactos lado="CLIENTES" />} />
            <Route path="/proveedores" element={<Contactos lado="PROVEEDORES" />} />
            <Route path="/contactos" element={<Navigate to="/clientes" replace />} />
            <Route path="/contactos/:id" element={<ContactoPerfil />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </Sentry.ErrorBoundary>
  )
}

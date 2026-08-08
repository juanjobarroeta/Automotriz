import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
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
import Configuracion from './pages/Configuracion'
import ContactoPerfil from './pages/ContactoPerfil'
import VehiculoDetalle from './pages/VehiculoDetalle'

function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
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
            <Route path="/configuracion" element={<Configuracion />} />
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
  )
}

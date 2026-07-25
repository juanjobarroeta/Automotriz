import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Panel from './pages/Panel'
import Cartera from './pages/Cartera'
import Inventario from './pages/Inventario'
import Contactos from './pages/Contactos'
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
            <Route path="/vehiculos/:id" element={<VehiculoDetalle />} />
            <Route path="/contactos" element={<Contactos />} />
            <Route path="/contactos/:id" element={<ContactoPerfil />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandLockup } from '../components/Layout'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login({ email, password })
      const hasModule = data.companies?.some((c) => c.modulos?.includes('AUTOMOTRIZ'))
      if (!hasModule) {
        setError('Ninguna de tus empresas tiene el módulo Automotriz habilitado.')
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <BrandLockup tagline />
        <p className="muted" style={{ marginTop: 4 }}>Entra con tu cuenta de la agencia.</p>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

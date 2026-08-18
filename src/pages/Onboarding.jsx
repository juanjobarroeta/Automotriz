import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandLockup } from '../components/Layout'
import { apiFetch } from '../config/api'

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding de una agencia: 7 pasos sobre endpoints del hub. El satélite es
// solo la cara — ContabilidadOS hace el trabajo (parsea la CSF con IA, cifra
// FIEL/CSD, provisiona Facturapi y dispara la descarga masiva del SAT).
//
// SEGURIDAD: los archivos .cer/.key y contraseñas viven SOLO en el estado de
// React de esta página y se mandan directo al hub en el paso final. Nunca se
// guardan en localStorage ni se loguean.
// ─────────────────────────────────────────────────────────────────────────────

const PASOS = ['Cuenta', 'Plan', 'CSF', 'e.firma', 'Sellos (CSD)', 'Manifiesto', 'Crear']

// Lo que la descarga masiva del SAT llena sola (mockup «Alta de tu agencia»).
const POBLADO_POR_SAT = ['Clientes', 'Proveedores', 'Nómina histórica', 'Activos fijos', 'Inventario de unidades por VIN']

// La nota de seguridad del alta: se muestra en TODO paso que pida credenciales.
const NOTA_CREDENCIALES =
  'Los archivos .cer/.key y sus contraseñas viven sólo en esta pantalla y se mandan directo al hub — nunca se guardan en el navegador ni se registran en bitácora.'

const fileToB64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(file)
  })

export default function Onboarding() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Paso 1 — cuenta
  const [cuenta, setCuenta] = useState({ name: '', email: '', password: '' })
  // Paso 2 — plan
  const [plan, setPlan] = useState('PROFESIONAL')
  const [checkoutHecho, setCheckoutHecho] = useState(false)
  // Paso 3 — CSF (prefill del wizard)
  const [csf, setCsf] = useState(null)
  const [csfWarnings, setCsfWarnings] = useState([])
  const [empresa, setEmpresa] = useState({ rfc: '', razonSocial: '', regimenFiscal: '', codigoPostal: '', fechaInicioRegimen: null, obligaciones: [] })
  // Pasos 4/5 — credenciales (solo en memoria)
  const [fiel, setFiel] = useState({ cer: null, key: null, password: '' })
  const [csd, setCsd] = useState({ cer: null, key: null, password: '' })
  // Paso 6
  const [manifiestoAck, setManifiestoAck] = useState(false)
  // Paso 7
  const [creando, setCreando] = useState(false)

  // Volviendo de Stripe (?checkout=exito|cancelado) retomamos en el paso 2/3.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const checkout = q.get('checkout')
    if (checkout && isAuthenticated) {
      setCheckoutHecho(checkout === 'exito')
      setPaso(checkout === 'exito' ? 2 : 1)
      window.history.replaceState({}, '', '/onboarding')
    } else if (isAuthenticated && paso === 0) {
      setPaso(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const siguiente = () => { setError(null); setPaso((p) => Math.min(p + 1, PASOS.length - 1)) }
  const atras = () => { setError(null); setPaso((p) => Math.max(p - 1, 0)) }

  // ── Paso 1: cuenta ──────────────────────────────────────────────────────────
  const crearCuenta = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiFetch('/api/auth/signup', {
        method: 'POST', skipAuth: true,
        body: { name: cuenta.name, email: cuenta.email, password: cuenta.password },
      }).catch((err) => {
        // Cuenta ya existente → intentamos login directo con esas credenciales.
        if (err.status !== 409 && err.status !== 400) throw err
      })
      await login({ email: cuenta.email, password: cuenta.password })
      siguiente()
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  // ── Paso 2: plan / Stripe ───────────────────────────────────────────────────
  const irACheckout = async () => {
    setBusy(true); setError(null)
    try {
      const r = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: { plan, intervalo: 'mensual', returnBase: window.location.origin },
      })
      window.location.href = r.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // ── Paso 3: CSF ─────────────────────────────────────────────────────────────
  const subirCsf = async (file) => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data, warnings } = await rawUpload('/api/onboarding/parse-csf', form)
      setCsf(data)
      setCsfWarnings(warnings ?? [])
      setEmpresa({
        rfc: data.rfc ?? '',
        razonSocial: data.razonSocial ?? [data.nombre, data.primerApellido, data.segundoApellido].filter(Boolean).join(' '),
        regimenFiscal: data.regimenFiscal ?? '',
        codigoPostal: data.codigoPostal ?? '',
        fechaInicioRegimen: data.fechaInicioRegimen ?? null,
        obligaciones: data.obligaciones ?? [],
      })
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  // ── Paso 7: crear empresa (una llamada atómica al hub) ─────────────────────
  const crearEmpresa = async () => {
    setCreando(true); setError(null)
    try {
      const [fielCer, fielKey, csdCer, csdKey] = await Promise.all([
        fiel.cer ? fileToB64(fiel.cer) : null,
        fiel.key ? fileToB64(fiel.key) : null,
        csd.cer ? fileToB64(csd.cer) : null,
        csd.key ? fileToB64(csd.key) : null,
      ])
      await apiFetch('/api/companies', {
        method: 'POST',
        body: {
          rfc: empresa.rfc,
          razonSocial: empresa.razonSocial,
          regimenFiscal: empresa.regimenFiscal,
          codigoPostal: empresa.codigoPostal,
          fechaInicioRegimen: empresa.fechaInicioRegimen,
          csfObligaciones: empresa.obligaciones,
          fielCer, fielKey, fielPassword: fiel.password || undefined,
          csdCer, csdKey, csdPassword: csd.password || undefined,
          manifiestoAck,
          satBackfillYears: 5,
          plan,
          modulos: ['AUTOMOTRIZ'],
        },
      })
      // Refresca companies[] del token (la empresa nueva ya trae AUTOMOTRIZ).
      // Si el usuario entró ya autenticado (sin contraseña en el wizard), lo
      // mandamos a login para que su sesión nueva traiga la empresa.
      if (cuenta.email && cuenta.password) {
        try {
          await login({ email: cuenta.email, password: cuenta.password })
          navigate('/?onboarding=exito', { replace: true })
          return
        } catch { /* cae al camino de re-login */ }
      }
      navigate('/login?onboarding=exito', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally { setCreando(false) }
  }

  const fielCompleta = fiel.cer && fiel.key && fiel.password
  const csdCompleto = csd.cer && csd.key && csd.password
  const empresaCompleta = empresa.rfc && empresa.razonSocial && empresa.regimenFiscal && empresa.codigoPostal

  return (
    <div className="login-wrap">
      <div className="wizard">
        <BrandLockup />
        <header className="page-head" style={{ marginBottom: 0, marginTop: 8 }}>
          <h1>Alta de tu agencia</h1>
          <span className="glosa">{PASOS.length} pasos · el satélite es la cara, ContabilidadOS hace el trabajo</span>
        </header>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>
          La constancia se lee con IA en el servidor, la e.firma y los sellos se cifran, y la descarga
          masiva del SAT arranca sola al crear la empresa.
        </p>
        <ol className="pasos">
          {PASOS.map((p, i) => (
            <li key={p} className={i === paso ? 'activo' : i < paso ? 'hecho' : ''}>{p}</li>
          ))}
        </ol>

        {error && <div className="error">{error}</div>}

        {paso === 0 && (
          <form onSubmit={crearCuenta} className="paso">
            <h2>Tu cuenta</h2>
            <label>Nombre<input value={cuenta.name} onChange={(e) => setCuenta({ ...cuenta, name: e.target.value })} required /></label>
            <label>Correo<input type="email" value={cuenta.email} onChange={(e) => setCuenta({ ...cuenta, email: e.target.value })} required /></label>
            <label>Contraseña<input type="password" minLength={8} value={cuenta.password} onChange={(e) => setCuenta({ ...cuenta, password: e.target.value })} required /></label>
            <div className="acciones"><button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Continuar'}</button></div>
          </form>
        )}

        {paso === 1 && (
          <div className="paso">
            <h2>Plan</h2>
            <label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="BASICO">Básico — $499/mes</option>
                <option value="PROFESIONAL">Profesional — $1,299/mes</option>
              </select>
            </label>
            {checkoutHecho && <div><span className="badge badge-ok">Pago confirmado</span></div>}
            <div className="acciones">
              <button className="ghost" onClick={atras}>Atrás</button>
              {!checkoutHecho && <button onClick={irACheckout} disabled={busy}>{busy ? 'Abriendo Stripe…' : 'Pagar con Stripe'}</button>}
              <button className="ghost" onClick={siguiente}>{checkoutHecho ? 'Continuar' : 'Pagar después'}</button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="paso">
            <h2>Constancia de Situación Fiscal</h2>
            <p className="muted">Sube el PDF del SAT; los datos de tu empresa se llenan solos (procesado con IA en el servidor).</p>
            <input type="file" accept="application/pdf" onChange={(e) => subirCsf(e.target.files?.[0])} />
            {busy && <p className="muted">Leyendo la constancia…</p>}
            {csfWarnings.map((w, i) => <div className="warn" key={i}>⚠️ {w}</div>)}
            {csf && (
              <div className="grid2">
                <label>RFC<input style={{ fontFamily: 'var(--font-mono)' }} value={empresa.rfc} onChange={(e) => setEmpresa({ ...empresa, rfc: e.target.value.toUpperCase() })} /></label>
                <label>Razón social<input value={empresa.razonSocial} onChange={(e) => setEmpresa({ ...empresa, razonSocial: e.target.value })} /></label>
                <label>Régimen fiscal<input value={empresa.regimenFiscal} onChange={(e) => setEmpresa({ ...empresa, regimenFiscal: e.target.value })} /></label>
                <label>Código postal<input value={empresa.codigoPostal} onChange={(e) => setEmpresa({ ...empresa, codigoPostal: e.target.value })} /></label>
              </div>
            )}
            <div className="acciones">
              <button className="ghost" onClick={atras}>Atrás</button>
              <button onClick={siguiente} disabled={!empresaCompleta}>Continuar</button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <CredencialPaso
            titulo="e.firma (FIEL)"
            descripcion="Con tu e.firma, ContabilidadOS descarga 5 años de CFDIs del SAT y llena solos tus clientes, proveedores, nómina, activos e inventario de unidades. Se guarda cifrada (AES-256); nunca sale del servidor."
            cred={fiel} setCred={setFiel}
            puntos={POBLADO_POR_SAT}
            onAtras={atras} onSiguiente={siguiente} completa={fielCompleta} opcionalLabel="Subir después"
          />
        )}

        {paso === 4 && (
          <CredencialPaso
            titulo="Sellos digitales (CSD)"
            descripcion="Con tus CSD la agencia puede timbrar facturas (unidades, refacciones y servicio) desde el primer día."
            cred={csd} setCred={setCsd}
            onAtras={atras} onSiguiente={siguiente} completa={csdCompleto} opcionalLabel="Subir después"
          />
        )}

        {paso === 5 && (
          <div className="paso">
            <h2>Carta manifiesto</h2>
            <p className="muted">
              Para timbrar a través del PAC necesitas firmar la Carta Manifiesto en el portal de
              Facturapi usando tu e.firma. Es un trámite de una sola vez, fuera de esta app.
            </p>
            <label className="check">
              <input type="checkbox" checked={manifiestoAck} onChange={(e) => setManifiestoAck(e.target.checked)} />
              Entiendo que debo firmar la Carta Manifiesto para poder timbrar.
            </label>
            <div className="acciones">
              <button className="ghost" onClick={atras}>Atrás</button>
              <button onClick={siguiente}>Continuar</button>
            </div>
          </div>
        )}

        {paso === 6 && (
          <div className="paso">
            <div className="card-head" style={{ marginBottom: 4, gap: 12, flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'flex-start' }}>
              <h2>Resumen del alta</h2>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                último paso: crear la agencia con módulo AUTOMOTRIZ y backfill de 5 ejercicios
              </span>
            </div>
            <dl>
              <dt>Empresa</dt>
              <dd>{empresa.razonSocial} <span className="mono">{empresa.rfc}</span></dd>
              <dt>Plan</dt>
              <dd>{plan}{checkoutHecho ? ' · pagado' : ' · pago pendiente'}</dd>
              <dt>e.firma</dt>
              <dd>{fielCompleta
                ? 'lista — la descarga de 5 años arranca sola'
                : <span style={{ color: 'var(--muted-2)' }}>pendiente — se puede subir después</span>}</dd>
              <dt>Sellos (CSD)</dt>
              <dd>{csdCompleto
                ? 'listos — timbrado habilitado'
                : <span style={{ color: 'var(--muted-2)' }}>pendientes — se pueden subir después</span>}</dd>
              <dt>Carta manifiesto</dt>
              <dd>{manifiestoAck
                ? 'enterado'
                : <span style={{ color: 'var(--muted-2)' }}>pendiente de firmar en Facturapi</span>}</dd>
              <dt>Módulos</dt>
              <dd>Contabilidad + Automotriz</dd>
            </dl>
            <p className="card-note" style={{ margin: 0 }}>{NOTA_CREDENCIALES}</p>
            <div className="acciones">
              <button className="ghost" onClick={atras}>Atrás</button>
              <button onClick={crearEmpresa} disabled={creando || !empresaCompleta}>
                {creando ? 'Creando tu agencia…' : 'Crear mi agencia'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CredencialPaso({ titulo, descripcion, cred, setCred, onAtras, onSiguiente, completa, opcionalLabel, puntos }) {
  return (
    <div className="paso">
      <h2 style={{ fontSize: 15 }}>{titulo}</h2>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, margin: 0 }}>{descripcion}</p>
      <div className="grid2">
        <label>
          Certificado (.cer)
          <input type="file" accept=".cer" onChange={(e) => setCred({ ...cred, cer: e.target.files?.[0] ?? null })} />
          <ArchivoElegido file={cred.cer} />
        </label>
        <label>
          Llave privada (.key)
          <input type="file" accept=".key" onChange={(e) => setCred({ ...cred, key: e.target.files?.[0] ?? null })} />
          <ArchivoElegido file={cred.key} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Contraseña de la llave
          <input
            type="password" value={cred.password} autoComplete="off"
            style={{ fontFamily: 'var(--font-mono)' }}
            onChange={(e) => setCred({ ...cred, password: e.target.value })}
          />
        </label>
      </div>

      {puntos && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Qué se llena solo con la descarga</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {puntos.map((p) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 'var(--rowpad) 0', borderBottom: '1px solid var(--border-hairline)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nota de seguridad: las credenciales no se guardan en el navegador. */}
      <p className="card-note" style={{ margin: 0 }}>{NOTA_CREDENCIALES}</p>

      <div className="acciones">
        <button className="ghost" onClick={onAtras}>Atrás</button>
        <button onClick={onSiguiente} className={completa ? '' : 'ghost'}>
          {completa ? 'Continuar' : opcionalLabel}
        </button>
      </div>
    </div>
  )
}

// Confirmación visual del archivo elegido (el input nativo sigue siendo el
// único que toca el archivo; esto sólo lo nombra).
function ArchivoElegido({ file }) {
  if (!file) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <span className="badge badge-ok">listo</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{file.name}</span>
    </span>
  )
}

// multipart upload con bearer (apiFetch fuerza JSON; aquí mandamos FormData).
async function rawUpload(path, formData) {
  const { api, tokenVigente } = await import('../config/api')
  const res = await fetch(api(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenVigente()}` },
    body: formData,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((data && data.error) || `Error ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

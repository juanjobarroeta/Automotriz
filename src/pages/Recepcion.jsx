import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import EscanerVin from '../components/EscanerVin'
import FirmaCanvas from '../components/FirmaCanvas'
import CapturaFotos from '../components/CapturaFotos'
import { construirContratoAdhesion } from '../lib/contratoAdhesion'

// La puerta del taller: identificar → checkup → firma+contrato. Tres pasos que
// se caminan de pie junto al coche (teléfono primero). Al terminar, la orden
// queda RECIBIDA con su expediente (fotos + contrato de adhesión firmado) y el
// tablero de órdenes la toma.
//
// Recuperación por paso: en cuanto la orden se crea, su id se guarda — si una
// foto o el contrato fallan a media subida, reintentar NUNCA duplica la orden
// (apiFetch no reintenta escrituras a propósito; la recuperación vive aquí).

const BORRADOR_KEY = 'recepcion.borrador'

const DEFAULT_CHECKLIST = [
  'Espejos laterales', 'Espejo retrovisor', 'Antena', 'Tapones de rueda',
  'Herramienta', 'Gato', 'Llanta de refacción', 'Extintor',
  'Tapetes', 'Estéreo / pantalla', 'Cables / USB', 'Documentos en guantera',
  'Tapón de gasolina', 'Placas (2)',
].map((etiqueta) => ({ clave: etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, '-'), etiqueta, ok: true }))

const FORM_INICIAL = {
  clienteId: '', clienteNombre: '', vin: '', descripcionUnidad: '', placas: '',
  kilometraje: '', torre: '', gasolinaOctavos: 4, pertenencias: '', comentarios: '',
  fallaReportada: '', asesorId: '', prometidaAt: '', garantiaDias: 30,
}

export default function Recepcion() {
  const { activeCompany } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const citaId = params.get('citaId')

  const [paso, setPaso] = useState(1)
  const [form, setForm] = useState(() => {
    try { return { ...FORM_INICIAL, ...JSON.parse(sessionStorage.getItem(BORRADOR_KEY) ?? '{}') } }
    catch { return FORM_INICIAL }
  })
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST)
  const [fotos, setFotos] = useState([])
  const [firma, setFirma] = useState(null)
  const [cita, setCita] = useState(null)
  const [citasHoy, setCitasHoy] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [error, setError] = useState(null)
  const [progreso, setProgreso] = useState(null)
  // La orden ya creada (recuperación): reintentar sólo sube lo pendiente.
  const ordenRef = useRef(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // El borrador de TEXTO sobrevive un refresh accidental; fotos y firma no
  // (son memoria) — limitación documentada de R1.
  useEffect(() => {
    try { sessionStorage.setItem(BORRADOR_KEY, JSON.stringify(form)) } catch { /* lleno */ }
  }, [form])

  // ── Carga inicial: la cita (si venimos de la agenda), las citas de hoy y
  //    el catálogo de asesores ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeCompany?.id) return
    apiFetch(`/api/automotriz/empleados?companyId=${activeCompany.id}`)
      .then((r) => setEmpleados(Array.isArray(r) ? r : r?.empleados ?? []))
      .catch(() => {})
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const man = new Date(hoy); man.setDate(man.getDate() + 1)
    apiFetch(`/api/automotriz/citas?companyId=${activeCompany.id}&desde=${hoy.toISOString()}&hasta=${man.toISOString()}&abiertas=1`)
      .then((r) => setCitasHoy(r?.citas ?? []))
      .catch(() => {})
  }, [activeCompany?.id])

  const tomarCita = useCallback((c) => {
    setCita(c)
    setForm((f) => ({
      ...f,
      clienteId: c.customer?.id ?? '',
      clienteNombre: c.customer?.razonSocial ?? c.clienteNombre ?? '',
      vin: c.vin ?? c.vehiculo?.vin ?? '',
      descripcionUnidad: c.descripcionUnidad ?? (c.vehiculo ? `${c.vehiculo.marca ?? ''} ${c.vehiculo.modelo ?? ''} ${c.vehiculo.anio ?? ''}`.trim() : ''),
      placas: c.placas ?? '',
      fallaReportada: f.fallaReportada || c.motivo || '',
    }))
  }, [])

  useEffect(() => {
    if (!citaId || !activeCompany?.id) return
    // La cita puntual: la buscamos en la agenda abierta (sin ruta por-id en R1).
    apiFetch(`/api/automotriz/citas?companyId=${activeCompany.id}&abiertas=1`)
      .then((r) => { const c = (r?.citas ?? []).find((x) => x.id === citaId); if (c) tomarCita(c) })
      .catch(() => {})
  }, [citaId, activeCompany?.id, tomarCita])

  // ── Typeahead de cliente/unidad sobre /buscar (patrón de la paleta ⌘K) ────
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState(null)
  useEffect(() => {
    if (!activeCompany?.id || consulta.trim().length < 2) { setResultados(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ companyId: activeCompany.id, q: consulta.trim() })
        setResultados(await apiFetch(`/api/automotriz/buscar?${qs}`, { signal: ctrl.signal }))
      } catch { /* abort o red: el typeahead calla */ }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [consulta, activeCompany?.id])

  const elegirContacto = (c) => { set('clienteId', c.id); set('clienteNombre', c.razonSocial); setConsulta(''); setResultados(null) }
  const elegirVehiculo = (v) => {
    setForm((f) => ({
      ...f,
      vin: v.vin ?? f.vin,
      descripcionUnidad: `${v.marca ?? ''} ${v.modelo ?? ''} ${v.anio ?? ''}`.trim() || f.descripcionUnidad,
    }))
    setConsulta(''); setResultados(null)
  }
  const buscarPorVin = (vin) => { if (vin?.length >= 6) setConsulta(vin) }

  // ── Validaciones por paso ─────────────────────────────────────────────────
  const puedePasar1 = form.descripcionUnidad.trim() || form.vin.length === 17
  const puedePasar2 = String(form.kilometraje).trim() !== ''
  const puedeRecibir = form.fallaReportada.trim().length > 0 && firma

  // ── El submit: orden → fotos → contrato (con recuperación) ────────────────
  const recibir = async () => {
    setError(null)
    try {
      // 1) La orden (una sola vez — ordenRef la recuerda si algo después falla)
      if (!ordenRef.current) {
        setProgreso('Creando la orden…')
        const payload = {
          clienteId: form.clienteId || null,
          vin: form.vin || null,
          descripcionUnidad: form.descripcionUnidad || null,
          placas: form.placas || null,
          kilometraje: form.kilometraje === '' ? null : Number(form.kilometraje),
          fallaReportada: form.fallaReportada,
          asesorId: form.asesorId || null,
          prometidaAt: form.prometidaAt ? new Date(form.prometidaAt).toISOString() : null,
          torre: form.torre || null,
          gasolinaOctavos: form.gasolinaOctavos,
          inventarioRecepcion: {
            items: checklist,
            ...(form.pertenencias ? { pertenencias: form.pertenencias } : {}),
            ...(form.comentarios ? { comentarios: form.comentarios } : {}),
          },
          garantiaDias: Number(form.garantiaDias) || 30,
        }
        ordenRef.current = cita
          ? await apiFetch(`/api/automotriz/citas/${cita.id}/recibir`, { method: 'POST', body: payload })
          : await apiFetch('/api/automotriz/ordenes', { method: 'POST', body: { companyId: activeCompany.id, ...payload } })
      }
      const orden = ordenRef.current

      // 2) Las fotos, una por request (las ya subidas se marcan y no repiten)
      for (let i = 0; i < fotos.length; i++) {
        if (fotos[i].subida) continue
        setProgreso(`Subiendo foto ${i + 1} de ${fotos.length}…`)
        await apiFetch(`/api/automotriz/ordenes/${orden.id}/documentos`, {
          method: 'POST',
          body: { tipo: 'FOTO_RECEPCION', nombre: fotos[i].nombre, mime: 'image/jpeg', base64: fotos[i].base64 },
        })
        fotos[i].subida = true
      }

      // 3) El contrato con la firma estampada y el QR del folio
      setProgreso('Generando el contrato…')
      let qrDataUrl = null
      try { qrDataUrl = await (await import('qrcode')).default.toDataURL(`OS-${orden.folio}`, { width: 108, margin: 1 }) } catch { /* sin QR */ }
      let empresa = { razonSocial: activeCompany.razonSocial, rfc: activeCompany.rfc }
      try { empresa = { ...empresa, ...(await apiFetch(`/api/companies/${activeCompany.id}`)) } } catch { /* con lo que hay */ }
      const blob = await construirContratoAdhesion({
        empresa,
        orden: { ...orden, garantiaDias: Number(form.garantiaDias) || 30, torre: form.torre || null, gasolinaOctavos: form.gasolinaOctavos },
        checklist: { items: checklist, pertenencias: form.pertenencias, comentarios: form.comentarios },
        firmaDataUrl: firma,
        qrDataUrl,
      })
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1])
        r.onerror = () => rej(new Error('No se pudo leer el PDF'))
        r.readAsDataURL(blob)
      })
      setProgreso('Guardando el contrato firmado…')
      await apiFetch(`/api/automotriz/ordenes/${orden.id}/documentos`, {
        method: 'POST',
        body: { tipo: 'CONTRATO_FIRMADO', nombre: `contrato-OS-${orden.folio}.pdf`, mime: 'application/pdf', base64 },
      })

      sessionStorage.removeItem(BORRADOR_KEY)
      navigate(`/servicio?q=${orden.folio}`)
    } catch (err) {
      setProgreso(null)
      setError(ordenRef.current
        ? `La orden OS-${ordenRef.current.folio} ya existe; falló una subida (${err.message}). Reintenta — no se duplica nada.`
        : err.message)
    }
  }

  const pasos = ['Identificar', 'Checkup', 'Firma y contrato']

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <header className="page-head">
        <h1>Recepción</h1>
        <span className="glosa">{cita ? `de la cita de ${new Date(cita.fecha).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'la unidad entra al taller'}</span>
      </header>

      <div className="paso-header">
        {pasos.map((p, i) => (
          <button type="button" key={p} className={paso === i + 1 ? 'activo' : i + 1 < paso ? 'hecho' : ''}
            onClick={() => { if (i + 1 < paso) setPaso(i + 1) }}>
            <i>{i + 1 < paso ? '✓' : i + 1}</i>{p}
          </button>
        ))}
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* ── Paso 1 · Identificar ─────────────────────────────────────────── */}
      {paso === 1 && (
        <section className="card">
          {!cita && citasHoy.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="glosa" style={{ marginBottom: 6 }}>Citas de hoy — un tap y queda llenado</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {citasHoy.map((c) => (
                  <button type="button" key={c.id} className="ghost" onClick={() => tomarCita(c)}>
                    {new Date(c.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {c.customer?.razonSocial ?? c.clienteNombre ?? 'Mostrador'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label>NIV
            <EscanerVin value={form.vin} onChange={(v) => set('vin', v)} onCommit={buscarPorVin} />
          </label>

          <label style={{ marginTop: 10 }}>Cliente / unidad del padrón
            <input placeholder="Buscar por nombre, RFC o NIV parcial…" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
          </label>
          {resultados && (
            <div className="card" style={{ padding: 8, marginTop: 4 }}>
              {(resultados.contactos ?? []).map((c) => (
                <button type="button" key={c.id} className="ghost" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => elegirContacto(c)}>
                  👤 {c.razonSocial}{c.rfc ? ` · ${c.rfc}` : ''}
                </button>
              ))}
              {(resultados.vehiculos ?? []).map((v) => (
                <button type="button" key={v.id} className="ghost" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => elegirVehiculo(v)}>
                  🚗 {v.marca} {v.modelo} {v.anio} · <span className="mono">{v.vin?.slice(-6)}</span>
                </button>
              ))}
              {!(resultados.contactos ?? []).length && !(resultados.vehiculos ?? []).length && (
                <span className="muted">Nada con «{consulta}» — captura los datos abajo</span>
              )}
            </div>
          )}

          <div className="grid2" style={{ marginTop: 10 }}>
            <label>Cliente
              <input value={form.clienteNombre} onChange={(e) => { set('clienteNombre', e.target.value); set('clienteId', '') }} placeholder="Mostrador si se deja vacío" />
            </label>
            <label>Unidad {form.vin.length === 17 ? '' : '(requerida sin NIV completo)'}
              <input value={form.descripcionUnidad} onChange={(e) => set('descripcionUnidad', e.target.value)} placeholder="Marca modelo año color" />
            </label>
            <label>Placas
              <input value={form.placas} onChange={(e) => set('placas', e.target.value.toUpperCase())} maxLength={20} />
            </label>
          </div>
          {form.clienteId && <span className="muted" style={{ fontSize: 12 }}>Cliente ligado al expediente ✓</span>}

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" disabled={!puedePasar1} onClick={() => setPaso(2)}>Al checkup →</button>
          </div>
        </section>
      )}

      {/* ── Paso 2 · Checkup ─────────────────────────────────────────────── */}
      {paso === 2 && (
        <section className="card">
          <div className="grid2">
            <label>Kilometraje *
              <input type="number" min="0" inputMode="numeric" value={form.kilometraje} onChange={(e) => set('kilometraje', e.target.value)} />
            </label>
            <label>Torre / tarjeta
              <input value={form.torre} onChange={(e) => set('torre', e.target.value.toUpperCase())} maxLength={20} placeholder="T-14" />
            </label>
          </div>

          <label style={{ marginTop: 10 }}>Gasolina — {form.gasolinaOctavos}/8</label>
          <div className="gasolina-segmentos">
            {Array.from({ length: 8 }, (_, i) => (
              <button type="button" key={i} className={i < form.gasolinaOctavos ? 'lleno' : ''}
                onClick={() => set('gasolinaOctavos', i + 1 === form.gasolinaOctavos ? i : i + 1)}
                aria-label={`${i + 1}/8`} />
            ))}
          </div>

          <div className="glosa" style={{ margin: '14px 0 6px' }}>Inventario — toca lo que FALTE o esté dañado</div>
          <div className="requisitos">
            {checklist.map((item, i) => (
              <button type="button" key={item.clave} className={`requisito ${item.ok ? 'ok' : 'falta'}`}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', textAlign: 'left' }}
                onClick={() => setChecklist((cs) => cs.map((c, j) => (j === i ? { ...c, ok: !c.ok } : c)))}>
                <span className="requisito-marca">{item.ok ? '✓' : '✗'}</span>
                <span>{item.etiqueta}</span>
              </button>
            ))}
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <label>Pertenencias del cliente
              <textarea rows={2} value={form.pertenencias} onChange={(e) => set('pertenencias', e.target.value)} placeholder="Lentes en guantera, silla infantil…" />
            </label>
            <label>Observaciones / daños existentes
              <textarea rows={2} value={form.comentarios} onChange={(e) => set('comentarios', e.target.value)} placeholder="Rayón en defensa trasera, estrella en parabrisas…" />
            </label>
          </div>

          <div className="glosa" style={{ margin: '14px 0 6px' }}>Fotos del estado</div>
          <CapturaFotos fotos={fotos} onChange={setFotos} />

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="ghost" onClick={() => setPaso(1)}>← Atrás</button>
            <button type="button" disabled={!puedePasar2} onClick={() => setPaso(3)}>A la firma →</button>
          </div>
        </section>
      )}

      {/* ── Paso 3 · Firma y contrato ────────────────────────────────────── */}
      {paso === 3 && (
        <section className="card">
          <label>Falla reportada / trabajo solicitado *
            <textarea rows={3} value={form.fallaReportada} onChange={(e) => set('fallaReportada', e.target.value)} placeholder="Lo que el cliente pide, con sus palabras" />
          </label>
          <div className="grid2" style={{ marginTop: 10 }}>
            <label>Asesor que recibe
              <select value={form.asesorId} onChange={(e) => set('asesorId', e.target.value)}>
                <option value="">—</option>
                {empleados.map((e2) => <option key={e2.id} value={e2.id}>{`${e2.nombre} ${e2.apellidoPaterno ?? ''}`.trim()}</option>)}
              </select>
            </label>
            <label>Promesa de entrega
              <input type="datetime-local" value={form.prometidaAt} onChange={(e) => set('prometidaAt', e.target.value)} />
            </label>
            <label>Garantía (días)
              <input type="number" min="0" value={form.garantiaDias} onChange={(e) => set('garantiaDias', e.target.value)} />
            </label>
          </div>

          <div className="card-note" style={{ margin: '12px 0' }}>
            Al firmar, el cliente acepta el contrato de adhesión: presupuesto previo autorizado antes de
            cualquier trabajo, entrega de piezas sustituidas, garantía de {form.garantiaDias || 30} días y
            fecha estimada {form.prometidaAt ? new Date(form.prometidaAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'por confirmar tras diagnóstico'}.
            El PDF firmado queda en el expediente de la orden y es inmutable.
          </div>

          <FirmaCanvas onChange={setFirma} />

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="ghost" onClick={() => setPaso(2)}>← Atrás</button>
            <button type="button" disabled={!puedeRecibir || !!progreso} onClick={recibir}>
              {progreso ?? 'Recibir unidad'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

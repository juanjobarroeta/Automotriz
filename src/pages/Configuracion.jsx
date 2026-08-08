import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

// Configuración del vertical: tasa de plan piso default (el interés se acumula
// solo, por unidad y mes, y resta en la utilidad por VIN) y la regla de
// comisión que se aplica al vender cuando no se captura un monto.
export default function Configuracion() {
  const { activeCompany } = useAuth()
  const [form, setForm] = useState({ planPisoTasaAnual: '', comisionPorcentajeUtilidad: '', comisionFija: '' })
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const c = await apiFetch(`/api/automotriz/config?companyId=${activeCompany.id}`)
      setForm({
        planPisoTasaAnual: c.planPisoTasaAnual != null ? String(c.planPisoTasaAnual * 100) : '',
        comisionPorcentajeUtilidad: c.comisionPorcentajeUtilidad != null ? String(c.comisionPorcentajeUtilidad * 100) : '',
        comisionFija: c.comisionFija != null ? String(c.comisionFija) : '',
      })
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    const num = (s, esc = 1) => (s === '' ? null : Number(s) / esc)
    try {
      await apiFetch('/api/automotriz/config', {
        method: 'PUT',
        body: {
          companyId: activeCompany.id,
          planPisoTasaAnual: num(form.planPisoTasaAnual, 100),
          comisionPorcentajeUtilidad: num(form.comisionPorcentajeUtilidad, 100),
          comisionFija: num(form.comisionFija),
        },
      })
      setMsg('Configuración guardada. El interés de piso se acumula en la próxima corrida diaria (o corre el cron interes-piso a mano).')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <header className="page-head"><h1>Configuración</h1></header>
      {error && <div className="error">{error}</div>}
      {msg && <div className="warn">✓ {msg}</div>}
      <div className="cards">
        <section className="card" style={{ maxWidth: 520 }}>
          <h2>Plan piso</h2>
          <form onSubmit={guardar}>
            <label>Tasa anual default (%) — se aplica a unidades sin tasa propia
              <input type="number" step="0.01" min="0" max="100" placeholder="p. ej. 14.5"
                value={form.planPisoTasaAnual}
                onChange={(e) => setForm((f) => ({ ...f, planPisoTasaAnual: e.target.value }))} />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              Con tasa configurada, cada unidad en piso acumula su costo financiero mensual
              (costo × tasa × días/365) — resta en la utilidad por VIN y aparece en Alertas
              como cifra real. Deja vacío para desactivar.
            </p>
            <h2 style={{ marginTop: 16 }}>Comisión del vendedor</h2>
            <label>% de la utilidad estimada
              <input type="number" step="0.1" min="0" max="100" placeholder="p. ej. 20"
                value={form.comisionPorcentajeUtilidad}
                onChange={(e) => setForm((f) => ({ ...f, comisionPorcentajeUtilidad: e.target.value }))} />
            </label>
            <label>Monto fijo por unidad (MXN)
              <input type="number" step="0.01" min="0" placeholder="p. ej. 2000"
                value={form.comisionFija}
                onChange={(e) => setForm((f) => ({ ...f, comisionFija: e.target.value }))} />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              Al vender sin capturar comisión, se aplica: fija + % × (precio − costo capitalizado).
              El monto capturado a mano siempre gana.
            </p>
            <button type="submit" disabled={busy || !activeCompany}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </form>
        </section>
      </div>
    </div>
  )
}

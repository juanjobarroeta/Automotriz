import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// Panel de la agencia (handoff «Nórdico»): franja de KPIs sin caja sobre
// hairline inferior + feed de urgentes con filas accionables (liga a unidad).
export default function Panel() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      setData(await apiFetch(`/api/automotriz/panel?companyId=${activeCompany.id}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <div className="error">{error}</div>
  if (!data) return <p className="muted">Cargando…</p>

  const { piso, mes, urgentes, periodo } = data

  return (
    <div>
      <header className="page-head">
        <h1>Panel</h1>
        <span className="muted">{MESES[periodo.month - 1]} {periodo.year} · {activeCompany?.razonSocial}</span>
      </header>

      <div className="kpi-strip">
        <div className="kpi-item">
          <span className="kpi-label">Valor en piso</span>
          <span className="kpi">{mxn(piso.valorPiso)}</span>
          <span className="muted">{piso.unidades} unidades · {piso.diasPromedio} días prom.</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Vendidas este mes</span>
          <span className="kpi">{mes.vendidas}</span>
          <span className="muted">Ingresos {mxn(mes.ingresos)}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Margen del mes</span>
          <span className={`kpi ${mes.margen >= 0 ? 'pos' : 'neg'}`}>{mxn(mes.margen)}</span>
          <span className="muted">ISAN causado {mxn(mes.isan)}</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">+90 días en piso</span>
          <span className={`kpi ${piso.masDe90 > 0 ? 'neg' : ''}`}>{piso.masDe90}</span>
          <span className="muted">{piso.masDe90 > 0 ? 'requieren acción de precio' : 'inventario sano'}</span>
        </div>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Requiere tu atención</h2>
        {urgentes.length === 0 ? (
          <p className="muted">Nada urgente por ahora. ✓</p>
        ) : (
          <div className="urgent-list">
            {urgentes.map((u) => (
              <Link key={`${u.tipo}-${u.vehiculoId}`} to={`/vehiculos/${u.vehiculoId}`} className="urgent-row">
                <span className={`badge ${u.tipo === 'PISO_90' ? 'badge-CANCELADO' : 'badge-APARTADO'}`}>
                  {u.tipo === 'PISO_90' ? '+90 días' : 'Apartada'}
                </span>
                <span className="urgent-title">{u.titulo}</span>
                <span className="muted">{u.detalle}</span>
                <span className="chevron">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

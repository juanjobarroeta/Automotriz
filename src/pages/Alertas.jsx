import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))

const SEV_BADGE = { error: 'badge-CANCELADO', warn: 'badge-APARTADO', info: 'badge-ENTREGADO' }
const SEV_LABEL = { error: 'Crítico', warn: 'Atención', info: 'Info' }

// Bandeja de alertas (IA §4.5): hallazgos del auditor fiscal del hub + REPs
// pendientes en ambas direcciones + alertas del piso (unidades envejeciendo,
// generales por confirmar). Cada renglón lleva a su fuente.
export default function Alertas() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try { setData(await apiFetch(`/api/automotriz/alertas?companyId=${activeCompany.id}`)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <p className="muted">Revisando hallazgos…</p>
  if (error) return <div className="error">{error}</div>
  if (!data) return null

  const criticos = data.hallazgos.filter((h) => h.severidad === 'error').length
  const totalAlertas = data.hallazgos.length + data.repPorEmitir.totalPendientes +
    (data.repPorRecibir.totalPendientes ?? 0) + data.inventario.totalEnvejecidas

  return (
    <div>
      <header className="page-head">
        <h1>Alertas</h1>
        <span className="muted">{totalAlertas === 0 ? 'Todo en orden' : `${totalAlertas} punto(s) por revisar`}</span>
      </header>

      <div className="cards">
        <section className="card">
          <h2>Auditor fiscal</h2>
          <p className={`kpi ${criticos > 0 ? 'neg' : ''}`}>{data.hallazgos.length}</p>
          <p className="muted">hallazgos abiertos{criticos > 0 ? ` · ${criticos} críticos` : ''}</p>
        </section>
        <section className="card">
          <h2>REP por emitir</h2>
          <p className={`kpi ${data.repPorEmitir.vencidos > 0 ? 'neg' : ''}`}>{mxn(data.repPorEmitir.montoPendiente)}</p>
          <p className="muted">{data.repPorEmitir.totalPendientes} cobro(s) PPD sin complemento · {data.repPorEmitir.vencidos} vencido(s)</p>
        </section>
        <section className="card">
          <h2>Inventario detenido</h2>
          <p className={`kpi ${data.inventario.criticas > 0 ? 'neg' : ''}`}>{data.inventario.totalEnvejecidas}</p>
          <p className="muted">unidad(es) en venta con +{data.inventario.diasAtencion} días · {data.inventario.criticas} con +{data.inventario.diasCritico}</p>
        </section>
      </div>

      {data.inventario.porRevisar > 0 && (
        <div className="warn">
          {data.inventario.porRevisar} unidad(es) auto-creadas con generales <b>POR REVISAR</b> —{' '}
          <Link to="/">confírmalas en el inventario</Link> (o corre el backfill con el catálogo de claves ingerido).
        </div>
      )}

      {data.hallazgos.length > 0 && (
        <section className="card">
          <h2>Hallazgos del auditor fiscal</h2>
          <div className="urgent-list">
            {data.hallazgos.map((h) => (
              <div key={h.id} className="urgent-row" style={{ cursor: 'default' }}>
                <div>
                  <div className="urgent-title">{h.mensaje}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{h.sugerencia} · {h.fundamento}</div>
                </div>
                <span className={`badge ${SEV_BADGE[h.severidad] ?? ''}`}>{SEV_LABEL[h.severidad] ?? h.severidad}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="cards">
        <section className="card">
          <h2>Cobros PPD sin REP emitido</h2>
          {data.repPorEmitir.top.length === 0 ? <p className="muted">Al día — nada pendiente.</p> : (
            <table>
              <thead><tr><th>Cliente</th><th className="num">Pendiente</th><th className="num">Vence</th></tr></thead>
              <tbody>
                {data.repPorEmitir.top.map((p) => (
                  <tr key={p.invoiceId}>
                    <td>{p.cliente ?? '—'}</td>
                    <td className="num">{mxn(p.montoPendiente)}</td>
                    <td className={`num ${p.urgencia === 'VENCIDO' ? 'neg' : ''}`}>{p.urgencia === 'VENCIDO' ? `hace ${-p.diasParaVencer} días` : `en ${p.diasParaVencer} días`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Obligación propia (RMF 2.7.1.32): el REP vence el día 5 del mes siguiente al cobro. <Link to="/cartera">Ver cartera →</Link></p>
        </section>

        <section className="card">
          <h2>Pagos sin REP del proveedor</h2>
          {data.repPorRecibir.top.length === 0 ? <p className="muted">Al día — nada pendiente.</p> : (
            <table>
              <thead><tr><th>Proveedor</th><th className="num">Pagado</th><th className="num">Límite</th></tr></thead>
              <tbody>
                {data.repPorRecibir.top.map((p) => (
                  <tr key={p.invoiceId}>
                    <td>{p.proveedor ?? '—'}</td>
                    <td className="num">{mxn(p.totalPagado)}</td>
                    <td className={`num ${p.urgencia === 'VENCIDO' ? 'neg' : ''}`}>{p.fechaLimite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Sin el complemento del proveedor, tu deducción y acreditamiento de IVA quedan en riesgo (Art. 5-I LIVA).</p>
        </section>
      </div>

      <section className="card">
        <h2>Unidades en venta detenidas (+{data.inventario.diasAtencion} días)</h2>
        {data.inventario.envejecidas.length === 0 ? <p className="muted">Ninguna unidad envejecida — el piso rota bien.</p> : (
          <table>
            <thead><tr><th>VIN</th><th>Unidad</th><th className="num">Días en piso</th><th className="num">Costo</th><th className="num">Interés piso est.</th></tr></thead>
            <tbody>
              {data.inventario.envejecidas.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                  <td>{v.unidad}</td>
                  <td className={`num ${v.dias >= data.inventario.diasCritico ? 'neg' : ''}`}>{v.dias}</td>
                  <td className="num">{mxn(v.costoCompra)}</td>
                  <td className="num">{v.interesEstimado != null ? mxn(v.interesEstimado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

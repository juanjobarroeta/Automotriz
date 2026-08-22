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

  const marcarVendida = async (v) => {
    const fecha = window.prompt(`Marcar VENDIDA ${v.unidad} (${v.vin}).\nFecha de venta (AAAA-MM-DD, vacío = hoy):`, '')
    if (fecha === null) return
    const precio = window.prompt('Precio de venta sin IVA (vacío = desconocido — no entra a utilidad):', '')
    if (precio === null) return
    try {
      await apiFetch(`/api/automotriz/vehiculos/${v.id}/marcar-vendida`, {
        method: 'POST',
        body: {
          ...(fecha.trim() ? { fechaVenta: new Date(`${fecha.trim()}T12:00:00Z`).toISOString() } : {}),
          precioVenta: precio.trim() ? Number(precio) : null,
        },
      })
      await cargar()
    } catch (err) { setError(err.message) }
  }

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
        <span className="glosa">{totalAlertas === 0 ? 'todo en orden' : `${totalAlertas} punto(s) por revisar`}</span>
      </header>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="kpi-item">
          <span className="kpi-label">Auditor fiscal</span>
          <span className={`kpi ${criticos > 0 ? 'neg' : ''}`}>{data.hallazgos.length}</span>
          <span className="kpi-sub">
            hallazgos abiertos
            {criticos > 0 && <span style={{ color: 'var(--danger)' }}> · {criticos} críticos</span>}
          </span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">REP por emitir</span>
          <span className={`kpi ${data.repPorEmitir.vencidos > 0 ? 'neg' : ''}`}>
            {mxn(data.repPorEmitir.montoPendiente)}
          </span>
          <span className="kpi-sub">
            {data.repPorEmitir.totalPendientes} cobro(s) PPD sin complemento
            {data.repPorEmitir.vencidos > 0
              ? <span style={{ color: 'var(--danger)' }}> · {data.repPorEmitir.vencidos} vencido(s)</span>
              : ' · ninguno vencido'}
          </span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Inventario detenido</span>
          <span className={`kpi ${data.inventario.criticas > 0 ? 'neg' : ''}`}>
            {data.inventario.totalEnvejecidas}
          </span>
          <span className="kpi-sub">
            unidad(es) en venta con +{data.inventario.diasAtencion} días
            {data.inventario.criticas > 0 && (
              <span style={{ color: 'var(--danger)' }}> · {data.inventario.criticas} con +{data.inventario.diasCritico}</span>
            )}
          </span>
        </div>
      </div>

      {data.inventario.porRevisar > 0 && (
        <div className="warn">
          {data.inventario.porRevisar} unidad(es) auto-creadas con generales <b>POR REVISAR</b> —{' '}
          <Link to="/">confírmalas en el inventario</Link> (o corre el backfill con el catálogo de claves ingerido).
        </div>
      )}

      {data.inventario.improbables?.total > 0 && (
        <section className="card">
          <div className="card-head">
            <span>En piso improbable</span>
            <span className="muted">{data.inventario.improbables.total} unidad(es) · {mxn(data.inventario.improbables.costoTotal)}</span>
          </div>
          <div className="card-note" style={{ marginTop: 10 }}>
            Unidades derivadas de CFDIs con +{data.inventario.improbables.diasUmbral} días «disponibles» y sin pedido:
            casi seguro se vendieron sin factura ligable (público en general sin VIN). Confírmalas una por una con
            <b> Marcar vendida</b> — es sólo dato (no postea pólizas; la factura real ya entró por el cierre). Así el
            piso, el aging y la rentabilidad regresan a la realidad.
          </div>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Unidad</th><th>VIN</th><th className="num">Días</th><th className="num">Costo</th><th>Acción</th></tr></thead>
            <tbody>
              {data.inventario.improbables.top.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontSize: 13 }}><Link to={`/vehiculos/${v.id}`}>{v.unidad}</Link></td>
                  <td className="mono">{v.vin}</td>
                  <td className="num neg">{v.dias}</td>
                  <td className="num">{mxn(v.costoCompra)}</td>
                  <td>
                    <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => marcarVendida(v)}>
                      Marcar vendida
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.inventario.improbables.total > data.inventario.improbables.top.length && (
            <p className="kpi-sub" style={{ margin: '10px 0 0' }}>
              Mostrando {data.inventario.improbables.top.length} de {data.inventario.improbables.total} — al confirmar, entran las siguientes.
            </p>
          )}
        </section>
      )}

      {data.hallazgos.length > 0 && (
        <div className="urgent-list" style={{ margin: '16px 0' }}>
          <div className="urgent-head">Hallazgos del auditor fiscal</div>
          {data.hallazgos.map((h) => (
            <div key={h.id} className="urgent-row" style={{ cursor: 'default' }}>
              <span className={`badge ${SEV_BADGE[h.severidad] ?? ''}`} style={{ flexShrink: 0 }}>
                {SEV_LABEL[h.severidad] ?? h.severidad}
              </span>
              <span className="urgent-title">{h.mensaje}</span>
              <span className="muted" style={{ minWidth: 0 }}>{h.sugerencia} · {h.fundamento}</span>
              <span className="chevron">›</span>
            </div>
          ))}
        </div>
      )}

      <div className="cards">
        <section className="card">
          <div className="card-head">
            <span>Cobros PPD sin REP emitido</span>
            <Link to="/cartera">ver cartera</Link>
          </div>
          {data.repPorEmitir.top.length === 0 ? <p className="muted">Al día — nada pendiente.</p> : (
            <table>
              <thead><tr><th>Cliente</th><th className="num">Pendiente</th><th className="num">Vence</th></tr></thead>
              <tbody>
                {data.repPorEmitir.top.map((p) => (
                  <tr key={p.invoiceId}>
                    <td style={{ fontSize: 13 }}>{p.cliente ?? '—'}</td>
                    <td className="num">{mxn(p.montoPendiente)}</td>
                    <td className={`num ${p.urgencia === 'VENCIDO' ? 'neg' : ''}`}>{p.urgencia === 'VENCIDO' ? `hace ${-p.diasParaVencer} días` : `en ${p.diasParaVencer} días`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-note">Obligación propia (RMF 2.7.1.32): el REP vence el día 5 del mes siguiente al cobro.</div>
        </section>

        <section className="card">
          <div className="card-head">Pagos sin REP del proveedor</div>
          {data.repPorRecibir.top.length === 0 ? <p className="muted">Al día — nada pendiente.</p> : (
            <table>
              <thead><tr><th>Proveedor</th><th className="num">Pagado</th><th className="num">Límite</th></tr></thead>
              <tbody>
                {data.repPorRecibir.top.map((p) => (
                  <tr key={p.invoiceId}>
                    <td style={{ fontSize: 13 }}>{p.proveedor ?? '—'}</td>
                    <td className="num">{mxn(p.totalPagado)}</td>
                    <td className={`num ${p.urgencia === 'VENCIDO' ? 'neg' : ''}`}>{p.fechaLimite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-note">Sin el complemento del proveedor, tu deducción y acreditamiento de IVA quedan en riesgo (Art. 5-I LIVA).</div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <span>Unidades en venta detenidas</span>
          <span className="muted">+{data.inventario.diasAtencion} días en piso</span>
        </div>
        {data.inventario.envejecidas.length === 0 ? <p className="muted">Ninguna unidad envejecida — el piso rota bien.</p> : (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>VIN</th><th>Unidad</th><th className="num">Días en piso</th><th className="num">Costo</th><th className="num">Interés piso est.</th></tr></thead>
            <tbody>
              {data.inventario.envejecidas.map((v) => (
                <tr key={v.id}>
                  <td className="mono"><Link to={`/vehiculos/${v.id}`}>{v.vin}</Link></td>
                  <td style={{ fontSize: 13 }}>{v.unidad}</td>
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

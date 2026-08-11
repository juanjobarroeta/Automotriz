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

      {data.inventario.improbables?.total > 0 && (
        <section className="card">
          <h2>En piso improbable — {data.inventario.improbables.total} unidad(es) · {mxn(data.inventario.improbables.costoTotal)}</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Unidades derivadas de CFDIs con +{data.inventario.improbables.diasUmbral} días «disponibles» y sin pedido:
            casi seguro se vendieron sin factura ligable (público en general sin VIN). Confírmalas una por una con
            <b> Marcar vendida</b> — es sólo dato (no postea pólizas; la factura real ya entró por el cierre). Así el
            piso, el aging y la rentabilidad regresan a la realidad.
          </p>
          <table>
            <thead><tr><th>Unidad</th><th>VIN</th><th className="num">Días</th><th className="num">Costo</th><th>Acción</th></tr></thead>
            <tbody>
              {data.inventario.improbables.top.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/vehiculos/${v.id}`}>{v.unidad}</Link></td>
                  <td className="mono" style={{ fontSize: 11 }}>{v.vin}</td>
                  <td className="num neg">{v.dias}</td>
                  <td className="num">{mxn(v.costoCompra)}</td>
                  <td>
                    <button className="ghost" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => marcarVendida(v)}>
                      Marcar vendida
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.inventario.improbables.total > data.inventario.improbables.top.length && (
            <p className="muted" style={{ fontSize: 12 }}>
              Mostrando {data.inventario.improbables.top.length} de {data.inventario.improbables.total} — al confirmar, entran las siguientes.
            </p>
          )}
        </section>
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

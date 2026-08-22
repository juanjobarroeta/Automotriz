import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import AbsorcionGrafica from '../components/AbsorcionGrafica'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// Panel de la agencia («Automotriz PRO»): franja de KPIs sin caja sobre
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

  const { piso, mes, urgentes, periodo, taller, crm, servicio, refacciones, absorcion, impuestos } = data
  const fechaCorta = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')
  const absorbe = absorcion?.porcentaje != null && absorcion.porcentaje >= 100

  return (
    <div>
      <header className="page-head">
        <h1>Panel</h1>
        <span className="glosa">{MESES[periodo.month - 1]} {periodo.year} · {activeCompany?.razonSocial}</span>
      </header>

      {/* Cinco ítems ⇒ franja densa: la cifra baja a 27px (DESIGN §6). */}
      <div className="kpi-strip densa" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="kpi-item">
          <span className="kpi-label">Valor en piso</span>
          <span className="kpi">{mxn(piso.valorPiso)}</span>
          <span className="kpi-sub">{piso.unidades} unidades · {piso.diasPromedio} días prom.</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Vendidas este mes</span>
          <span className="kpi">{mes.vendidas}</span>
          <span className="kpi-sub">
            {mxn(mes.ingresos)}
            {mes.nuevas ? ` · ${mes.nuevas.unidades} nuevas, ${mes.seminuevas.unidades} seminuevos` : ''}
          </span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Utilidad bruta del mes</span>
          <span className={`kpi ${(mes.utilidadBruta ?? 0) >= 0 ? '' : 'neg'}`}>{mxn(mes.utilidadBruta)}</span>
          <span className="kpi-sub">todas las líneas · antes de estructura</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">Utilidad neta del mes</span>
          <span className={`kpi ${(mes.utilidadNeta ?? 0) >= 0 ? '' : 'neg'}`}>{mxn(mes.utilidadNeta)}</span>
          <span className="kpi-sub">después de {mxn(mes.estructura)} de estructura</span>
        </div>
        <div className="kpi-item">
          <span className="kpi-label">+90 días en piso</span>
          <span className={`kpi ${piso.masDe90 > 0 ? 'neg' : ''}`}>{piso.masDe90}</span>
          <span className="kpi-sub">{piso.masDe90 > 0 ? 'requieren acción de precio' : 'inventario sano'}</span>
        </div>
      </div>

      <div className="cards" style={{ marginTop: 18 }}>
        <section className="card">
          <h2>Inventario en piso</h2>
          <p className="kpi">{piso.unidades}</p>
          <p className="muted">
            {piso.nuevas ?? 0} nuevas · {piso.seminuevas ?? 0} seminuevos
            {piso.demos > 0 ? ` · ${piso.demos} demo/cortesía` : ''} — {mxn(piso.valorPiso)} invertidos,{' '}
            {piso.diasPromedio} días prom.
          </p>
        </section>
        <section className="card">
          <h2>Seminuevos del mes</h2>
          <p className="kpi">{mes.seminuevas?.unidades ?? 0}</p>
          <p className="muted">{mxn(mes.seminuevas?.monto)} facturados · nuevas: {mes.nuevas?.unidades ?? 0} por {mxn(mes.nuevas?.monto)}</p>
        </section>
        <section className="card">
          <h2>Órdenes de servicio facturadas</h2>
          <p className="kpi">{servicio?.ordenesFacturadas ?? 0}</p>
          <p className="muted">
            {mxn(servicio?.monto)} · mano de obra {mxn(servicio?.manoObra)} + refacciones {mxn(servicio?.refacciones)}
          </p>
        </section>
        <section className="card">
          <h2>Refacciones de mostrador</h2>
          <p className="kpi">{refacciones?.facturas ?? 0}</p>
          <p className="muted">
            {mxn(refacciones?.monto)} en {(refacciones?.piezas ?? 0).toLocaleString('es-MX')} piezas · fuera de órdenes de taller
          </p>
        </section>
      </div>

      {absorcion && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2>Absorción de servicio</h2>
          <p className={`kpi ${absorbe ? '' : 'neg'}`}>
            {absorcion.porcentaje == null ? '—' : `${Math.round(absorcion.porcentaje)}%`}
          </p>
          <p className="muted">
            {absorcion.porcentaje == null
              ? 'sin estructura registrada en el mes'
              : absorbe
                ? 'El taller y refacciones pagan solos toda la estructura: cada unidad vendida es utilidad.'
                : `El back end cubre ${Math.round(absorcion.porcentaje)}% de la estructura; el resto tiene que salir de vender unidades.`}
          </p>
          <AbsorcionGrafica serie={absorcion.serie} />
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>Ver los números del mes a mes</summary>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Mes</th><th className="num">Utilidad taller + refacciones</th><th className="num">Estructura</th><th className="num">Absorción</th></tr></thead>
              <tbody>
                {(absorcion.serie ?? []).map((m) => (
                  <tr key={m.mes}>
                    <td>{m.mes}</td>
                    <td className="num">{mxn(m.utilidadFixedOps)}</td>
                    <td className="num">{mxn(m.estructura)}</td>
                    <td className={`num ${m.porcentaje >= 100 ? '' : 'neg'}`}>
                      {m.porcentaje == null ? '—' : `${Math.round(m.porcentaje)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      {impuestos && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2>Impuestos proyectados del mes</h2>
          <p className="kpi">{mxn(impuestos.total)}</p>
          <p className="muted">
            IVA {mxn(impuestos.iva)} · ISR provisional {mxn(impuestos.isr)} · retenciones {mxn(impuestos.retenciones)}
            {impuestos.ivaSaldoAFavor > 0 ? ` · saldo a favor de IVA ${mxn(impuestos.ivaSaldoAFavor)}` : ''}
          </p>
          <div className="card-note">
            Proyección con lo facturado hasta hoy — el mes no ha cerrado. La declaración se arma en{' '}
            <Link to="/fiscal">Impuestos</Link>.
          </div>
        </section>
      )}

      {(taller || crm) && (
        <div className="cards" style={{ marginTop: 18 }}>
          {taller && (
            <section className="card">
              <div className="card-head">
                <span>Taller hoy</span>
                <Link to="/servicio">ver órdenes</Link>
              </div>
              <p className="kpi">{taller.abiertas}</p>
              <p className="muted">
                órdenes abiertas · {taller.porEstado.RECIBIDA ?? 0} recibidas, {taller.porEstado.EN_PROCESO ?? 0} en
                proceso, {taller.porEstado.LISTA ?? 0} listas
              </p>
              {taller.promesasVencidas.length > 0 && (
                <div className="card-divider" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {taller.promesasVencidas.map((o) => (
                    <div key={o.id} style={{ fontSize: 12, color: 'var(--danger)' }}>
                      #<span className="mono">{o.folio}</span> {o.unidad ?? ''} — prometida {fechaCorta(o.prometidaAt)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {crm && (
            <section className="card">
              <div className="card-head">
                <span>Piso de ventas</span>
                <Link to="/ventas">abrir la cola de WhatsApp</Link>
              </div>
              <p className="kpi">{crm.abiertos}</p>
              <p className="muted">
                prospectos abiertos ·{' '}
                {crm.vencidos > 0
                  ? <span className="neg">{crm.vencidos} seguimientos vencidos</span>
                  : 'seguimientos al día'}
              </p>
            </section>
          )}
        </div>
      )}

      <div className="urgent-list" style={{ marginTop: 18 }}>
        <div className="urgent-head">Requiere tu atención</div>
        {urgentes.length === 0 ? (
          <div className="urgent-row" style={{ cursor: 'default' }}>
            <span className="muted">Nada urgente por ahora.</span>
          </div>
        ) : (
          urgentes.map((u) => (
            <Link key={`${u.tipo}-${u.vehiculoId}`} to={`/vehiculos/${u.vehiculoId}`} className="urgent-row">
              <span className={`badge ${u.tipo === 'PISO_90' ? 'badge-danger' : 'badge-warn'}`} style={{ flexShrink: 0 }}>
                {u.tipo === 'PISO_90' ? '+90 días' : 'Apartada'}
              </span>
              <span className="urgent-title">{u.titulo}</span>
              <span className="muted">{u.detalle}</span>
              <span className="chevron">›</span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

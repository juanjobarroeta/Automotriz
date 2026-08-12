import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(n * 100 % 1 ? 2 : 0)}%`)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Estado del checklist → badge del sistema (mismos tintes que el inventario).
const BADGE = { listo: 'badge-DISPONIBLE', pendiente: 'badge-APARTADO', atencion: 'badge-CANCELADO', 'no-aplica': 'badge-ENTREGADO' }
const ETIQUETA = { listo: 'Listo', pendiente: 'Pendiente', atencion: 'Atención', 'no-aplica': 'No aplica' }

// Periodo por defecto: el MES ANTERIOR — el que está por declararse.
function periodoDefault() {
  const hoy = new Date()
  const p = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}

// Impuestos del mes (IA §4.5 Finanzas): la posición fiscal que calcula el hub
// (IVA en flujo, ISR provisional por régimen) + el checklist para declarar.
export default function Fiscal() {
  const { activeCompany } = useAuth()
  const [periodo, setPeriodo] = useState(periodoDefault())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    const [y, m] = periodo.split('-').map(Number)
    setLoading(true); setError(null)
    try {
      setData(await apiFetch(`/api/automotriz/fiscal?companyId=${activeCompany.id}&year=${y}&month=${m}`))
    } catch (err) { setError(err.message); setData(null) } finally { setLoading(false) }
  }, [activeCompany?.id, periodo])

  useEffect(() => { cargar() }, [cargar])

  const ivaCargo = data ? data.iva.pagar > 0 : false
  const isrPagar = data?.isr?.isrPagar

  return (
    <div>
      <header className="page-head">
        <h1>Impuestos del mes</h1>
        <div className="head-actions">
          <input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </div>
      </header>

      {data && (
        <p className="muted">
          Declaración de {MESES[data.month - 1]} {data.year} — vence el{' '}
          {new Date(data.fechaLimite).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
          {data.vencida
            ? <span className="neg"> · vencida hace {-data.diasRestantes} día(s)</span>
            : ` · en ${data.diasRestantes} día(s)`}
        </p>
      )}

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Calculando la posición fiscal…</p>}

      {data && !loading && (
        <>
          {data.advertencias.length > 0 && (
            <div className="warn">
              {data.advertencias.map((a, i) => <p key={i} style={{ margin: '2px 0' }}>{a}</p>)}
            </div>
          )}

          <div className="cards">
            <section className="card">
              <h2>IVA del periodo</h2>
              <p className={`kpi ${ivaCargo ? '' : 'pos'}`}>{ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}</p>
              <p className="muted">{ivaCargo ? 'a pagar' : 'saldo a favor (se arrastra)'}</p>
            </section>
            <section className="card">
              <h2>ISR provisional</h2>
              <p className="kpi">{isrPagar == null ? '—' : mxn(isrPagar)}</p>
              <p className="muted">
                {data.isr.coeficiente != null
                  ? `coeficiente ${data.isr.coeficiente} (${data.isr.coeficienteFuente.replaceAll('_', ' ')})`
                  : data.isr.tasa != null ? `tasa ${pct(data.isr.tasa)}` : 'sin coeficiente disponible'}
              </p>
            </section>
            <section className="card">
              <h2>Retenciones a enterar</h2>
              <p className="kpi">{mxn(data.retenciones?.aEnterar ?? 0)}</p>
              <p className="muted">
                dinero de terceros ya descontado
                {data.retenciones?.recibosNomina > 0 ? ` · ${data.retenciones.recibosNomina.toLocaleString('es-MX')} recibos de nómina` : ''}
              </p>
            </section>
            <section className="card">
              <h2>Total al SAT</h2>
              <p className="kpi">{mxn(data.totalSat)}</p>
              <p className="muted">IVA + ISR provisional + retenciones</p>
            </section>
            <section className="card">
              <h2>Checklist para declarar</h2>
              <p className="kpi">{data.checklist.resumen.listos}/{data.checklist.resumen.listos + data.checklist.resumen.pendientes + data.checklist.resumen.atencion}</p>
              <p className="muted">puntos listos{data.checklist.resumen.atencion > 0 ? ` · ${data.checklist.resumen.atencion} requieren atención` : ''}</p>
            </section>
          </div>

          <div className="cards">
            <section className="card">
              <h2>Desglose de IVA (flujo de efectivo)</h2>
              <table>
                <tbody>
                  <tr><td>IVA cobrado (trasladado)</td><td className="num">{mxn(data.iva.trasladado)}</td></tr>
                  <tr><td>IVA acreditable{data.iva.proporcionAcreditamiento < 1 ? ` (proporción ${pct(data.iva.proporcionAcreditamiento)})` : ''}</td><td className="num">−{mxn(data.iva.acreditable)}</td></tr>
                  {data.iva.saldoFavorAnterior > 0 && <tr><td>Saldo a favor del mes anterior</td><td className="num">−{mxn(data.iva.saldoFavorAnterior)}</td></tr>}
                  <tr><td><strong>{ivaCargo ? 'IVA a pagar' : 'Saldo a favor'}</strong></td><td className="num"><strong>{ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}</strong></td></tr>
                  {data.iva.retenidoAProveedores > 0 && <tr><td className="muted">IVA retenido a proveedores (se entera aparte)</td><td className="num muted">{mxn(data.iva.retenidoAProveedores)}</td></tr>}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>Desglose de ISR provisional</h2>
              <table>
                <tbody>
                  <tr><td>Ingresos del mes</td><td className="num">{mxn(data.isr.ingresosDelMes)}</td></tr>
                  <tr><td>Ingresos acumulados del ejercicio</td><td className="num">{mxn(data.isr.ingresosAcumulados)}</td></tr>
                  {data.isr.baseGravable != null && <tr><td>Base gravable</td><td className="num">{mxn(data.isr.baseGravable)}</td></tr>}
                  {data.isr.isrDelEjercicio != null && <tr><td>ISR del ejercicio (acumulado)</td><td className="num">{mxn(data.isr.isrDelEjercicio)}</td></tr>}
                  {data.isr.isrPagadoAnterior > 0 && <tr><td>Pagos provisionales anteriores</td><td className="num">−{mxn(data.isr.isrPagadoAnterior)}</td></tr>}
                  {data.isr.retencionesAcreditadas > 0 && <tr><td>Retenciones acreditadas</td><td className="num">−{mxn(data.isr.retencionesAcreditadas)}</td></tr>}
                  <tr><td><strong>ISR a pagar</strong></td><td className="num"><strong>{isrPagar == null ? '—' : mxn(isrPagar)}</strong></td></tr>
                </tbody>
              </table>
              {!data.isr.tarifaVerificada && <p className="muted">Tarifa del ejercicio aún no verificada contra el DOF.</p>}
            </section>
          </div>

          {data.retenciones && (
            <section className="card">
              <h2>Retenciones del periodo</h2>
              <p className="muted">
                Lo que la empresa retuvo a terceros y sólo custodia hasta el día 17. No es impuesto propio:
                no sale del cálculo de utilidad, sale de lo que ya se descontó.
              </p>
              <table>
                <thead><tr><th>Concepto</th><th>Fundamento</th><th className="num">CFDIs</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {data.retenciones.conceptos.length === 0 && (
                    <tr><td colSpan={4} className="muted">Sin retenciones en el periodo.</td></tr>
                  )}
                  {data.retenciones.conceptos.map((c) => (
                    <tr key={c.clave}>
                      <td>{c.nombre}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{c.fundamento}</td>
                      <td className="num">{c.comprobantes.toLocaleString('es-MX')}</td>
                      <td className="num">{mxn(c.monto)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3}><strong>Total a enterar</strong></td>
                    <td className="num"><strong>{mxn(data.retenciones.aEnterar)}</strong></td>
                  </tr>
                </tbody>
              </table>
              {(data.retenciones.aFavor.iva > 0 || data.retenciones.aFavor.isr > 0) && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Aparte, los clientes le retuvieron {mxn(data.retenciones.aFavor.iva)} de IVA y{' '}
                  {mxn(data.retenciones.aFavor.isr)} de ISR. Eso NO se entera: es un anticipo, y ya viene
                  acreditado en el IVA y el ISR de arriba.
                </p>
              )}
            </section>
          )}

          <section className="card">
            <h2>Lo que sale del banco</h2>
            <table>
              <tbody>
                <tr><td>IVA a pagar</td><td className="num">{mxn(Math.max(data.iva.pagar, 0))}</td></tr>
                <tr><td>ISR provisional</td><td className="num">{mxn(Math.max(isrPagar ?? 0, 0))}</td></tr>
                <tr><td>Retenciones enteradas</td><td className="num">{mxn(data.retenciones?.aEnterar ?? 0)}</td></tr>
                <tr><td><strong>Total al SAT</strong></td><td className="num"><strong>{mxn(data.totalSat)}</strong></td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Un saldo a favor de IVA no se resta aquí: se arrastra al mes siguiente, no reduce el ISR ni las
              retenciones. IMSS, INFONAVIT e ISN se pagan por separado y no entran en esta suma.
            </p>
          </section>

          {data.efos && (
            <div className="warn">
              <strong>Proveedores 69-B (EFOS):</strong> se excluyeron {data.efos.cfdisExcluidos} CFDI(s) de {data.efos.rfcsBloqueados.join(', ')} —
              {' '}{mxn(data.efos.ivaAcreditableExcluido)} de IVA no acreditable.
            </div>
          )}

          <section className="card">
            <h2>¿Qué falta para declarar?</h2>
            <div className="urgent-list">
              {data.checklist.items.map((it) => (
                <div key={it.clave} className="urgent-row" style={{ cursor: 'default' }}>
                  <div>
                    <div className="urgent-title">{it.titulo}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{it.detalle}</div>
                  </div>
                  <span className={`badge ${BADGE[it.estado] ?? ''}`}>{ETIQUETA[it.estado] ?? it.estado}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

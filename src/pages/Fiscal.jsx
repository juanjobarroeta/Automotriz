import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(n * 100 % 1 ? 2 : 0)}%`)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Estado del checklist → badge del sistema (mismos tintes que el inventario).
const BADGE = { listo: 'badge-DISPONIBLE', pendiente: 'badge-APARTADO', atencion: 'badge-CANCELADO', 'no-aplica': 'badge-ENTREGADO' }
const ETIQUETA = { listo: 'Listo', pendiente: 'Pendiente', atencion: 'Atención', 'no-aplica': 'No aplica' }

// Renglón de desglose dentro de una tarjeta (patrón del mockup: etiqueta a la
// izquierda, importe a la derecha, divisor fino; sin tabla).
function Fila({ label, valor, fuerte, tenue }) {
  const color = tenue ? 'var(--muted)' : fuerte ? 'var(--ink)' : 'var(--ink-3)'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: 'var(--rowpad) 0', borderBottom: '1px solid var(--border-hairline)',
    }}>
      <span style={{ fontSize: 12.5, color, fontWeight: fuerte ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: tenue ? 'var(--muted)' : 'var(--ink)', fontWeight: fuerte ? 600 : 400 }}>{valor}</span>
    </div>
  )
}

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
        {data && (
          <span className="glosa">
            Declaración de {MESES[data.month - 1]} {data.year} — vence el{' '}
            {new Date(data.fechaLimite).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
            {data.vencida
              ? <span className="neg"> · vencida hace {-data.diasRestantes} día(s)</span>
              : ` · en ${data.diasRestantes} día(s)`}
          </span>
        )}
        <div className="head-actions">
          <input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} style={{ width: 'auto' }} />
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Calculando la posición fiscal…</p>}

      {data && !loading && (
        <>
          {data.advertencias.length > 0 && (
            <div className="warn">
              {data.advertencias.map((a, i) => <p key={i} style={{ margin: '2px 0' }}>{a}</p>)}
            </div>
          )}

          <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <div className="kpi-item">
              <span className="kpi-label">IVA del periodo</span>
              <span className="kpi" style={{ fontSize: 27, color: ivaCargo ? 'var(--danger)' : 'var(--ok)' }}>
                {ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}
              </span>
              <span className="kpi-sub">{ivaCargo ? 'a pagar · en flujo de efectivo' : 'saldo a favor (se arrastra)'}</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">ISR provisional</span>
              <span className="kpi" style={{ fontSize: 27 }}>{isrPagar == null ? '—' : mxn(isrPagar)}</span>
              <span className="kpi-sub">
                {data.isr.coeficiente != null
                  ? `coeficiente ${data.isr.coeficiente} (${data.isr.coeficienteFuente.replaceAll('_', ' ')})`
                  : data.isr.tasa != null ? `tasa ${pct(data.isr.tasa)}` : 'sin coeficiente disponible'}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Retenciones a enterar</span>
              <span className="kpi" style={{ fontSize: 27 }}>{mxn(data.retenciones?.aEnterar ?? 0)}</span>
              <span className="kpi-sub">
                dinero de terceros ya descontado
                {data.retenciones?.recibosNomina > 0 ? ` · ${data.retenciones.recibosNomina.toLocaleString('es-MX')} recibos de nómina` : ''}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Total al SAT</span>
              <span className="kpi" style={{ fontSize: 27 }}>{mxn(data.totalSat)}</span>
              <span className="kpi-sub">IVA + ISR provisional + retenciones</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Checklist para declarar</span>
              <span className="kpi" style={{ fontSize: 27 }}>
                {data.checklist.resumen.listos}/{data.checklist.resumen.listos + data.checklist.resumen.pendientes + data.checklist.resumen.atencion}
              </span>
              <span className="kpi-sub">
                puntos listos
                {data.checklist.resumen.atencion > 0 && (
                  <span style={{ color: 'var(--danger)' }}> · {data.checklist.resumen.atencion} requieren atención</span>
                )}
              </span>
            </div>
          </div>

          {data.efos && (
            <div className="warn">
              <strong>Proveedores 69-B (EFOS):</strong> se excluyeron {data.efos.cfdisExcluidos} CFDI(s) de{' '}
              {data.efos.rfcsBloqueados.map((rfc, i) => (
                <span key={rfc}>{i > 0 ? ', ' : ''}<span className="mono">{rfc}</span></span>
              ))} — {mxn(data.efos.ivaAcreditableExcluido)} de IVA no acreditable.
            </div>
          )}

          <div className="cards">
            <section className="card">
              <div className="card-head">Desglose de IVA (flujo de efectivo)</div>
              <Fila label="IVA cobrado (trasladado)" valor={mxn(data.iva.trasladado)} />
              <Fila
                label={`IVA acreditable${data.iva.proporcionAcreditamiento < 1 ? ` (proporción ${pct(data.iva.proporcionAcreditamiento)})` : ''}`}
                valor={`−${mxn(data.iva.acreditable)}`}
              />
              {data.iva.saldoFavorAnterior > 0 && (
                <Fila label="Saldo a favor del mes anterior" valor={`−${mxn(data.iva.saldoFavorAnterior)}`} />
              )}
              <Fila
                fuerte
                label={ivaCargo ? 'IVA a pagar' : 'Saldo a favor'}
                valor={ivaCargo ? mxn(data.iva.pagar) : mxn(data.iva.saldoAFavor)}
              />
              {data.iva.retenidoAProveedores > 0 && (
                <Fila tenue label="IVA retenido a proveedores (se entera aparte)" valor={mxn(data.iva.retenidoAProveedores)} />
              )}
            </section>
            <section className="card">
              <div className="card-head">Desglose de ISR provisional</div>
              <Fila label="Ingresos del mes" valor={mxn(data.isr.ingresosDelMes)} />
              <Fila label="Ingresos acumulados del ejercicio" valor={mxn(data.isr.ingresosAcumulados)} />
              {data.isr.baseGravable != null && <Fila label="Base gravable" valor={mxn(data.isr.baseGravable)} />}
              {data.isr.isrDelEjercicio != null && <Fila label="ISR del ejercicio (acumulado)" valor={mxn(data.isr.isrDelEjercicio)} />}
              {data.isr.isrPagadoAnterior > 0 && <Fila label="Pagos provisionales anteriores" valor={`−${mxn(data.isr.isrPagadoAnterior)}`} />}
              {data.isr.retencionesAcreditadas > 0 && <Fila label="Retenciones acreditadas" valor={`−${mxn(data.isr.retencionesAcreditadas)}`} />}
              <Fila fuerte label="ISR a pagar" valor={isrPagar == null ? '—' : mxn(isrPagar)} />
              {!data.isr.tarifaVerificada && (
                <div className="card-note">Tarifa del ejercicio aún no verificada contra el DOF.</div>
              )}
            </section>
          </div>

          {data.retenciones && (
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">Retenciones del periodo</div>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Lo que la empresa retuvo a terceros y sólo custodia hasta el día 17. No es impuesto propio:
                no sale del cálculo de utilidad, sale de lo que ya se descontó.
              </p>
              <table>
                <thead><tr><th>Concepto</th><th>Clave SAT</th><th>Fundamento</th><th className="num">CFDIs</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {data.retenciones.conceptos.length === 0 && (
                    <tr><td colSpan={5} className="muted">Sin retenciones en el periodo.</td></tr>
                  )}
                  {data.retenciones.conceptos.map((c) => (
                    <tr key={c.clave}>
                      <td style={{ fontSize: 13 }}>{c.nombre}</td>
                      <td className="mono">{c.clave}</td>
                      <td style={{ color: 'var(--ink-3)' }}>{c.fundamento}</td>
                      <td className="num">{c.comprobantes.toLocaleString('es-MX')}</td>
                      <td className="num">{mxn(c.monto)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600 }}>Total a enterar</td>
                    <td className="num" style={{ fontWeight: 600 }}>{mxn(data.retenciones.aEnterar)}</td>
                  </tr>
                </tbody>
              </table>
              {(data.retenciones.aFavor.iva > 0 || data.retenciones.aFavor.isr > 0) && (
                <div className="card-note">
                  Aparte, los clientes le retuvieron {mxn(data.retenciones.aFavor.iva)} de IVA y{' '}
                  {mxn(data.retenciones.aFavor.isr)} de ISR. Eso NO se entera: es un anticipo, y ya viene
                  acreditado en el IVA y el ISR de arriba.
                </div>
              )}
            </section>
          )}

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">Lo que sale del banco</div>
            <Fila label="IVA a pagar" valor={mxn(Math.max(data.iva.pagar, 0))} />
            <Fila label="ISR provisional" valor={mxn(Math.max(isrPagar ?? 0, 0))} />
            <Fila label="Retenciones enteradas" valor={mxn(data.retenciones?.aEnterar ?? 0)} />
            <Fila fuerte label="Total al SAT" valor={mxn(data.totalSat)} />
            <div className="card-note">
              Un saldo a favor de IVA no se resta aquí: se arrastra al mes siguiente, no reduce el ISR ni las
              retenciones. IMSS, INFONAVIT e ISN se pagan por separado y no entran en esta suma.
            </div>
          </section>

          <div className="urgent-list" style={{ marginTop: 16 }}>
            <div className="urgent-head">¿Qué falta para declarar?</div>
            {data.checklist.items.map((it) => (
              <div key={it.clave} className="urgent-row" style={{ cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="urgent-title">{it.titulo}</div>
                  <div className="kpi-sub" style={{ marginTop: 2 }}>{it.detalle}</div>
                </div>
                <span className={`badge ${BADGE[it.estado] ?? ''}`}>{ETIQUETA[it.estado] ?? it.estado}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

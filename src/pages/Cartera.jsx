import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const dias = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)

// Finanzas · Por cobrar / Por pagar (plan §4.5). Cada fila drillea al perfil
// 360° del contacto; REP pendiente con el matiz correcto de cada lado.
export default function Cartera() {
  const { activeCompany } = useAuth()
  const [lado, setLado] = useState('COBRAR')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null); setData(null)
    try {
      setData(await apiFetch(`/api/automotriz/cartera?companyId=${activeCompany.id}&lado=${lado}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id, lado])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div>
      <header className="page-head">
        <h1>Cartera</h1>
        <span className="glosa">
          {lado === 'COBRAR' ? 'lo que te deben, por contacto' : 'lo que le debes a tus proveedores, por contacto'}
        </span>
        <div className="head-actions">
          <div className="tabs" role="tablist">
            {[['COBRAR', 'Por cobrar'], ['PAGAR', 'Por pagar']].map(([k, etiqueta]) => (
              <span key={k} role="tab" tabIndex={0} aria-selected={lado === k}
                className={lado === k ? 'activo' : ''}
                onClick={() => setLado(k)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLado(k) } }}>
                {etiqueta}
              </span>
            ))}
          </div>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Cargando…</p>}
      {data && (
        <>
          <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="kpi-item">
              <span className="kpi-label">{lado === 'COBRAR' ? 'Saldo por cobrar' : 'Saldo por pagar'}</span>
              <span className="kpi">{mxn(data.resumen.saldoTotal)}</span>
              <span className="kpi-sub">{data.resumen.contactos} contactos con saldo</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Complementos pendientes</span>
              <span className={`kpi ${data.resumen.repPendienteTotal > 0 ? 'neg' : 'pos'}`}>{mxn(data.resumen.repPendienteTotal)}</span>
              <span className="kpi-sub">
                {lado === 'COBRAR' ? 'cobros PPD sin REP emitido (te toca emitir)' : 'pagos PPD sin REP del proveedor (riesgo de deducción)'}
              </span>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Contacto</th><th>RFC</th><th className="num">Facturas</th><th className="num">Facturado</th><th className="num">{lado === 'COBRAR' ? 'Cobrado' : 'Pagado'}</th><th className="num">Saldo</th><th className="num">REP pendiente</th><th className="num">Antigüedad</th></tr>
            </thead>
            <tbody>
              {data.filas.map((f) => (
                <tr key={f.customerId}>
                  <td style={{ fontSize: 13 }}><Link to={`/contactos/${f.customerId}`}>{f.razonSocial}</Link></td>
                  <td className="mono">{f.rfc}</td>
                  <td className="num">{f.facturas}</td>
                  <td className="num">{mxn(f.facturado)}</td>
                  <td className="num">{mxn(f.pagado)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{mxn(f.saldo)}</td>
                  <td className="num">{f.repPendiente > 1 ? <span className="neg">{mxn(f.repPendiente)}</span> : '—'}</td>
                  <td className="num">{f.masAntigua ? `${dias(f.masAntigua)} días` : '—'}</td>
                </tr>
              ))}
              {data.filas.length === 0 && (
                <tr><td colSpan={8} className="muted">Sin saldos pendientes. ✓</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

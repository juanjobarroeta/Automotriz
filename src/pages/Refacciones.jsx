import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'
import EtiquetasQr from '../components/EtiquetasQr'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

// Refacciones (fase 4): catálogo + kardex derivados de los CFDIs — compras de
// proveedor = entradas, ventas de mostrador/taller = salidas. El conteo físico
// (fase 4b) registra AJUSTEs por la diferencia contra lo derivado, y las
// etiquetas QR imprimen el número de parte escaneable para contar en anaquel.
export default function Refacciones() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [kardex, setKardex] = useState(null) // refacción expandida
  const [cfdiVista, setCfdiVista] = useState(null)
  const [conteo, setConteo] = useState(null) // null = modo normal; {} = contando (id → cantidad)
  const [resultadoConteo, setResultadoConteo] = useState(null)
  const [etiquetas, setEtiquetas] = useState(false)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ companyId: activeCompany.id, page: String(page) })
      if (q.trim()) qs.set('q', q.trim())
      setData(await apiFetch(`/api/automotriz/refacciones?${qs}`))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [activeCompany?.id, q, page])

  useEffect(() => {
    const t = setTimeout(cargar, q ? 300 : 0) // debounce de búsqueda
    return () => clearTimeout(t)
  }, [cargar, q])

  const verKardex = async (r) => {
    if (kardex?.id === r.id) { setKardex(null); return }
    setError(null)
    try { setKardex(await apiFetch(`/api/automotriz/refacciones/${r.id}`)) }
    catch (err) { setError(err.message) }
  }

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const contando = conteo != null
  const conCantidad = contando ? Object.values(conteo).filter((v) => v !== '').length : 0

  const registrarConteo = async () => {
    const items = Object.entries(conteo)
      .filter(([, v]) => v !== '')
      .map(([refaccionId, v]) => ({ refaccionId, cantidadContada: Number(v) }))
    if (!items.length) return
    setBusy(true); setError(null)
    try {
      const r = await apiFetch('/api/automotriz/refacciones/conteo', {
        method: 'POST',
        body: { companyId: activeCompany.id, items },
      })
      setResultadoConteo(r)
      setConteo(null)
      await cargar()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}
      {etiquetas && data && <EtiquetasQr refacciones={data.refacciones} onCerrar={() => setEtiquetas(false)} />}
      <header className="page-head">
        <h1>Refacciones</h1>
        <div className="head-actions" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Buscar número de parte o descripción…" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }} style={{ minWidth: 300 }} />
          <button className={contando ? '' : 'ghost'} onClick={() => { setResultadoConteo(null); setConteo(contando ? null : {}) }}>
            {contando ? 'Salir del conteo' : 'Conteo físico'}
          </button>
          <button className="ghost" disabled={!data?.refacciones?.length} onClick={() => setEtiquetas(true)}>Etiquetas QR</button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {contando && (
        <div className="card" style={{ marginBottom: 14, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            <b>Conteo físico:</b> escanea o busca la parte, teclea lo contado y registra — se genera un movimiento
            AJUSTE por la diferencia contra el kardex derivado. Las partes sin cantidad no se tocan.
          </p>
          <div className="head-actions" style={{ marginTop: 8 }}>
            <button disabled={busy || conCantidad === 0} onClick={registrarConteo}>Registrar conteo ({conCantidad})</button>
          </div>
        </div>
      )}
      {resultadoConteo && (
        <div className="card" style={{ marginBottom: 14, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            ✅ Conteo registrado: {resultadoConteo.contadas} parte(s) — {resultadoConteo.ajustadas} con ajuste,{' '}
            {resultadoConteo.sinDiferencia} sin diferencia.
          </p>
          {resultadoConteo.ajustes.length > 0 && (
            <table style={{ marginTop: 8, fontSize: 12 }}>
              <thead><tr><th>Parte</th><th className="num">Derivada</th><th className="num">Contada</th><th className="num">Ajuste</th></tr></thead>
              <tbody>
                {resultadoConteo.ajustes.map((a) => (
                  <tr key={a.refaccionId}>
                    <td className="mono" style={{ fontSize: 11 }}>{a.numeroParte}</td>
                    <td className="num">{a.existencia}</td>
                    <td className="num">{a.contada}</td>
                    <td className={`num ${a.ajuste < 0 ? 'neg' : ''}`}>{a.ajuste > 0 ? `+${a.ajuste}` : a.ajuste}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {loading && !data ? <p className="muted">Cargando catálogo…</p> : data && (
        <>
          <p className="muted">{data.total.toLocaleString('es-MX')} parte(s){q ? ' encontradas' : ' en el catálogo'} · página {data.page} de {totalPaginas}</p>
          <table>
            <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Existencia</th>{contando && <th className="num">Contada</th>}<th className="num">Último costo</th><th className="num">Último precio</th><th className="num">Valor inv.</th><th className="num">Movs.</th></tr></thead>
            <tbody>
              {data.refacciones.map((r) => (
                <>
                  <tr key={r.id} onClick={() => !contando && verKardex(r)} style={{ cursor: contando ? 'default' : 'pointer' }}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.numeroParte}</td>
                    <td>{r.descripcion}</td>
                    <td className={`num ${r.existencia < 0 ? 'neg' : ''}`}>{r.existencia}</td>
                    {contando && (
                      <td className="num">
                        <input type="number" min="0" step="1" placeholder="—" value={conteo[r.id] ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setConteo((c) => ({ ...c, [r.id]: e.target.value }))}
                          style={{ width: 80, textAlign: 'right' }} />
                      </td>
                    )}
                    <td className="num">{mxn(r.ultimoCosto)}</td>
                    <td className="num">{mxn(r.ultimoPrecio)}</td>
                    <td className="num">{r.valorInventario > 0 ? mxn(r.valorInventario) : '—'}</td>
                    <td className="num">{r.movimientos}</td>
                  </tr>
                  {kardex?.id === r.id && (
                    <tr key={`${r.id}-kardex`}>
                      <td colSpan={contando ? 8 : 7} style={{ background: 'var(--bg-row-hairline)' }}>
                        <strong style={{ fontSize: 12 }}>Kardex — existencia {kardex.existencia}</strong>
                        <table style={{ marginTop: 6 }}>
                          <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">$ unitario</th><th>CFDI</th></tr></thead>
                          <tbody>
                            {kardex.movimientos.map((m) => (
                              <tr key={m.id}>
                                <td>{fecha(m.fecha)}</td>
                                <td><span className={`badge ${m.tipo === 'ENTRADA_COMPRA' ? 'badge-DISPONIBLE' : m.tipo === 'SALIDA_VENTA' ? 'badge-APARTADO' : 'badge-ENTREGADO'}`}>{m.tipo.replaceAll('_', ' ')}</span></td>
                                <td className={`num ${m.cantidad < 0 ? 'neg' : ''}`}>{m.cantidad}</td>
                                <td className="num">{mxn(m.montoUnitario)}</td>
                                <td>{m.invoice ? (
                                  <button className="ghost" style={{ padding: '1px 8px', fontSize: 11 }}
                                    onClick={(e) => { e.stopPropagation(); setCfdiVista(m.invoice.id) }}>
                                    {[m.invoice.serie, m.invoice.folio].filter(Boolean).join('-') || 'Ver'}
                                  </button>
                                ) : <span className="muted">ajuste</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {data.refacciones.length === 0 && <tr><td colSpan={contando ? 8 : 7} className="muted">Sin partes{q ? ' con esa búsqueda' : ' aún — corre el backfill de refacciones'}.</td></tr>}
            </tbody>
          </table>
          {totalPaginas > 1 && (
            <div className="head-actions" style={{ marginTop: 12 }}>
              <button className="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
              <button className="ghost" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

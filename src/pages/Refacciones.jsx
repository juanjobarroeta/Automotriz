import { Fragment, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'
import EtiquetasQr from '../components/EtiquetasQr'
import { AvisoError } from '../components/Estados'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

// Tipos de movimiento del kardex → par de color del §2: entrada = ok,
// salida = warn, ajuste = neutral (así los pinta el mockup).
const MOV_BADGE = {
  ENTRADA_COMPRA: 'badge-DISPONIBLE',
  SALIDA_VENTA: 'badge-APARTADO',
  AJUSTE: 'badge-ENTREGADO',
}

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

  // Franja de KPIs: el catálogo completo da el total; el resto se resume sobre
  // la página cargada (el endpoint pagina, no trae agregados globales).
  const enPagina = data?.refacciones ?? []
  const valorPagina = enPagina.reduce((s, r) => s + (r.valorInventario || 0), 0)
  const negativas = enPagina.filter((r) => r.existencia < 0).length
  const movsPagina = enPagina.reduce((s, r) => s + (r.movimientos || 0), 0)

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
        <span className="glosa">Catálogo y kardex derivados de los CFDI</span>
        <div className="head-actions" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Buscar número de parte o descripción…" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }} style={{ minWidth: 300 }} />
          <button className="ghost" onClick={() => { setResultadoConteo(null); setConteo(contando ? null : {}) }}>
            {contando ? 'Salir del conteo' : 'Conteo físico'}
          </button>
          <button className="ghost" disabled={!data?.refacciones?.length} onClick={() => setEtiquetas(true)}>Etiquetas QR</button>
        </div>
      </header>
      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}
      {data && (
        <div className="kpi-strip densa">
          <div className="kpi-item">
            <span className="kpi-label">Partes en el catálogo</span>
            <span className="kpi">{data.total.toLocaleString('es-MX')}</span>
            <span className="kpi-sub">derivadas de los CFDI de proveedor</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-label">Valor de inventario</span>
            <span className="kpi">{mxn(valorPagina)}</span>
            <span className="kpi-sub">a último costo conocido · en esta página</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-label">Existencia negativa</span>
            <span className={`kpi${negativas > 0 ? ' neg' : ''}`}>{negativas}</span>
            <span className="kpi-sub">{negativas > 0 ? 'revisar kardex o hacer conteo' : 'sin partes en negativo en esta página'}</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-label">Movimientos</span>
            <span className="kpi">{movsPagina.toLocaleString('es-MX')}</span>
            <span className="kpi-sub">de las partes de esta página</span>
          </div>
        </div>
      )}
      {contando && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><span>Conteo físico</span></div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Escanea o busca la parte, teclea lo contado y registra — se genera un movimiento AJUSTE por la
            diferencia contra el kardex derivado. Las partes sin cantidad no se tocan.
          </p>
          <button disabled={busy || conCantidad === 0} onClick={registrarConteo}>Registrar conteo ({conCantidad})</button>
        </section>
      )}
      {resultadoConteo && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><span>Conteo registrado</span></div>
          <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {resultadoConteo.contadas} parte(s) — {resultadoConteo.ajustadas} con ajuste,{' '}
            {resultadoConteo.sinDiferencia} sin diferencia.
          </p>
          {resultadoConteo.ajustes.length > 0 && (
            <table>
              <thead><tr><th>Parte</th><th className="num">Derivada</th><th className="num">Contada</th><th className="num">Ajuste</th></tr></thead>
              <tbody>
                {resultadoConteo.ajustes.map((a) => (
                  <tr key={a.refaccionId}>
                    <td className="mono">{a.numeroParte}</td>
                    <td className="num">{a.existencia}</td>
                    <td className="num">{a.contada}</td>
                    <td className={`num ${a.ajuste < 0 ? 'neg' : ''}`}>{a.ajuste > 0 ? `+${a.ajuste}` : a.ajuste}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {loading && !data ? <p className="muted">Cargando catálogo…</p> : data && (
        <>
          <p className="muted" style={{ margin: '0 0 10px' }}>{data.total.toLocaleString('es-MX')} parte(s){q ? ' encontradas' : ' en el catálogo'} · página {data.page} de {totalPaginas}</p>
          <table>
            <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Existencia</th>{contando && <th className="num">Contada</th>}<th className="num">Último costo</th><th className="num">Último precio</th><th className="num">Valor inv.</th><th className="num">Movs.</th></tr></thead>
            <tbody>
              {data.refacciones.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => !contando && verKardex(r)} style={{ cursor: contando ? 'default' : 'pointer' }}>
                    <td className="mono">{r.numeroParte}</td>
                    <td style={{ fontSize: 13 }}>{r.descripcion}</td>
                    <td className={`num ${r.existencia < 0 ? 'neg' : ''}`}>{r.existencia}</td>
                    {contando && (
                      <td className="num">
                        <input type="number" min="0" step="1" placeholder="—" value={conteo[r.id] ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setConteo((c) => ({ ...c, [r.id]: e.target.value }))}
                          style={{ width: 80, textAlign: 'right' }} />
                      </td>
                    )}
                    <td className="num" style={{ color: 'var(--ink-3)' }}>{mxn(r.ultimoCosto)}</td>
                    <td className="num" style={{ color: 'var(--ink-3)' }}>{mxn(r.ultimoPrecio)}</td>
                    <td className="num">{r.valorInventario > 0 ? mxn(r.valorInventario) : '—'}</td>
                    <td className="num" style={{ color: 'var(--muted-2)' }}>{r.movimientos}</td>
                  </tr>
                  {kardex?.id === r.id && (
                    <tr>
                      <td colSpan={contando ? 8 : 7} style={{ background: 'var(--surface-subtle)', padding: '16px 20px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
                          Kardex · <span className="mono">{r.numeroParte}</span> — existencia {kardex.existencia}
                        </div>
                        <table style={{ background: 'var(--surface)' }}>
                          <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">$ unitario</th><th>CFDI</th></tr></thead>
                          <tbody>
                            {kardex.movimientos.map((m) => (
                              <tr key={m.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{fecha(m.fecha)}</td>
                                <td><span className={`badge ${MOV_BADGE[m.tipo] ?? 'badge-neutral'}`} style={{ whiteSpace: 'nowrap' }}>{m.tipo.replaceAll('_', ' ')}</span></td>
                                <td className={`num ${m.cantidad < 0 ? 'neg' : ''}`}>{m.cantidad}</td>
                                <td className="num" style={{ color: 'var(--ink-3)' }}>{mxn(m.montoUnitario)}</td>
                                <td>{m.invoice ? (
                                  <button className="ghost" style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6 }}
                                    onClick={(e) => { e.stopPropagation(); setCfdiVista(m.invoice.id) }}>
                                    <span className="mono">{[m.invoice.serie, m.invoice.folio].filter(Boolean).join('-') || 'Ver'}</span>
                                  </button>
                                ) : <span className="muted">conteo físico</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.5 }}>
            El kardex se deriva de los CFDI: compras de proveedor son entradas, ventas de mostrador y salidas a
            orden de servicio son salidas. El conteo físico registra un AJUSTE por la diferencia.
          </p>
        </>
      )}
    </div>
  )
}

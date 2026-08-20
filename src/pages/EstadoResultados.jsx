import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const per = (p) => `${MESES[p.mes - 1]} ${p.anio}`
const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—')

// Los meses que van DESPUÉS del último presentado y hasta hoy: existen en el
// ledger derivado pero el contador todavía no los declara.
function mesesPreliminares(ultimo) {
  if (!ultimo) return []
  const hoy = new Date()
  const out = []
  let { anio, mes } = ultimo
  for (;;) {
    mes === 12 ? ((anio += 1), (mes = 1)) : (mes += 1)
    if (anio > hoy.getUTCFullYear() || (anio === hoy.getUTCFullYear() && mes > hoy.getUTCMonth() + 1)) break
    out.push({ anio, mes, preliminar: true })
  }
  return out
}

// Estado de resultados con lo DECLARADO como columna vertebral: el número que
// ya reconoce el SAT manda, y lo derivado de los CFDIs va al lado como
// evidencia — hasta poder abrir el comprobante que sostiene cada renglón.
export default function EstadoResultados() {
  const { activeCompany } = useAuth()
  const [periodos, setPeriodos] = useState([])
  const [sel, setSel] = useState(null)
  const [ytd, setYtd] = useState(false)
  const [er, setEr] = useState(null)
  const [abierto, setAbierto] = useState(() => new Set(['ingresos']))
  const [docs, setDocs] = useState(null)     // { cuenta, nombre, data }
  const [comprobante, setComprobante] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeCompany?.id) return
    setError(null)
    apiFetch(`/api/contabilidad/ce-serie?companyId=${activeCompany.id}&periodos=1`)
      .then((d) => {
        const presentados = (d.periodos ?? []).map((p) => ({ ...p, preliminar: false }))
        const todos = [...presentados, ...mesesPreliminares(presentados[presentados.length - 1])]
        setPeriodos(todos)
        if (todos.length > 0) setSel(todos[todos.length - 1])
        else setLoading(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [activeCompany?.id])

  const cargar = useCallback(async () => {
    if (!activeCompany?.id || !sel) return
    setLoading(true); setError(null); setDocs(null); setComprobante(null)
    try {
      setEr(await apiFetch(
        `/api/contabilidad/ce-estado-resultados?companyId=${activeCompany.id}&anio=${sel.anio}&mes=${sel.mes}${ytd ? '&ytd=1' : ''}`,
      ))
    } catch (err) { setError(err.message); setEr(null) } finally { setLoading(false) }
  }, [activeCompany?.id, sel, ytd])

  useEffect(() => { cargar() }, [cargar])

  const abrirCuenta = async (numCta, nombre) => {
    setError(null); setComprobante(null)
    setDocs({ cuenta: numCta, nombre, data: null })
    try {
      const data = await apiFetch(
        `/api/contabilidad/cuenta-documentos?companyId=${activeCompany.id}&cuenta=${encodeURIComponent(numCta)}` +
        `&anio=${sel.anio}&mes=${sel.mes}${ytd ? '&ytd=1' : ''}`,
      )
      setDocs({ cuenta: numCta, nombre, data })
    } catch (err) { setError(err.message); setDocs(null) }
  }

  const abrirComprobante = async (inv) => {
    setError(null)
    setComprobante({ cargando: true, invoice: inv })
    try {
      const rep = await apiFetch(`/api/facturas/${inv.id}/representacion`)
      setComprobante({ cargando: false, invoice: inv, rep })
    } catch (err) { setError(err.message); setComprobante(null) }
  }

  const toggle = (clave) => {
    setAbierto((prev) => {
      const s = new Set(prev)
      s.has(clave) ? s.delete(clave) : s.add(clave)
      return s
    })
  }

  const presentado = er?.presentado ?? false
  const cifra = (r) => (presentado ? r.declarado : r.derivado)

  const kpis = useMemo(() => {
    if (!er) return null
    const ing = er.rubros.find((r) => r.clave === 'ingresos')
    return {
      ingresos: ing ? cifra(ing) : 0,
      bruta: presentado ? er.utilidadBruta.declarado : er.utilidadBruta.derivado,
      resultado: presentado ? er.resultado.declarado : er.resultado.derivado,
      diferencia: er.resultado.diferencia,
    }
  }, [er, presentado])

  return (
    <div>
      <header className="page-head">
        <h1>Estado de resultados</h1>
        <span className="glosa">
          {presentado
            ? 'lo declarado al SAT manda; lo derivado de los CFDIs va al lado, como evidencia'
            : 'este mes aún no se declara — lo que ves es lo derivado de tus CFDIs, preliminar'}
        </span>
        <div className="head-actions">
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={ytd} onChange={(e) => setYtd(e.target.checked)} />
            acumulado del año
          </label>
          {periodos.length > 0 && sel && (
            <select
              value={`${sel.anio}-${sel.mes}`}
              onChange={(e) => {
                const [anio, mes] = e.target.value.split('-').map(Number)
                setSel(periodos.find((p) => p.anio === anio && p.mes === mes) ?? { anio, mes })
              }}
              style={{ width: 'auto' }}
            >
              {periodos.map((p) => (
                <option key={`${p.anio}-${p.mes}`} value={`${p.anio}-${p.mes}`}>
                  {per(p)}{p.preliminar ? ' · preliminar' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo el estado de resultados…</p>}
      {!loading && periodos.length === 0 && (
        <p className="muted">Esta empresa no tiene contabilidad electrónica importada todavía.</p>
      )}

      {er && !presentado && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--warn, #b07219)' }}>
          <strong>Preliminar.</strong>{' '}
          <span className="muted">
            {per(sel)} todavía no se presenta al SAT. Estas cifras salen de tus CFDIs y dicen dónde
            va a cerrar el mes — no son la declaración.
          </span>
        </div>
      )}

      {kpis && (
        <div className="kpi-strip densa">
          <div className="kpi-item">
            <div className="kpi-label">Ingresos</div>
            <div className="kpi">{mxn(kpis.ingresos)}</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Utilidad bruta</div>
            <div className="kpi">{mxn(kpis.bruta)}</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Resultado</div>
            <div className="kpi">{mxn(kpis.resultado)}</div>
            {presentado && (
              <div className="kpi-sub">{mxn(er.resultado.derivado)} derivado · {mxn(kpis.diferencia)} de diferencia</div>
            )}
          </div>
        </div>
      )}

      {/* ── El estado: rubro → cuenta ── */}
      {er && (
        <section className="card">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>{presentado ? 'Declarado' : 'Derivado'}</th>
                  {presentado && <th style={{ textAlign: 'right' }}>Derivado</th>}
                  {presentado && <th style={{ textAlign: 'right' }}>Diferencia</th>}
                </tr>
              </thead>
              <tbody>
                {er.rubros.map((r) => (
                  <Fragment key={r.clave}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggle(r.clave)}>
                      <td style={{ fontWeight: 600 }}>
                        <span className="muted" style={{ marginRight: 6 }}>{abierto.has(r.clave) ? '▾' : '▸'}</span>
                        {r.titulo}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{mxn(cifra(r))}</td>
                      {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(r.derivado)}</td>}
                      {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(r.diferencia)}</td>}
                    </tr>
                    {abierto.has(r.clave) && r.cuentas.map((c) => (
                      <tr key={c.numCta} style={{ cursor: 'pointer' }} onClick={() => abrirCuenta(c.numCta, c.nombre)}>
                        <td style={{ paddingLeft: 28 }}>
                          <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.numCta}</span>{' '}
                          {c.nombre}
                        </td>
                        <td style={{ textAlign: 'right' }}>{mxn(presentado ? c.declarado : c.derivado)}</td>
                        {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(c.derivado)}</td>}
                        {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(c.diferencia)}</td>}
                      </tr>
                    ))}
                    {abierto.has(r.clave) && r.clave === 'costos' && (
                      <tr>
                        <td style={{ fontWeight: 600 }}>Utilidad bruta</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {mxn(presentado ? er.utilidadBruta.declarado : er.utilidadBruta.derivado)}
                        </td>
                        {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(er.utilidadBruta.derivado)}</td>}
                        {presentado && <td />}
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Resultado</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {mxn(presentado ? er.resultado.declarado : er.resultado.derivado)}
                  </td>
                  {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(er.resultado.derivado)}</td>}
                  {presentado && <td style={{ textAlign: 'right' }} className="muted">{mxn(er.resultado.diferencia)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Haz clic en una cuenta para ver los comprobantes que la forman.
          </p>
        </section>
      )}

      {/* ── Los documentos de una cuenta ── */}
      {docs && (
        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{docs.cuenta}</span>
              {docs.nombre && <span className="muted" style={{ fontWeight: 400 }}> · {docs.nombre}</span>}
            </h2>
            <button type="button" className="ghost" onClick={() => { setDocs(null); setComprobante(null) }}>Cerrar</button>
          </div>
          {!docs.data && <p className="muted">Buscando los comprobantes…</p>}
          {docs.data && (
            <>
              <p className="muted" style={{ marginTop: 4 }}>
                {docs.data.total.toLocaleString('es-MX')} asiento(s) · neto {mxn(docs.data.neto)}
                {docs.data.mostrados < docs.data.total && ` · mostrando los ${docs.data.mostrados} más recientes`}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Comprobante</th>
                      <th>Contraparte</th>
                      <th style={{ textAlign: 'right' }}>Importe</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.data.documentos.map((d) => (
                      <tr key={d.id}>
                        <td>{fecha(d.fecha)}</td>
                        <td>
                          {d.invoice
                            ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{[d.invoice.serie, d.invoice.folio].filter(Boolean).join('-') || d.invoice.uuid?.slice(0, 8)}</span>
                            : <span className="muted">{d.descripcion || d.fuente}</span>}
                        </td>
                        <td>
                          {d.invoice?.customerId
                            ? <Link to={`/contactos/${d.invoice.customerId}`}>{d.invoice.contraparteNombre || d.invoice.contraparteRfc}</Link>
                            : (d.invoice?.contraparteNombre || d.invoice?.contraparteRfc || <span className="muted">—</span>)}
                        </td>
                        <td style={{ textAlign: 'right' }}>{mxn(d.monto)}</td>
                        <td>
                          {d.invoice?.representable && (
                            <button type="button" className="ghost" onClick={() => abrirComprobante(d.invoice)}>Ver</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── El comprobante ── */}
      {comprobante && (
        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Comprobante</h2>
            <button type="button" className="ghost" onClick={() => setComprobante(null)}>Cerrar</button>
          </div>
          {comprobante.cargando && <p className="muted">Armando la representación del XML…</p>}
          {comprobante.rep && <Representacion rep={comprobante.rep} />}
        </section>
      )}
    </div>
  )
}

// La representación impresa se arma del XML guardado: la descarga masiva del
// SAT no trae PDF, así que ésta ES la forma legible del comprobante.
function Representacion({ rep }) {
  const c = rep?.representacion ?? rep
  if (!c) return <p className="muted">Sin datos del comprobante.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Campo etiqueta="Emisor" valor={`${c.emisor?.nombre ?? ''} ${c.emisor?.rfc ? `(${c.emisor.rfc})` : ''}`} />
        <Campo etiqueta="Receptor" valor={`${c.receptor?.nombre ?? ''} ${c.receptor?.rfc ? `(${c.receptor.rfc})` : ''}`} />
        <Campo etiqueta="Folio fiscal" valor={rep?.uuid ?? c.uuid} mono />
        <Campo etiqueta="Fecha" valor={c.fecha} />
        <Campo etiqueta="Forma de pago" valor={c.formaPago} />
        <Campo etiqueta="Método de pago" valor={c.metodoPago} />
      </div>
      {c.conceptos?.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {c.conceptos.map((x, i) => (
                <tr key={i}>
                  <td>{x.descripcion}</td>
                  <td style={{ textAlign: 'right' }}>{x.cantidad}</td>
                  <td style={{ textAlign: 'right' }}>{mxn(x.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
        <Campo etiqueta="Subtotal" valor={mxn(c.subtotal)} />
        <Campo etiqueta="Total" valor={mxn(c.total)} />
      </div>
    </div>
  )
}

function Campo({ etiqueta, valor, mono }) {
  return (
    <div>
      <div className="kpi-label">{etiqueta}</div>
      <div style={mono ? { fontVariantNumeric: 'tabular-nums', fontSize: '.9em' } : undefined}>{valor || '—'}</div>
    </div>
  )
}

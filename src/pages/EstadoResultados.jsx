import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { construirPdfCfdi } from '../lib/cfdiPdf'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const per = (p) => `${MESES[p.mes - 1]} ${p.anio}`
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—')
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

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
// evidencia. Todo vive en UNA tabla que se abre hacia adentro —rubro, cuenta,
// comprobante— porque mandar al usuario a otra caja al fondo de la pantalla le
// hace perder el renglón que venía siguiendo.
export default function EstadoResultados() {
  const { activeCompany } = useAuth()
  const [periodos, setPeriodos] = useState([])
  const [sel, setSel] = useState(null)
  const [ytd, setYtd] = useState(false)
  const [codigos, setCodigos] = useState(false)
  const [er, setEr] = useState(null)
  const [rubrosAbiertos, setRubrosAbiertos] = useState(() => new Set(['ingresos']))
  const [cuentas, setCuentas] = useState({})       // numCta → { cargando, data }
  const [comprobantes, setComprobantes] = useState({}) // invoiceId → { cargando, rep }
  const [docAbierto, setDocAbierto] = useState(null)
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
    setLoading(true); setError(null)
    setCuentas({}); setComprobantes({}); setDocAbierto(null)
    try {
      setEr(await apiFetch(
        `/api/contabilidad/ce-estado-resultados?companyId=${activeCompany.id}&anio=${sel.anio}&mes=${sel.mes}${ytd ? '&ytd=1' : ''}`,
      ))
    } catch (err) { setError(err.message); setEr(null) } finally { setLoading(false) }
  }, [activeCompany?.id, sel, ytd])

  useEffect(() => { cargar() }, [cargar])

  const toggleRubro = (clave) => setRubrosAbiertos((prev) => {
    const s = new Set(prev)
    s.has(clave) ? s.delete(clave) : s.add(clave)
    return s
  })

  // La cuenta se abre DENTRO de la tabla y sus comprobantes se quedan cargados:
  // volver a cerrarla y abrirla no vuelve a pedirlos.
  const toggleCuenta = async (numCta) => {
    const actual = cuentas[numCta]
    if (actual) {
      setCuentas((c) => ({ ...c, [numCta]: { ...actual, abierta: !actual.abierta } }))
      return
    }
    setCuentas((c) => ({ ...c, [numCta]: { cargando: true, abierta: true } }))
    try {
      const data = await apiFetch(
        `/api/contabilidad/cuenta-documentos?companyId=${activeCompany.id}&cuenta=${encodeURIComponent(numCta)}` +
        `&anio=${sel.anio}&mes=${sel.mes}${ytd ? '&ytd=1' : ''}`,
      )
      setCuentas((c) => ({ ...c, [numCta]: { cargando: false, abierta: true, data } }))
    } catch (err) {
      setError(err.message)
      setCuentas((c) => { const n = { ...c }; delete n[numCta]; return n })
    }
  }

  const toggleComprobante = async (inv) => {
    if (docAbierto === inv.id) { setDocAbierto(null); return }
    setDocAbierto(inv.id)
    if (comprobantes[inv.id]) return
    setComprobantes((c) => ({ ...c, [inv.id]: { cargando: true } }))
    try {
      const r = await apiFetch(`/api/facturas/${inv.id}/representacion`)
      setComprobantes((c) => ({ ...c, [inv.id]: { cargando: false, ...r } }))
    } catch (err) {
      setError(err.message)
      setComprobantes((c) => ({ ...c, [inv.id]: { cargando: false, error: err.message } }))
    }
  }

  const presentado = er?.presentado ?? false
  const cols = presentado ? 4 : 2
  const cifra = (r) => (presentado ? r.declarado : r.derivado)

  const kpis = useMemo(() => {
    if (!er) return null
    const ing = er.rubros.find((r) => r.clave === 'ingresos')
    return {
      ingresos: ing ? cifra(ing) : 0,
      bruta: presentado ? er.utilidadBruta.declarado : er.utilidadBruta.derivado,
      resultado: presentado ? er.resultado.declarado : er.resultado.derivado,
    }
  }, [er, presentado])

  return (
    <div>
      <header className="page-head">
        <h1>Estado de resultados</h1>
        <span className="glosa">
          {presentado
            ? 'lo declarado al SAT manda; los CFDIs lo sostienen'
            : 'aún sin declarar — derivado de tus CFDIs'}
        </span>
        <div className="head-actions" style={{ alignSelf: 'center' }}>
          <div style={{ display: 'flex' }}>
            <button
              type="button"
              className={ytd ? 'ghost' : undefined}
              onClick={() => setYtd(false)}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >Mes</button>
            <button
              type="button"
              className={ytd ? undefined : 'ghost'}
              onClick={() => setYtd(true)}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}
            >Año</button>
          </div>
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
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Preliminar.</strong>{' '}
          <span className="muted">
            {sel && per(sel)} todavía no se presenta al SAT. Estas cifras salen de tus CFDIs y dicen
            dónde va a cerrar el mes — no son la declaración.
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
            {presentado && <div className="kpi-sub">{mxn(er.resultado.derivado)} derivado</div>}
          </div>
        </div>
      )}

      {er && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button type="button" className="ghost" onClick={() => setCodigos((v) => !v)}>
              {codigos ? 'Ocultar códigos' : 'Ver códigos de cuenta'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th style={num}>{presentado ? 'Declarado' : 'Derivado'}</th>
                  {presentado && <th style={num}>Derivado</th>}
                  {presentado && <th style={num}>Diferencia</th>}
                </tr>
              </thead>
              <tbody>
                {er.rubros.map((r) => (
                  <Fragment key={r.clave}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleRubro(r.clave)}>
                      <td style={{ fontWeight: 600 }}>
                        <Chevron abierto={rubrosAbiertos.has(r.clave)} />{r.titulo}
                      </td>
                      <td style={{ ...num, fontWeight: 600 }}>{mxn(cifra(r))}</td>
                      {presentado && <td style={num} className="muted">{mxn(r.derivado)}</td>}
                      {presentado && <td style={num} className="muted">{mxn(r.diferencia)}</td>}
                    </tr>

                    {rubrosAbiertos.has(r.clave) && r.cuentas.map((c) => {
                      const est = cuentas[c.numCta]
                      const abierta = !!est?.abierta
                      return (
                        <Fragment key={c.numCta}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => toggleCuenta(c.numCta)}>
                            <td style={{ paddingLeft: 26 }}>
                              <Chevron abierto={abierta} />
                              {c.nombre || c.numCta}
                              {codigos && (
                                <span className="muted" style={{ marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
                                  {c.numCta}
                                </span>
                              )}
                            </td>
                            <td style={num}>{mxn(presentado ? c.declarado : c.derivado)}</td>
                            {presentado && <td style={num} className="muted">{mxn(c.derivado)}</td>}
                            {presentado && <td style={num} className="muted">{mxn(c.diferencia)}</td>}
                          </tr>

                          {abierta && est?.cargando && (
                            <tr><td colSpan={cols} style={{ paddingLeft: 52 }} className="muted">Buscando los comprobantes…</td></tr>
                          )}

                          {abierta && est?.data && (
                            <tr>
                              <td colSpan={cols} style={{ padding: 0 }}>
                                <Documentos
                                  cuenta={c}
                                  data={est.data}
                                  codigos={codigos}
                                  docAbierto={docAbierto}
                                  comprobantes={comprobantes}
                                  onVer={toggleComprobante}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}

                    {rubrosAbiertos.has(r.clave) && r.clave === 'costos' && (
                      <tr>
                        <td style={{ fontWeight: 600 }}>Utilidad bruta</td>
                        <td style={{ ...num, fontWeight: 600 }}>
                          {mxn(presentado ? er.utilidadBruta.declarado : er.utilidadBruta.derivado)}
                        </td>
                        {presentado && <td style={num} className="muted">{mxn(er.utilidadBruta.derivado)}</td>}
                        {presentado && <td />}
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Resultado</td>
                  <td style={{ ...num, fontWeight: 700 }}>
                    {mxn(presentado ? er.resultado.declarado : er.resultado.derivado)}
                  </td>
                  {presentado && <td style={num} className="muted">{mxn(er.resultado.derivado)}</td>}
                  {presentado && <td style={num} className="muted">{mxn(er.resultado.diferencia)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Chevron({ abierto }) {
  return <span className="muted" style={{ marginRight: 6, display: 'inline-block', width: 10 }}>{abierto ? '▾' : '▸'}</span>
}

// Los comprobantes de una cuenta, anidados bajo su renglón — no en otra caja.
function Documentos({ cuenta, data, codigos, docAbierto, comprobantes, onVer }) {
  return (
    <div style={{ paddingLeft: 52, paddingRight: 8, paddingBottom: 10 }}>
      <p className="muted" style={{ margin: '2px 0 8px' }}>
        {codigos && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cuenta.numCta} · </span>}
        {data.total.toLocaleString('es-MX')} movimiento(s) · neto {mxn(data.neto)}
        {data.mostrados < data.total && ` · los ${data.mostrados} más recientes`}
      </p>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Comprobante</th>
            <th>Contraparte</th>
            <th style={num}>Importe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.documentos.map((d) => {
            const inv = d.invoice
            const abierto = inv && docAbierto === inv.id
            return (
              <Fragment key={d.id}>
                <tr>
                  <td style={{ whiteSpace: 'nowrap' }}>{dia(d.fecha)}</td>
                  <td>
                    {inv
                      ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {[inv.serie, inv.folio].filter(Boolean).join('-') || (inv.uuid ?? '').slice(0, 8)}
                        </span>
                      : <span className="muted">{d.descripcion || d.fuente}</span>}
                  </td>
                  <td>
                    {inv?.customerId
                      ? <Link to={`/contactos/${inv.customerId}`} onClick={(e) => e.stopPropagation()}>
                          {inv.contraparteNombre || inv.contraparteRfc}
                        </Link>
                      : (inv?.contraparteNombre || inv?.contraparteRfc || <span className="muted">—</span>)}
                  </td>
                  <td style={num}>{mxn(d.monto)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {inv?.representable && (
                      <button type="button" className="ghost" onClick={() => onVer(inv)}>
                        {abierto ? 'Ocultar' : 'Ver'}
                      </button>
                    )}
                  </td>
                </tr>
                {abierto && (
                  <tr>
                    <td colSpan={5} style={{ background: 'var(--surface-row)' }}>
                      <Comprobante estado={comprobantes[inv.id]} invoice={inv} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// El XML es el comprobante; lo demás son formas de leerlo. Se baja tal como lo
// guardó el SAT y con su folio fiscal por nombre, para que se archive sin
// renombrar. Va por fetch y no por <a href> porque el hub pide el token en el
// encabezado y una liga no lo lleva.
async function descargarXml(invoice, setFallo) {
  try {
    const xml = await apiFetch(`/api/facturas/${invoice.id}/download?format=xml`)
    const blob = new Blob([typeof xml === 'string' ? xml : String(xml)], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoice.uuid ?? invoice.id}.xml`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    setFallo(err.message)
  }
}

// El comprobante, a la vista. Nadie imprime desde una página web, así que en
// vez de una lectura en HTML y un botón de imprimir se arma el PDF y se enseña
// tal cual va a quedar; el mismo blob que se ve es el que se descarga.
//
// El PDF se genera en el navegador porque no hay ninguno que pedir: estos CFDIs
// llegaron por descarga masiva y nunca pasaron por un PAC. El XML sí existe, y
// es el comprobante de verdad — por eso baja junto al PDF.
function Comprobante({ estado, invoice }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [fallo, setFallo] = useState(null)

  useEffect(() => {
    let vivo = true
    let creada = null
    setPdfUrl(null); setFallo(null)
    if (estado?.representacion) {
      construirPdfCfdi(estado, invoice)
        .then((blob) => {
          if (!vivo) return
          creada = URL.createObjectURL(blob)
          setPdfUrl(creada)
        })
        .catch((err) => { if (vivo) setFallo(err.message) })
    }
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [estado, invoice])

  if (!estado || estado.cargando) return <p className="muted" style={{ margin: 8 }}>Armando el comprobante…</p>
  if (estado.error) return <p className="muted" style={{ margin: 8 }}>No se pudo leer el comprobante: {estado.error}</p>
  if (!estado.representacion) return <p className="muted" style={{ margin: 8 }}>Este movimiento no tiene XML guardado.</p>

  const descargar = (url, nombre) => {
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const base = invoice?.uuid ?? invoice?.id

  return (
    <div style={{ display: 'grid', gap: 8, padding: '10px 4px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="ghost" disabled={!pdfUrl} onClick={() => descargar(pdfUrl, `${base}.pdf`)}>
          Descargar PDF
        </button>
        <button type="button" className="ghost" onClick={() => descargarXml(invoice, setFallo)}>
          Descargar XML
        </button>
        {estado.cancelada && <span className="muted">· cancelado</span>}
        {fallo && <span className="muted">· {fallo}</span>}
      </div>
      {pdfUrl ? (
        <iframe
          title={`Comprobante ${base}`}
          src={pdfUrl}
          style={{ width: '100%', height: 620, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#FFFFFF' }}
        />
      ) : (
        <p className="muted" style={{ margin: 0 }}>{fallo ? 'No se pudo armar el PDF.' : 'Armando el PDF…'}</p>
      )}
    </div>
  )
}

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import CfdiVista from '../components/CfdiVista'

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
  const [verCfdi, setVerCfdi] = useState(null)
  // Comparar contra los dos meses previos. El handoff enseña tres columnas
  // porque un estado de resultados de un solo mes no dice si el mes fue bueno.
  const [comparar, setComparar] = useState(true)
  const [previos, setPrevios] = useState([]) // { id, uuid } del comprobante en ventana
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
    setCuentas({}); setVerCfdi(null)
    const url = (p) =>
      `/api/contabilidad/ce-estado-resultados?companyId=${activeCompany.id}&anio=${p.anio}&mes=${p.mes}${ytd ? '&ytd=1' : ''}`
    try {
      const actual = await apiFetch(url(sel))
      setEr(actual)
      // Los dos meses previos, para la comparación. Van APARTE y después: si
      // alguno falla o la empresa no tiene esa CE, el estado del mes se enseña
      // igual — la comparación es un lujo, la cifra del mes no.
      if (!comparar) { setPrevios([]); return }
      const antes = mesesAntes(sel, 2).filter((p) => periodos.some((q) => q.anio === p.anio && q.mes === p.mes))
      const datos = await Promise.all(
        antes.map((p) => apiFetch(url(p)).then((d) => ({ p, d })).catch(() => null))
      )
      setPrevios(datos.filter(Boolean))
    } catch (err) { setError(err.message); setEr(null) } finally { setLoading(false) }
  }, [activeCompany?.id, sel, ytd, comparar, periodos])

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

  // Índices para la comparación: clave de rubro → cifra, numCta → cifra, por
  // cada mes previo. Se arma una vez y no en cada renglón.
  const serie = useMemo(() => previos.map(({ p, d }) => ({
    p,
    rubro: new Map((d.rubros ?? []).map((r) => [r.clave, d.presentado ? r.declarado : r.derivado])),
    cuenta: new Map((d.rubros ?? []).flatMap((r) => (r.cuentas ?? []).map((c) => [c.numCta, d.presentado ? c.declarado : c.derivado]))),
    bruta: d.presentado ? d.utilidadBruta?.declarado : d.utilidadBruta?.derivado,
    resultado: d.presentado ? d.resultado?.declarado : d.resultado?.derivado,
  })), [previos])
  const comparando = comparar && serie.length > 0

  const presentado = er?.presentado ?? false
  const cols = (presentado ? 4 : 2) + (comparando ? serie.length : 0)
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
          <button
            type="button"
            className={comparando ? undefined : 'ghost'}
            onClick={() => setComparar((v) => !v)}
            title="Enseñar los dos meses anteriores al lado"
          >
            Comparar
          </button>
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
            <table className="tabla-comparativa">
              <thead>
                <tr>
                  <th>Concepto</th>
                  {/* Los meses previos primero: el ojo lee de izquierda a
                      derecha y así el mes en curso queda al final, que es
                      donde uno espera el número más reciente. */}
                  {comparando && serie.map((x) => (
                    <th key={`${x.p.anio}-${x.p.mes}`} style={num} className="muted">{per(x.p)}</th>
                  ))}
                  <th style={num}>{comparando ? per(sel) : presentado ? 'Declarado' : 'Derivado'}</th>
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
                      {comparando && serie.map((x) => (
                        <td key={`${x.p.anio}-${x.p.mes}`} style={num} className="muted">{mxn(x.rubro.get(r.clave))}</td>
                      ))}
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
                            {comparando && serie.map((x) => (
                              <td key={`${x.p.anio}-${x.p.mes}`} style={num} className="muted">{mxn(x.cuenta.get(c.numCta))}</td>
                            ))}
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
                                  onVer={setVerCfdi}
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
                        {comparando && serie.map((x) => (
                          <td key={`${x.p.anio}-${x.p.mes}`} style={num} className="muted">{mxn(x.bruta)}</td>
                        ))}
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
                  {comparando && serie.map((x) => (
                    <td key={`${x.p.anio}-${x.p.mes}`} style={num} className="muted">{mxn(x.resultado)}</td>
                  ))}
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

      {verCfdi && (
        <CfdiVista invoiceId={verCfdi.id} uuid={verCfdi.uuid} onCerrar={() => setVerCfdi(null)} />
      )}
    </div>
  )
}

// Los N meses anteriores a uno dado, del más viejo al más nuevo.
function mesesAntes(sel, n) {
  const out = []
  for (let i = n; i >= 1; i--) {
    const d = new Date(sel.anio, sel.mes - 1 - i, 1)
    out.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 })
  }
  return out
}

function Chevron({ abierto }) {
  return <span className="muted" style={{ marginRight: 6, display: 'inline-block', width: 10 }}>{abierto ? '▾' : '▸'}</span>
}

// Los movimientos de una cuenta, anidados bajo su renglón. El comprobante en
// sí no: un PDF de página completa dentro de un renglón ensucia todo lo demás,
// así que se abre en ventana.
function Documentos({ cuenta, data, codigos, onVer }) {
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
            return (
                <tr key={d.id}>
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
                      <button type="button" className="ghost" onClick={() => onVer({ id: inv.id, uuid: inv.uuid })}>
                        PDF
                      </button>
                    )}
                  </td>
                </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

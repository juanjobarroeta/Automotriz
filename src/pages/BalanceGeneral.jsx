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

// Los meses que van DESPUÉS del último presentado y hasta hoy.
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

// Balance general con lo DECLARADO como columna vertebral — el gemelo del
// estado de resultados, con una diferencia que no es de forma:
//
//   · El estado de resultados es FLUJO: lo que pasó en el mes.
//   · El balance es FOTO: lo que se tiene y se debe AL CIERRE de ese mes.
//
// Por eso aquí no hay botón Mes/Año: un balance siempre viene acumulado hasta
// su fecha de corte. El mes que se elige ES el corte, y el saldo arrastra todo
// lo anterior, apertura incluida.
export default function BalanceGeneral() {
  const { activeCompany } = useAuth()
  const [periodos, setPeriodos] = useState([])
  const [sel, setSel] = useState(null)
  const [codigos, setCodigos] = useState(false)
  const [bg, setBg] = useState(null)
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set(['activo']))
  const [cuentas, setCuentas] = useState({})   // numCta → { cargando, abierta, data }
  const [verCfdi, setVerCfdi] = useState(null)
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
    try {
      setBg(await apiFetch(
        `/api/contabilidad/ce-balance-general?companyId=${activeCompany.id}&anio=${sel.anio}&mes=${sel.mes}`,
      ))
    } catch (err) { setError(err.message); setBg(null) } finally { setLoading(false) }
  }, [activeCompany?.id, sel])

  useEffect(() => { cargar() }, [cargar])

  const toggleGrupo = (clave) => setGruposAbiertos((prev) => {
    const s = new Set(prev)
    s.has(clave) ? s.delete(clave) : s.add(clave)
    return s
  })

  // Los comprobantes se piden del EJERCICIO, no del mes: el saldo de una
  // cuenta de balance no lo explica el movimiento de un mes suelto. Aun así
  // sólo llega hasta enero — lo anterior vive en la apertura, y el renglón lo
  // dice para que nadie crea que estos documentos suman el saldo completo.
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
        `&anio=${sel.anio}&mes=${sel.mes}&ytd=1`,
      )
      setCuentas((c) => ({ ...c, [numCta]: { cargando: false, abierta: true, data } }))
    } catch (err) {
      setError(err.message)
      setCuentas((c) => { const n = { ...c }; delete n[numCta]; return n })
    }
  }

  const presentado = bg?.presentado ?? false
  const cols = presentado ? 4 : 2
  const cifra = (r) => (presentado ? r.declarado : r.derivado)

  const kpis = useMemo(() => {
    if (!bg) return null
    const lado = presentado ? 'declarado' : 'derivado'
    return {
      activo: bg.totales.activo[lado],
      otroLado: bg.totales.pasivoCapitalResultado[lado],
      resultado: bg.resultado[lado],
      descuadre: bg.totales.descuadre[lado],
    }
  }, [bg, presentado])

  const cuadra = kpis ? Math.abs(kpis.descuadre) < 1 : false
  const sinBanco = bg?.sinBanco ?? false

  return (
    <div>
      <header className="page-head">
        <h1>Balance general</h1>
        <span className="glosa">
          {presentado
            ? 'la foto al cierre del mes: lo declarado manda, los CFDIs lo sostienen'
            : 'aún sin declarar — derivado de tus CFDIs'}
        </span>
        <div className="head-actions" style={{ alignSelf: 'center' }}>
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
                  al cierre de {per(p)}{p.preliminar ? ' · preliminar' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Leyendo el balance…</p>}
      {!loading && periodos.length === 0 && (
        <p className="muted">Esta empresa no tiene contabilidad electrónica importada todavía.</p>
      )}

      {bg && !presentado && !bg.antesDelAncla && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Preliminar.</strong>{' '}
          <span className="muted">
            {sel && per(sel)} todavía no se presenta al SAT. Estas cifras parten de la última
            balanza declarada y le suman lo que pasó después — dicen en qué posición va a cerrar
            el mes, no son la declaración.
          </span>
        </div>
      )}

      {/* Antes del ancla no hay derivado que valga: el libro arranca en la
          apertura, y pintar una columna sin punto de partida sería inventar. */}
      {bg?.antesDelAncla && bg.ancla && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Sólo lo declarado.</strong>{' '}
          <span className="muted">
            El libro derivado arranca en {per({ anio: bg.ancla.anio, mes: bg.ancla.mes })}, cuando
            se capturaron los saldos iniciales. Para un corte anterior no hay de dónde derivar, así
            que aquí sólo va la balanza que se presentó al SAT.
          </span>
        </div>
      )}

      {kpis && (
        <div className="kpi-strip densa" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="kpi-item">
            <div className="kpi-label">Activo</div>
            <div className="kpi">{mxn(kpis.activo)}</div>
            {presentado && <div className="kpi-sub">{mxn(bg.totales.activo.derivado)} derivado</div>}
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Pasivo + capital + resultado</div>
            <div className="kpi">{mxn(kpis.otroLado)}</div>
            <div className="kpi-sub">el otro lado de la ecuación</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Resultado del ejercicio</div>
            <div className="kpi">{mxn(kpis.resultado)}</div>
            <div className="kpi-sub">aún no traspasado a capital</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-label">Descuadre</div>
            <div className="kpi" style={{ color: cuadra ? 'var(--ok)' : 'var(--danger)' }}>
              {cuadra ? mxn(0) : mxn(kpis.descuadre)}
            </div>
            <div className="kpi-sub">
              {cuadra ? 'la foto cuadra' : 'activo − (pasivo + capital + resultado)'}
            </div>
          </div>
        </div>
      )}

      {bg && (
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
                {bg.grupos.map((g) => (
                  <Fragment key={g.clave}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleGrupo(g.clave)}>
                      <td style={{ fontWeight: 600 }}>
                        <Chevron abierto={gruposAbiertos.has(g.clave)} />{g.titulo}
                      </td>
                      <td style={{ ...num, fontWeight: 600 }}>{mxn(cifra(g))}</td>
                      {presentado && <td style={num} className="muted">{mxn(g.derivado)}</td>}
                      {presentado && <td style={num} className="muted">{mxn(g.diferencia)}</td>}
                    </tr>

                    {gruposAbiertos.has(g.clave) && g.cuentas.length === 0 && (
                      <tr>
                        <td colSpan={cols} style={{ paddingLeft: 26 }} className="muted">
                          Sin cuentas con saldo en este grupo.
                        </td>
                      </tr>
                    )}

                    {gruposAbiertos.has(g.clave) && g.cuentas.map((c) => {
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
                                  anio={sel?.anio}
                                  codigos={codigos}
                                  onVer={setVerCfdi}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}

                    {/* El activo cierra su bloque con su total: es el lado que
                        se compara contra todo lo demás. */}
                    {gruposAbiertos.has(g.clave) && g.clave === 'activo' && (
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total activo</td>
                        <td style={{ ...num, fontWeight: 600 }}>{mxn(cifra(g))}</td>
                        {presentado && <td style={num} className="muted">{mxn(g.derivado)}</td>}
                        {presentado && <td />}
                      </tr>
                    )}
                  </Fragment>
                ))}

                {/* El resultado no se abre: sus cuentas viven en el estado de
                    resultados, y ahí es donde hay que ir a verlas. */}
                <tr>
                  <td>
                    Resultado del ejercicio{' '}
                    <Link to="/estado-resultados" className="muted" style={{ fontSize: 12 }}>
                      ver detalle
                    </Link>
                  </td>
                  <td style={num}>{mxn(presentado ? bg.resultado.declarado : bg.resultado.derivado)}</td>
                  {presentado && <td style={num} className="muted">{mxn(bg.resultado.derivado)}</td>}
                  {presentado && <td style={num} className="muted">{mxn(bg.resultado.diferencia)}</td>}
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>Pasivo + capital + resultado</td>
                  <td style={{ ...num, fontWeight: 700 }}>
                    {mxn(presentado ? bg.totales.pasivoCapitalResultado.declarado : bg.totales.pasivoCapitalResultado.derivado)}
                  </td>
                  {presentado && <td style={num} className="muted">{mxn(bg.totales.pasivoCapitalResultado.derivado)}</td>}
                  {presentado && <td />}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            {cuadra
              ? `La foto cuadra: el activo iguala al pasivo más el capital más el resultado, al cierre de ${sel ? per(sel) : ''}.`
              : `No cuadra por ${mxn(kpis?.descuadre)} — así se declaró; no es un error de cálculo nuestro.`}
          </p>

          {/* Sin banco no hay cobranza ni pagos: las cuentas por cobrar y por
              pagar sólo pueden crecer. Decirlo aquí evita que alguien lea el
              saldo como posición real y tome una decisión con él. */}
          {sinBanco && !bg.antesDelAncla && (
            <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
              Todavía no hay estados de cuenta cargados, así que ningún cobro ni pago se registra:
              desde {bg.ancla ? per({ anio: bg.ancla.anio, mes: bg.ancla.mes }) : 'la apertura'} las
              cuentas por cobrar y por pagar sólo suman. Los saldos de clientes y proveedores van a
              verse más altos que la realidad hasta que se concilie el banco.
            </p>
          )}
        </section>
      )}

      {verCfdi && (
        <CfdiVista invoiceId={verCfdi.id} uuid={verCfdi.uuid} onCerrar={() => setVerCfdi(null)} />
      )}
    </div>
  )
}

function Chevron({ abierto }) {
  return <span className="muted" style={{ marginRight: 6, display: 'inline-block', width: 10 }}>{abierto ? '▾' : '▸'}</span>
}

// Los movimientos del ejercicio en una cuenta de balance. NO suman el saldo:
// el saldo arrastra ejercicios anteriores y la apertura, y decirlo evita que
// alguien reste estos renglones y crea que faltan documentos.
function Documentos({ cuenta, data, anio, codigos, onVer }) {
  return (
    <div style={{ paddingLeft: 52, paddingRight: 8, paddingBottom: 10 }}>
      <p className="muted" style={{ margin: '2px 0 8px' }}>
        {codigos && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cuenta.numCta} · </span>}
        {data.total.toLocaleString('es-MX')} movimiento(s) de {anio} · neto {mxn(data.neto)}
        {data.mostrados < data.total && ` · los ${data.mostrados} más recientes`}
        {' · '}el saldo incluye ejercicios anteriores
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
          {data.documentos.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Sin movimientos en {anio}: el saldo viene de la apertura o de ejercicios anteriores.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

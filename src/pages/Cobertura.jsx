import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const num = (n) => (n == null ? '—' : n.toLocaleString('es-MX'))
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)
// Columna secundaria de una tabla: el dato de apoyo va en tinta más clara.
const sec = { color: 'var(--ink-3)' }

// Cobertura del archivo: lo que el estado de resultados NO está contando.
//
// Esta pantalla existe para que el residuo tenga dónde verse. En Margom hubo
// ~$97M de bonos y comisiones que no aparecían en ninguna línea del tablero, y
// se encontraron de casualidad. El punto de esta pantalla es que la próxima vez
// se encuentren el primer día, y con un botón para resolverlo.
export default function Cobertura() {
  const { activeCompany } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      setData(await apiFetch(`/api/automotriz/cobertura?companyId=${activeCompany.id}&year=${year}`))
    } catch (err) { setError(err.message); setData(null) } finally { setLoading(false) }
  }, [activeCompany?.id, year])

  useEffect(() => { cargar() }, [cargar])

  const anios = []
  for (let a = new Date().getFullYear(); a >= 2021; a--) anios.push(a)

  return (
    <div>
      <header className="page-head">
        <h1>Cobertura del archivo</h1>
        <span className="glosa">cuánto de lo facturado explica el tablero — y qué queda fuera</span>
        <div className="head-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Revisando el archivo…</p>}

      {data && !loading && (
        <>
          {/* La franja: qué proporción de cada lado del archivo está explicada. */}
          <div className="kpi-strip">
            {[['Ingresos', data.cobertura.ingresos], ['Egresos', data.cobertura.egresos], ['Nómina', data.cobertura.nomina]].map(([titulo, lado]) => (
              <div className="kpi-item" key={titulo}>
                <span className="kpi-label">{titulo} explicados</span>
                <span className={`kpi ${lado.pct != null && lado.pct < 95 ? 'warn' : ''}`}>{pct(lado.pct)}</span>
                <span className="kpi-sub">
                  {lado.pendiente !== 0
                    ? <>{mxn(lado.pendiente)} sin clasificar</>
                    : 'nada pendiente de clasificar'}
                </span>
              </div>
            ))}
          </div>

          <p className="muted" style={{ marginTop: -8 }}>
            Lo que queda fuera no se reparte: se lista.
          </p>

          {/* Lo imposible primero: no se discute y no espera turno. */}
          {data.invariantes.length > 0 && (
            <section className="card">
              <div className="card-head">
                <span>Números imposibles</span>
                <span className="badge badge-danger">aritmética rota</span>
              </div>
              <p className="muted" style={{ margin: '0 0 4px' }}>
                Un objeto derivado de un CFDI no puede valer más que ese CFDI. Esto no es una
                estimación: es aritmética, y significa que un derivador está contando de más.
              </p>
              {data.invariantes.map((v) => (
                <div key={v.clave} style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{v.titulo}</div>
                  <p className="muted" style={{ margin: '4px 0' }}>{v.explicacion}</p>
                  <p style={{ margin: '4px 0' }}>
                    <span className="neg">{mxn(v.exceso)}</span> de más en {num(v.documentos)} documento(s).
                  </p>
                  <table>
                    <thead>
                      <tr><th>Factura</th><th>Fecha</th><th className="num">Derivado</th><th className="num">CFDI</th><th className="num">Veces</th></tr>
                    </thead>
                    <tbody>
                      {v.ejemplos.map((e) => (
                        <tr key={e.invoiceId}>
                          <td className="mono">{e.referencia}</td>
                          <td style={sec}>{e.fecha ? new Date(e.fecha).toLocaleDateString('es-MX') : '—'}</td>
                          <td className="num">{mxn(e.derivado)}</td>
                          <td className="num" style={sec}>{mxn(e.cfdi)}</td>
                          <td className="num neg">{e.veces == null ? '—' : `${e.veces}×`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          )}

          {/* Lo implausible: sí se discute, y la banda va a la vista. */}
          {data.senales.length > 0 && (
            <section className="card">
              <div className="card-head">Señales</div>
              <p className="muted" style={{ margin: '0 0 4px' }}>
                Números que se pueden sostener, pero que rara vez son ciertos. La banda esperada
                va escrita para que se pueda discutir el rango, no sólo el veredicto.
              </p>
              <table>
                <thead>
                  <tr><th>Línea</th><th>Qué pasa</th><th className="num">Observado</th><th className="num">Se espera</th></tr>
                </thead>
                <tbody>
                  {data.senales.map((s, i) => (
                    <tr key={`${s.linea}-${s.tipo}-${i}`}>
                      <td style={{ fontSize: 13 }}>
                        {s.nombre}
                        {s.severidad === 'alta' && <span className="badge badge-danger" style={{ marginLeft: 6 }}>alta</span>}
                      </td>
                      <td className="muted">{s.mensaje}</td>
                      <td className="num">{s.tipo === 'margen' || s.tipo === 'muestra_sesgada' ? pct(s.observado) : mxn(s.observado)}</td>
                      <td className="num muted">{s.esperado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="card">
            <div className="card-head">De dónde sale cada peso</div>
            <table>
              <thead>
                <tr><th>Concepto</th><th>Origen</th><th className="num">Facturas</th><th className="num">Monto</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {['ingresos', 'egresos', 'nomina'].flatMap((k) =>
                  data.cobertura[k].lineas.map((l) => (
                    <tr key={`${k}-${l.bucket}`}>
                      <td className={l.bucket === 'pendiente' ? 'neg' : undefined} style={{ fontSize: 13 }}>{l.nombre}</td>
                      <td className="muted">{l.derivado ? 'objeto derivado' : l.bucket === 'pendiente' ? '—' : 'regla'}</td>
                      <td className="num" style={sec}>{num(l.facturas)}</td>
                      <td className="num">{mxn(l.monto)}</td>
                      <td className="num muted">{pct(l.pct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="card-head">Por clasificar</div>
            {data.cobertura.clustersTotales === 0 ? (
              <p className="muted">Todo lo facturado del ejercicio está explicado. No hay nada que confirmar.</p>
            ) : (
              <>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  {num(data.cobertura.clustersTotales)} grupo(s) sin clasificar, del más caro al más barato.
                  Confirmar uno crea una regla, y la regla resuelve todas las facturas del grupo — también
                  las que lleguen después.
                  {data.cobertura.clusters.length < data.cobertura.clustersTotales &&
                    ` Se muestran los ${data.cobertura.clusters.length} primeros.`}
                </p>
                <table>
                  <thead>
                    <tr><th>Concepto</th><th>Clave SAT</th><th className="num">Facturas</th><th className="num">Monto</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.cobertura.clusters.map((c, i) => (
                      <tr key={`${c.tipo}-${c.clave}-${i}`}>
                        <td style={{ fontSize: 13 }}>
                          {c.muestra || <span className="muted">(sin descripción)</span>}
                          <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{c.tipo.toLowerCase()}</div>
                        </td>
                        <td className="mono">{c.clave || '—'}</td>
                        <td className="num" style={sec}>{num(c.facturas)}</td>
                        <td className="num">{mxn(c.monto)}</td>
                        <td className="num">
                          <button className="ghost" onClick={() => setAbierto(abierto === i ? null : i)}>
                            {abierto === i ? 'Cancelar' : 'Clasificar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {abierto != null && data.cobertura.clusters[abierto] && (
                  <FormaRegla
                    cluster={data.cobertura.clusters[abierto]}
                    companyId={activeCompany.id}
                    onListo={() => { setAbierto(null); cargar() }}
                  />
                )}
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head">Cómo se lee</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {data.notas.map((n, i) => (
                <div key={i} style={{ fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>{n}</div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// Destinos que un cluster puede tomar. Se ofrecen los mismos buckets del estado
// de resultados y NO texto libre: una etiqueta inventada crea un renglón que
// nadie más entiende, y la gracia es que la regla sirva también en la siguiente
// agencia.
const DESTINOS = [
  { valor: 'otros_ingresos', etiqueta: 'Bonos, comisiones y otros ingresos', ambito: 'INGRESO' },
  { valor: 'anticipo', etiqueta: 'Anticipos (se netean)', ambito: 'INGRESO' },
  { valor: 'gasto', etiqueta: 'Gasto de operación', ambito: 'EGRESO' },
]

function FormaRegla({ cluster, companyId, onListo }) {
  const permitidos = DESTINOS.filter((d) => d.ambito === cluster.tipo)
  const [destino, setDestino] = useState(permitidos[0]?.valor ?? 'gasto')
  const [prefijo, setPrefijo] = useState(cluster.clave ? cluster.clave.slice(0, 4) : '')
  // El patrón se propone desde la descripción normalizada, sin los números que
  // cambian de factura a factura — que es justo lo que agrupó al cluster.
  const [patron, setPatron] = useState((cluster.patron || '').replace(/#/g, '').replace(/\s+/g, ' ').trim().slice(0, 60))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      const etiqueta = permitidos.find((d) => d.valor === destino)?.etiqueta ?? destino
      await apiFetch('/api/automotriz/reglas', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          ambito: cluster.tipo,
          clavePrefijo: prefijo.trim() || null,
          patron: patron.trim() || null,
          destino,
          etiqueta,
          razon: `Confirmado desde la cola de cobertura: «${cluster.muestra ?? cluster.patron}» (${cluster.facturas} facturas).`,
        }),
      })
      onListo()
    } catch (err) { setError(err.message) } finally { setGuardando(false) }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">¿Qué es «{cluster.muestra ?? cluster.patron}»?</div>
      <p className="muted" style={{ margin: '0 0 4px' }}>
        La regla aplica a las facturas cuya clave empiece con el prefijo Y cuya descripción
        contenga el texto. Deja el prefijo vacío para no filtrar por clave.
      </p>
      <div className="inline-form">
        <label>
          Es un…
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            {permitidos.map((d) => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
          </select>
        </label>
        <label>
          Prefijo de clave
          <input value={prefijo} onChange={(e) => setPrefijo(e.target.value)} placeholder="8014" maxLength={8} />
        </label>
        <label>
          Texto en la descripción
          <input value={patron} onChange={(e) => setPatron(e.target.value)} placeholder="BONO INCREMENTAL" maxLength={200} />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <button onClick={guardar} disabled={guardando || (!prefijo.trim() && !patron.trim())}>
        {guardando ? 'Guardando…' : `Clasificar ${cluster.facturas} factura(s)`}
      </button>
    </div>
  )
}

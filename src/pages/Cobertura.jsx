import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const num = (n) => (n == null ? '—' : n.toLocaleString('es-MX'))
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)

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
        <div className="head-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      <p className="muted">
        Cuánto de lo facturado sí está explicado por alguna línea del tablero — y qué queda fuera.
        Lo que queda fuera no se reparte: se lista.
      </p>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Revisando el archivo…</p>}

      {data && !loading && (
        <>
          {/* Lo imposible primero: no se discute y no espera turno. */}
          {data.invariantes.length > 0 && (
            <section className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
              <h2>Números imposibles</h2>
              <p className="muted">
                Un objeto derivado de un CFDI no puede valer más que ese CFDI. Esto no es una
                estimación: es aritmética, y significa que un derivador está contando de más.
              </p>
              {data.invariantes.map((v) => (
                <div key={v.clave} style={{ marginTop: 14 }}>
                  <strong>{v.titulo}</strong>
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
                          <td>{e.referencia}</td>
                          <td>{e.fecha ? new Date(e.fecha).toLocaleDateString('es-MX') : '—'}</td>
                          <td className="num">{mxn(e.derivado)}</td>
                          <td className="num">{mxn(e.cfdi)}</td>
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
              <h2>Señales</h2>
              <p className="muted">
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
                      <td>
                        {s.nombre}
                        {s.severidad === 'alta' && <span className="badge badge-CANCELADO" style={{ marginLeft: 6 }}>alta</span>}
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

          <div className="cards">
            {[['Ingresos', data.cobertura.ingresos], ['Egresos', data.cobertura.egresos], ['Nómina', data.cobertura.nomina]].map(([titulo, lado]) => (
              <section className="card" key={titulo}>
                <h2>{titulo}</h2>
                <p className={`kpi ${lado.pct != null && lado.pct >= 95 ? 'pos' : ''}`}>{pct(lado.pct)}</p>
                <p className="muted">explicado</p>
                {lado.pendiente !== 0 && (
                  <p className="muted">
                    <span className="neg">{mxn(lado.pendiente)}</span> sin clasificar
                  </p>
                )}
              </section>
            ))}
          </div>

          <section className="card">
            <h2>De dónde sale cada peso</h2>
            <table>
              <thead>
                <tr><th>Concepto</th><th>Origen</th><th className="num">Facturas</th><th className="num">Monto</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {['ingresos', 'egresos', 'nomina'].flatMap((k) =>
                  data.cobertura[k].lineas.map((l) => (
                    <tr key={`${k}-${l.bucket}`}>
                      <td className={l.bucket === 'pendiente' ? 'neg' : undefined}>{l.nombre}</td>
                      <td className="muted">{l.derivado ? 'objeto derivado' : l.bucket === 'pendiente' ? '—' : 'regla'}</td>
                      <td className="num">{num(l.facturas)}</td>
                      <td className="num">{mxn(l.monto)}</td>
                      <td className="num muted">{pct(l.pct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Por clasificar</h2>
            {data.cobertura.clustersTotales === 0 ? (
              <p className="muted">Todo lo facturado del ejercicio está explicado. No hay nada que confirmar.</p>
            ) : (
              <>
                <p className="muted">
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
                        <td>
                          {c.muestra || <span className="muted">(sin descripción)</span>}
                          <div className="muted" style={{ fontSize: '0.85em' }}>{c.tipo.toLowerCase()}</div>
                        </td>
                        <td className="muted">{c.clave || '—'}</td>
                        <td className="num">{num(c.facturas)}</td>
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
            <h2>Cómo se lee</h2>
            <ul className="muted">
              {data.notas.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
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
    <div className="card" style={{ marginTop: 12, background: 'var(--surface-2, transparent)' }}>
      <h3>¿Qué es «{cluster.muestra ?? cluster.patron}»?</h3>
      <p className="muted">
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
      <button className="success" onClick={guardar} disabled={guardando || (!prefijo.trim() && !patron.trim())}>
        {guardando ? 'Guardando…' : `Clasificar ${cluster.facturas} factura(s)`}
      </button>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import AbsorcionGrafica from '../components/AbsorcionGrafica'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// Panel de la agencia («Automotriz PRO»): franja de KPIs sin caja sobre
// hairline inferior + feed de urgentes con filas accionables (liga a unidad).

// Renglón etiqueta/importe, como el desglose de Impuestos.
function Fila({ label, valor, fuerte }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', borderBottom: '1px solid var(--line)',
    }}>
      <span style={{ fontSize: 12.5, color: fuerte ? 'var(--ink)' : 'var(--ink-3)', fontWeight: fuerte ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: fuerte ? 600 : 400 }}>{valor}</span>
    </div>
  )
}

// Una cifra del panel con su comparativo debajo. El handoff nunca enseña el
// número solo: la lectura es «cuánto» Y «contra qué».
function Cifra({ k, v, comp = [], alerta = false }) {
  return (
    <div className="panel-kpi">
      <span className="k">{k}</span>
      <span className={`v${alerta ? ' alerta' : ''}`}>{v}</span>
      <div className="panel-comp">
        {comp.map(([ck, cv]) => (
          <div key={ck}>
            <span className="ck">{ck}</span>
            <span className="cv">{cv}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Caja de un estado de timbrado. Sin datos del bucket se enseña en cero, que
// es distinto de «no se puede saber» —eso lo dicen las cajas sin-modelo—.
function CajaTimbrado({ rotulo, b, nota, tono }) {
  return (
    <div className={`timbrado-caja${tono ? ' ' + tono : ''}`}>
      <div className="fila"><span className="punto" /><span className="rot">{rotulo}</span></div>
      <span className="n">{b?.n ?? 0}</span>
      <span className="mt">{mxn(b?.monto ?? 0)}</span>
      <span className="nota">{nota}</span>
    </div>
  )
}

// Renglón del feed de alertas: qué pasa, cuánto cuesta y a dónde se va a
// arreglar. Sin el importe es una queja; con él es una decisión.
function Alerta({ grave, titulo, detalle, monto, a, accion }) {
  const cuerpo = (
    <>
      <span className={`barra${grave ? '' : ''}`} />
      <div className="cuerpo">
        <div className="tit">{titulo}</div>
        <div className="det">{detalle}</div>
      </div>
      {monto != null && <span className={`monto${grave ? ' grave' : ''}`}>{monto}</span>}
      {accion && <span style={{ fontSize: 11.5, color: 'var(--acc)', flexShrink: 0 }}>{accion} →</span>}
    </>
  )
  const clase = `alerta-fila${grave ? ' grave' : ''}`
  return a
    ? <Link to={a} className={clase} style={{ textDecoration: 'none', color: 'inherit' }}>{cuerpo}</Link>
    : <div className={clase}>{cuerpo}</div>
}

export default function Panel() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      setData(await apiFetch(`/api/automotriz/panel?companyId=${activeCompany.id}`))
    } catch (err) { setError(err.message) }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <div className="error">{error}</div>
  if (!data) return <p className="muted">Cargando…</p>

  const { piso, mes, urgentes, periodo, taller, crm, servicio, refacciones, absorcion, impuestos, timbrado, comparativo, señales } = data
  const fechaCorta = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')
  const absorbe = absorcion?.porcentaje != null && absorcion.porcentaje >= 100

  // El feed de alertas se arma de señales que el panel YA tiene. Cada una
  // lleva su costo: sin el importe, «12 unidades pasan de 90 días» es una
  // observación; con los $52,020 que devengan, es una decisión.
  const alertas = [
    (señales?.sinCfdiCompra ?? 0) > 0 && {
      grave: true,
      titulo: `${señales.sinCfdiCompra} unidad(es) en piso sin CFDI de compra`,
      detalle: 'El costo no está documentado: no entra a la utilidad ni es deducible.',
      a: '/?vista=SIN_DOCUMENTAR', accion: 'Revisar',
    },
    piso.masDe90 > 0 && {
      grave: false,
      titulo: `${piso.masDe90} unidad(es) pasan de 90 días en piso`,
      detalle: `Devengan interés de plan piso mes con mes — ${mxn(comparativo?.interesMes ?? 0)} este mes en total.`,
      a: '/', accion: 'Ver el piso',
    },
    (taller?.promesasVencidas?.length ?? 0) > 0 && {
      grave: true,
      titulo: `${taller.promesasVencidas.length} promesa(s) de taller vencida(s)`,
      detalle: 'La unidad sigue adentro y la fecha prometida ya pasó.',
      a: '/servicio', accion: 'Abrir taller',
    },
    (crm?.vencidos ?? 0) > 0 && {
      grave: false,
      titulo: `${crm.vencidos} seguimiento(s) de prospecto vencido(s)`,
      detalle: 'Un prospecto sin llamada a tiempo se enfría solo.',
      a: '/ventas', accion: 'Ver prospectos',
    },
    impuestos?.ivaSaldoAFavor > 0 && {
      grave: false,
      titulo: `${mxn(impuestos.ivaSaldoAFavor)} de saldo a favor de IVA`,
      detalle: 'Se arrastra al mes siguiente; no reduce el ISR ni las retenciones.',
      a: '/fiscal', accion: 'Ver impuestos',
    },
  ].filter(Boolean).sort((a, b) => Number(b.grave) - Number(a.grave))

  return (
    <div>
      <header className="page-head">
        <h1>Panel</h1>
        <span className="glosa">
          {MESES[periodo.month - 1]} {periodo.year} · lo que requiere atención hoy
        </span>
        <div className="head-actions">
          <span className="muted" style={{ fontSize: 11 }}>actual · mes anterior</span>
        </div>
      </header>

      {/* Las cuatro cifras del handoff, cada una contra el mes pasado. Un
          número solo no dice si está bien: $85,240 de interés de piso se juzga
          contra los $71,600 del mes anterior, no contra nada. */}
      <div className="panel-kpis">
        <Cifra
          k="Capital en piso"
          v={mxn(piso.valorPiso)}
          comp={[['unidades', piso.unidades], ['+90 días', piso.masDe90], ['días prom.', piso.diasPromedio]]}
        />
        <Cifra
          k="Unidades vendidas"
          v={mes.vendidas}
          comp={[['actual', mes.vendidas], ['anterior', comparativo?.vendidasPrevio ?? '—'],
                 ['nuevas / semi', `${mes.nuevas} / ${mes.seminuevas}`]]}
        />
        <Cifra
          k="Utilidad del mes"
          v={mxn(mes.utilidadNeta)}
          alerta={mes.utilidadNeta < 0}
          comp={[['actual', mxn(mes.utilidadNeta)], ['anterior', comparativo ? mxn(comparativo.utilidadPrevio) : '—'],
                 ['bruta', mxn(mes.utilidadBruta)]]}
        />
        <Cifra
          k="Interés de plan piso"
          v={mxn(comparativo?.interesMes ?? 0)}
          /* El interés SIEMPRE es malo: es dinero que se va por tener la unidad
             parada. Se pinta en rojo cuando además creció contra el mes pasado. */
          alerta={(comparativo?.interesMes ?? 0) > (comparativo?.interesPrevio ?? 0)}
          comp={[['actual', mxn(comparativo?.interesMes ?? 0)],
                 ['anterior', mxn(comparativo?.interesPrevio ?? 0)],
                 ['+90 días', `${piso.masDe90} unidades`]]}
        />
      </div>

      {/* ── Estado de timbrado ────────────────────────────────────────────── */}
      {timbrado && (
        <section className="card" style={{ marginBottom: 20 }}>
          <div className="card-head" style={{ gap: 10 }}>
            <span>Estado de timbrado · {MESES[periodo.month - 1]}</span>
            <span className="muted" style={{ fontWeight: 400 }}>{timbrado.emitidos} CFDI emitidos</span>
          </div>
          <div className="panel-timbrado">
            <CajaTimbrado tono="ok" rotulo="Timbrada" b={timbrado.buckets.STAMPED} nota="sin pendientes" />
            <CajaTimbrado rotulo="Por timbrar" b={timbrado.buckets.DRAFT} nota="borradores sin sellar" />
            <CajaTimbrado tono="mal" rotulo="Cancelada" b={timbrado.buckets.CANCELLED} nota="aceptadas por el receptor" />
            {/* El handoff dibuja dos estados más. No se inventan: el modelo no
                guarda cuándo se pidió una cancelación ni si el receptor la
                rechazó, así que no hay con qué contarlos. */}
            <div className="timbrado-caja sin-modelo" title="Sin modelo: no se guarda la solicitud de cancelación">
              <div className="fila"><span className="punto" /><span className="rot">Cancelación en proceso</span></div>
              <span className="n">—</span>
              <span className="nota">no se guarda cuándo se pidió</span>
            </div>
            <div className="timbrado-caja sin-modelo" title="Sin modelo: no se guarda el rechazo del receptor">
              <div className="fila"><span className="punto" /><span className="rot">Rechazada</span></div>
              <span className="n">—</span>
              <span className="nota">no se guarda el rechazo</span>
            </div>
          </div>
        </section>
      )}

      <div className="panel-cols">
        <div>
            {/* ── Alertas del módulo ──────────────────────────────────────
                Cada renglón trae su costo al lado. Sin el importe es una
                queja; con él es una decisión que alguien puede tomar hoy. */}
            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Alertas del módulo</span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {alertas.length === 0 ? 'nada pendiente' : `${alertas.filter((a) => a.grave).length} graves · ${alertas.filter((a) => !a.grave).length} avisos`}
                </span>
              </div>
              {alertas.length === 0 ? (
                <p className="muted">No hay nada que atender hoy en el módulo.</p>
              ) : alertas.map((al) => <Alerta key={al.titulo} {...al} />)}
            </section>

      {absorcion && (
          <section className="card" style={{ marginTop: 18 }}>
            <h2>Absorción de servicio</h2>
            <p className={`kpi ${absorbe ? '' : 'neg'}`}>
              {absorcion.porcentaje == null ? '—' : `${Math.round(absorcion.porcentaje)}%`}
            </p>
            <p className="muted">
              {absorcion.porcentaje == null
                ? 'sin estructura registrada en el mes'
                : absorbe
                  ? 'El taller y refacciones pagan solos toda la estructura: cada unidad vendida es utilidad.'
                  : `El back end cubre ${Math.round(absorcion.porcentaje)}% de la estructura; el resto tiene que salir de vender unidades.`}
            </p>
            <AbsorcionGrafica serie={absorcion.serie} />
          {/* Refacciones cuyo costo no es comparable (se compran por tambo y se
              venden por litro, por ejemplo). Quedan fuera del cálculo arriba y
              abajo, así que la absorción sale más baja de lo real. Se dice, en
              vez de dejar que alguien se pregunte por qué no cuadra con la
              venta de refacciones del estado de resultados. */}
          {(() => {
            const fuera = (absorcion.serie ?? []).reduce((a, m) => a + (m.ingresoSinCosto ?? 0), 0)
            if (fuera <= 0) return null
            return (
              <div className="card-note">
                Quedan fuera {mxn(fuera)} de venta de refacciones en el periodo: su costo no es
                comparable —la unidad con que se compran difiere de la que se vende, típico de
                lubricantes— así que no se afirma un margen que no se puede sostener. La absorción
                real es algo más alta que la de la gráfica.
              </div>
            )
          })()}
            <details style={{ marginTop: 10 }}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>Ver los números del mes a mes</summary>
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Mes</th><th className="num">Utilidad taller + refacciones</th><th className="num">Estructura</th><th className="num">Absorción</th></tr></thead>
                <tbody>
                  {(absorcion.serie ?? []).map((m) => (
                    <tr key={m.mes}>
                      <td>{m.mes}</td>
                      <td className="num">{mxn(m.utilidadFixedOps)}</td>
                      <td className="num">{mxn(m.estructura)}</td>
                      <td className={`num ${m.porcentaje >= 100 ? '' : 'neg'}`}>
                        {m.porcentaje == null ? '—' : `${Math.round(m.porcentaje)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        )}
  
        {(taller || crm) && (
          <div className="cards" style={{ marginTop: 18 }}>
            {taller && (
              <section className="card">
                <div className="card-head">
                  <span>Taller hoy</span>
                  <Link to="/servicio">ver órdenes</Link>
                </div>
                <p className="kpi">{taller.abiertas}</p>
                <p className="muted">
                  órdenes abiertas · {taller.porEstado.RECIBIDA ?? 0} recibidas, {taller.porEstado.EN_PROCESO ?? 0} en
                  proceso, {taller.porEstado.LISTA ?? 0} listas
                </p>
                {taller.promesasVencidas.length > 0 && (
                  <div className="card-divider" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {taller.promesasVencidas.map((o) => (
                      <div key={o.id} style={{ fontSize: 12, color: 'var(--danger)' }}>
                        #<span className="mono">{o.folio}</span> {o.unidad ?? ''} — prometida {fechaCorta(o.prometidaAt)}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {crm && (
              <section className="card">
                <div className="card-head">
                  <span>Piso de ventas</span>
                  <Link to="/ventas">abrir la cola de WhatsApp</Link>
                </div>
                <p className="kpi">{crm.abiertos}</p>
                <p className="muted">
                  prospectos abiertos ·{' '}
                  {crm.vencidos > 0
                    ? <span className="neg">{crm.vencidos} seguimientos vencidos</span>
                    : 'seguimientos al día'}
                </p>
              </section>
            )}
          </div>
        )}
  
        <div className="urgent-list" style={{ marginTop: 18 }}>
          <div className="urgent-head">Requiere tu atención</div>
          {urgentes.length === 0 ? (
            <div className="urgent-row" style={{ cursor: 'default' }}>
              <span className="muted">Nada urgente por ahora.</span>
            </div>
          ) : (
            urgentes.map((u) => (
              <Link key={`${u.tipo}-${u.vehiculoId}`} to={`/vehiculos/${u.vehiculoId}`} className="urgent-row">
                <span className={`badge ${u.tipo === 'PISO_90' ? 'badge-danger' : 'badge-warn'}`} style={{ flexShrink: 0 }}>
                  {u.tipo === 'PISO_90' ? '+90 días' : 'Apartada'}
                </span>
                <span className="urgent-title">{u.titulo}</span>
                <span className="muted">{u.detalle}</span>
                <span className="chevron">›</span>
              </Link>
            ))
          )}
        </div>
        </div>

        <div>
            {/* ── Lo que se le debe al SAT ────────────────────────────────
                Los tres impuestos que salen el día 17, juntos. El ISAN estaba
                fuera del panel y es el propio de una distribuidora. */}
            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Impuestos del mes</span>
                <span className="muted" style={{ fontWeight: 400 }}>proyectado · vence el 17</span>
              </div>
              <Fila label="IVA" valor={mxn(impuestos.iva)} />
              <Fila
                label={`ISAN${impuestos.isanUnidades ? ` · ${impuestos.isanUnidades} unidad(es) nueva(s)` : ''}`}
                valor={mxn(impuestos.isan ?? 0)}
              />
              <Fila label="ISR provisional" valor={mxn(impuestos.isr)} />
              <Fila label="Retenciones a enterar" valor={mxn(impuestos.retenciones)} />
              <Fila fuerte label="Total al SAT" valor={mxn(impuestos.total)} />
              <div className="card-note">
                Proyectado con lo facturado hasta hoy, no es la declaración: ésa se arma con el mes
                cerrado en <Link to="/fiscal">Impuestos</Link>.
                {impuestos.ivaSaldoAFavor > 0 && ` Hay ${mxn(impuestos.ivaSaldoAFavor)} de saldo a favor de IVA que se arrastra.`}
              </div>
              {(impuestos.isanAvisos ?? []).length > 0 && (
                <div className="warn" style={{ marginTop: 10, fontSize: 11.5 }}>
                  {impuestos.isanAvisos[0]}
                </div>
              )}
            </section>

            {/* ── Acciones de venta ──────────────────────────────────────── */}
            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Acciones de venta urgentes</span>
                <span className="muted" style={{ fontWeight: 400 }}>seguimiento de prospectos</span>
              </div>
              {(crm?.vencidos ?? 0) > 0 ? (
                <>
                  <p className="kpi neg" style={{ margin: '4px 0' }}>{crm.vencidos}</p>
                  <p className="muted" style={{ margin: 0 }}>
                    seguimiento(s) con fecha vencida, de {crm.abiertos} prospecto(s) abierto(s).
                    Un prospecto sin llamada a tiempo se enfría solo.
                  </p>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {(crm?.abiertos ?? 0) > 0
                    ? `${crm.abiertos} prospecto(s) abierto(s), ninguno con seguimiento vencido.`
                    : 'Todavía no se capturan prospectos. El embudo llega con la pasada de CRM.'}
                </p>
              )}
            </section>

            {/* ── Por cablear ─────────────────────────────────────────────
                Se enseñan a propósito: un hueco callado se lee como que el
                tablero ya cubre todo. Cada uno dice qué le falta. */}
            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Clientes con RPC urgente</span>
                <span className="muted" style={{ fontWeight: 400 }}>por cablear</span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>
                No hay dónde levantar un reporte de problema de cliente: falta el modelo con folio,
                severidad, área y compromiso de respuesta. Cuando exista, aquí van los abiertos que
                pasan de 5 días hábiles — que es cuando escalan a planta.
              </p>
            </section>

            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Tareas y mensajes</span>
                <span className="muted" style={{ fontWeight: 400 }}>por cablear</span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>
                No se asignan tareas ni se guardan mensajes entre el personal. Los mensajes de
                WhatsApp que ya existen son del asistente hablando con la agencia, no de una
                persona con otra. Necesita modelo propio y llega con la pasada de CRM.
              </p>
            </section>
        </div>
      </div>
    </div>
  )
}

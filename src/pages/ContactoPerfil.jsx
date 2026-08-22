import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../config/api'
import CfdiAcciones from '../components/CfdiAcciones'
import CfdiVista from '../components/CfdiVista'
import { VentanaDetalle } from '../components/Primitivos'

const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—')

const NOTA = { marginTop: 12, fontSize: 12, lineHeight: 1.5 }
// Folio impreso del CFDI: dato duro, siempre en mono.
const folio = (f) => [f.serie, f.folio].filter(Boolean).join('-') || f.uuid?.slice(0, 8) || '—'

const iniciales = (nombre) =>
  (nombre ?? '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'

// Etiquetas DERIVADAS de los datos. El handoff las usa para describir la
// relación de un vistazo («Cliente desde 2019 · Recompra · 3 unidades»), y
// aquí sólo se dice lo que los datos sostienen — ninguna se inventa.
function etiquetasDe(perfil, lado) {
  const t = []
  const rfc = perfil.contacto.rfc ?? ''
  if (rfc.length === 13) t.push('Persona física')
  else if (rfc.length === 12) t.push('Persona moral')

  const fechas = (perfil.facturas ?? []).map((f) => f.fecha).filter(Boolean).sort()
  if (fechas.length) t.push(`${lado === 'CLIENTE' ? 'Cliente' : 'Proveedor'} desde ${new Date(fechas[0]).getFullYear()}`)

  const nUnidades = (perfil.unidades ?? []).length
  if (nUnidades > 0) t.push(`${nUnidades} unidad${nUnidades === 1 ? '' : 'es'}`)
  if (lado === 'CLIENTE' && nUnidades > 1) t.push('Recompra')

  const nServicio = perfil.servicio?.ordenes ?? 0
  if (nServicio > 0) t.push(`${nServicio} orden${nServicio === 1 ? '' : 'es'} de servicio`)

  if (perfil.resumen?.repPendienteFacturas > 0) {
    t.push(lado === 'CLIENTE' ? 'REP por emitir' : 'REP por recibir')
  }
  return t
}

// Antigüedad del saldo. Es el mismo patrón de tramos del inventario: la
// pregunta no es cuánto deben, es desde cuándo.
const TRAMOS_SALDO = [
  { etiqueta: 'Por vencer', color: 'var(--posFill)', min: -Infinity, max: 0 },
  { etiqueta: '1–30 días', color: 'var(--accFill)', min: 1, max: 30 },
  { etiqueta: '31–60 días', color: 'var(--warnFill)', min: 31, max: 60 },
  { etiqueta: 'Más de 60', color: 'var(--negFill)', min: 61, max: Infinity },
]
// Los chips nunca van en mayúsculas forzadas: EN_TRANSITO → «En transito».
const etiqueta = (e) => {
  const s = e.replaceAll('_', ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Perfil 360° del contacto: pestaña "Como cliente" (lo que le facturamos,
// cobros y REPs que NOSOTROS debemos emitir) y "Como proveedor" (lo que nos
// facturó, pagos y REPs que ÉL nos debe — riesgo de deducción).
// Estado de cuenta documental del cliente: cargos (facturas), abonos (NC,
// REPs con su FechaPago legal, PUE liquidadas en emisión, cobros conciliados)
// y saldo corrido — imprimible para mandárselo al cliente.
function EstadoDeCuenta({ clienteId, completo = false, setCfdi = () => {} }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setError(null)
      try {
        const r = await apiFetch(`/api/automotriz/clientes/${clienteId}/estado-cuenta?year=${year}`)
        if (vivo) setData(r)
      } catch (err) { if (vivo) setError(err.message) }
    })()
    return () => { vivo = false }
  }, [clienteId, year])

  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i)
  const TIPO = {
    FACTURA: ['Factura', 'badge-info'],
    NOTA_CREDITO: ['Nota de crédito', 'badge-danger'],
    PAGO_REP: ['Pago (REP)', 'badge-neutral'],
    PAGO_PUE: ['Pago (PUE)', 'badge-neutral'],
    COBRO_BANCO: ['Cobro (banco)', 'badge-ok'],
  }

  return (
    <section>
      <div className="card-head" style={{ marginBottom: 10, gap: 10 }}>
        <h2 style={{ margin: 0 }}>Estado de cuenta</h2>
        {!completo && data?.movimientos?.length > TOPE && (
          <span className="muted" style={{ fontWeight: 400 }}>
            últimos {TOPE} de {data.movimientos.length}
          </span>
        )}
        <div className="head-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }} className="no-print">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="ghost no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {/* Antes esta sección vivía detrás de una pestaña y sólo se armaba al
          entrar. Ahora se pinta siempre, así que una respuesta incompleta ya
          no rompe sólo su pestaña: se lleva el expediente entero. Por eso se
          exige la forma, no sólo que haya respuesta. */}
      {!Array.isArray(data?.movimientos) ? (
        <p className="muted">
          {error ? 'No se pudo armar el estado de cuenta.' : 'Armando el estado de cuenta…'}
        </p>
      ) : (
        <>
          <table>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Referencia</th><th className="num">Cargo</th><th className="num">Abono</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              <tr>
                <td colSpan={5} className="muted">Saldo anterior al {data.year}</td>
                <td className="num">{mxn(data.saldoAnterior)}</td>
              </tr>
              {/* Un mayor se lee en orden y con saldo corrido, así que no se
                  puede cortar por arriba sin más: el saldo del primer renglón
                  mostrado ya viene de arrastre. Se enseña el tramo RECIENTE
                  —que es lo que se consulta— y el renglón de arriba dice de
                  dónde venía el saldo. El año completo, en «Ver todas». */}
              {!completo && data.movimientos.length > TOPE && (
                <tr>
                  <td colSpan={5} className="muted">
                    {data.movimientos.length - TOPE} movimiento(s) anteriores no se muestran
                  </td>
                  <td className="num muted">
                    {mxn(data.movimientos[data.movimientos.length - TOPE - 1].saldo)}
                  </td>
                </tr>
              )}
              {(completo ? data.movimientos : data.movimientos.slice(-TOPE)).map((m, i) => (
                // Cada movimiento del mayor nace de un CFDI y lo trae consigo.
                // Un cobro conciliado en banco puede no traerlo: ese renglón
                // no navega, en vez de llevar a una pantalla vacía.
                <tr key={i} {...(m.invoiceId ? ligaFila(() => setCfdi(m.invoiceId), 'Ver el CFDI de este movimiento') : {})}>
                  <td>{fecha(m.fecha)}</td>
                  <td><span className={`badge ${TIPO[m.tipo]?.[1] ?? ''}`}>{TIPO[m.tipo]?.[0] ?? m.tipo}</span></td>
                  <td className="mono">{m.referencia ?? '—'}</td>
                  <td className="num">{m.cargo > 0 ? mxn(m.cargo) : '—'}</td>
                  <td className="num">{m.abono > 0 ? mxn(m.abono) : '—'}</td>
                  <td className={'num'}>{mxn(m.saldo)}</td>
                </tr>
              ))}
              {data.movimientos.length === 0 && <tr><td colSpan={6} className="muted">Sin movimientos en {data.year}.</td></tr>}
            </tbody>
          </table>
          <p className="faint" style={NOTA}>
            {data.resumen.movimientos} movimientos · cargos {mxn(data.resumen.cargos)} · abonos {mxn(data.resumen.abonos)} ·{' '}
            saldo final <b className={data.resumen.saldoFinal > 0.01 ? 'neg' : ''}>{mxn(data.resumen.saldoFinal)}</b>.
            Documental: facturas y NC del CFDI, pagos por REP (con su fecha legal), PUE liquidadas en su emisión y cobros conciliados en banco.
          </p>
        </>
      )}
    </section>
  )
}

// Pestañas del expediente. `contar` alimenta el badge para saber de un vistazo
// dónde hay algo; null = sin contador (el estado de cuenta se arma aparte).


// Props de un renglón navegable. Se aplica al <tr> completo y deja el teclado
// funcionando: un renglón que sólo responde al clic es invisible para quien
// navega con tabulador.
function ligaFila(alDisparar, titulo) {
  return {
    className: 'fila-liga',
    tabIndex: 0,
    role: 'link',
    title: titulo,
    onClick: alDisparar,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alDisparar() }
    },
  }
}

// Un control dentro de un renglón navegable no debe disparar la navegación
// del renglón: quien toca «XML» quiere el XML, no irse a otra pantalla.
const soloEsto = (fn) => (e) => { e.stopPropagation(); if (fn) fn(e) }

// Un renglón de unidad. Vive aparte porque lo pintan dos lugares: la tarjeta
// del expediente, que enseña las primeras, y la ventana de «Ver todas».
function FilaUnidad({ v, lado }) {
  const ir = useNavigate()
  return (
    <tr {...ligaFila(() => ir(`/vehiculos/${v.id}`), `Abrir el expediente de ${v.marca} ${v.modelo} ${v.anio}`)}>
      <td className="mono">{v.vin}</td>
      <td style={{ fontSize: 13 }}>{v.marca} {v.modelo} {v.anio}</td>
      <td><span className={`badge badge-${v.estado}`}>{etiqueta(v.estado)}</span></td>
      <td className="num">{mxn(lado === 'CLIENTE' ? v.precioVenta : v.costoCompra)}</td>
      {lado === 'CLIENTE' && (
        <td className={`num ${v.utilidad != null && v.utilidad < 0 ? 'neg' : ''}`}>
          {v.utilidad != null ? mxn(v.utilidad) : <span className="muted">sin costo</span>}
        </td>
      )}
    </tr>
  )
}


// Un renglón de orden de servicio. Igual que FilaUnidad: lo pintan la tarjeta
// y la ventana, y tienen que verse idénticos.
function FilaServicio({ s, onVer, desglosado = false }) {
  const ir = useNavigate()
  // Sin orden derivada no hay a dónde llevar: el renglón deja de ser navegable
  // en vez de fingir una liga que no lleva a nada.
  const destino = s.orden ? () => ir(`/servicio?q=${s.orden.folio}`) : null
  return (
    <tr {...(destino ? ligaFila(destino, `Abrir la orden OS-${s.orden.folio}`) : {})}>
      <td style={{ color: 'var(--ink-3)' }}>{fecha(s.fecha)}</td>
      <td style={{ fontSize: 13 }}>{s.concepto ?? '—'}</td>
      <td>
        {/* La unidad va a OTRO lado que el renglón, así que conserva su liga. */}
        {s.vehiculo
          ? <Link to={`/vehiculos/${s.vehiculo.id}`} onClick={soloEsto()}>{s.vehiculo.marca} {s.vehiculo.modelo} {s.vehiculo.anio}</Link>
          : <span className="muted">—</span>}
      </td>
      {desglosado && <td className="num">{mxn(s.manoObra)}</td>}
      {desglosado && <td className="num">{mxn(s.refacciones)}</td>}
      <td className="num">{mxn(s.total)}</td>
      <td>
        {s.orden && <span className="mono" style={{ fontSize: 11, color: 'var(--acc)' }}>OS-{s.orden.folio}</span>}{' '}
        <span onClick={soloEsto()}><CfdiAcciones invoice={s.invoice} onVer={onVer} /></span>
      </td>
    </tr>
  )
}

// Cuántos renglones caben en la tarjeta antes de que el expediente deje de
// leerse de un vistazo. El resto vive en la ventana de detalle.
const TOPE = 20

const SECCIONES = [
  { clave: 'unidades', titulo: 'Unidades', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.unidades.length },
  { clave: 'taller', titulo: 'Taller', lados: ['CLIENTE'], contar: (p) => p.servicio?.ordenes ?? 0 },
  { clave: 'refacciones', titulo: 'Refacciones', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.refacciones?.partes ?? 0 },
  { clave: 'cobranza', titulo: 'Por cobrar', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.facturas.filter((f) => f.saldo > 1).length },
  { clave: 'facturas', titulo: 'Facturas', lados: ['CLIENTE', 'PROVEEDOR'], contar: (p) => p.facturas.length },
  { clave: 'estado', titulo: 'Estado de cuenta', lados: ['CLIENTE'], contar: () => null },
  // Relación: RPC e historial de contacto. Dibujadas, sin cablear —el modelo
  // llega en la pasada de CRM—. Se dejan a la vista para que la arquitectura
  // del expediente se lea completa y se vea qué falta.
  { clave: 'relacion', titulo: 'Relación', lados: ['CLIENTE'], contar: () => 0 },
]

export default function ContactoPerfil() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const [lado, setLado] = useState(sp.get('lado') === 'PROVEEDOR' ? 'PROVEEDOR' : 'CLIENTE')
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState(null)

  const [portalMsg, setPortalMsg] = useState(null)
  // Qué lista está abierta a pantalla completa (null = ninguna).
  const [ventana, setVentana] = useState(null)
  const [extraAbierto, setExtraAbierto] = useState(false)
  const [cfdiVista, setCfdiVista] = useState(null)
  const crearPortal = async () => {
    const email = window.prompt('Correo del cliente para su portal:', perfil?.contacto?.email ?? '')
    if (!email) return
    const password = window.prompt('Contraseña inicial (mínimo 8 caracteres):')
    if (!password) return
    setPortalMsg(null); setError(null)
    try {
      const r = await apiFetch('/api/automotriz/portal-accounts', {
        method: 'POST',
        body: { customerId: id, email, password },
      })
      setPortalMsg(`Acceso al portal listo para ${r.email} — compárteles la liga ${window.location.origin}/portal`)
    } catch (err) { setError(err.message) }
  }

  const cargar = useCallback(async () => {
    setError(null); setPerfil(null)
    const ruta = lado === 'CLIENTE' ? 'clientes' : 'proveedores'
    try {
      setPerfil(await apiFetch(`/api/automotriz/${ruta}/${id}/perfil`))
    } catch (err) { setError(err.message) }
  }, [id, lado])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div>
      {cfdiVista && <CfdiVista invoiceId={cfdiVista} onCerrar={() => setCfdiVista(null)} />}

      {/* Las listas completas. La tarjeta enseña las primeras y aquí está el
          resto, con las MISMAS columnas y los mismos componentes de fila: si
          la ventana pintara distinto, no quedaría claro cuál de las dos vistas
          es la buena. */}
      {ventana === 'unidades' && perfil && (
        <VentanaDetalle
          titulo={lado === 'CLIENTE' ? 'Unidades del cliente' : 'Unidades suministradas'}
          glosa={`${perfil.unidades.length} en total`}
          onCerrar={() => setVentana(null)}
        >
          <table className="tabla">
            <thead><tr><th>VIN</th><th>Unidad</th><th>Estado</th><th className="num">{lado === 'CLIENTE' ? 'Precio' : 'Costo'}</th>{lado === 'CLIENTE' && <th className="num">Utilidad</th>}</tr></thead>
            <tbody>
              {perfil.unidades.map((v) => <FilaUnidad key={v.id} v={v} lado={lado} />)}
            </tbody>
          </table>
        </VentanaDetalle>
      )}

      {ventana === 'cobranza' && perfil && (() => {
        const abiertas = perfil.facturas.filter((f) => f.saldo > 1)
        const dias = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)
        return (
          <VentanaDetalle
            titulo={lado === 'CLIENTE' ? 'Por cobrar' : 'Por pagar'}
            glosa={`${abiertas.length} factura(s) · ${mxn(abiertas.reduce((a, f) => a + f.saldo, 0))}`}
            onCerrar={() => setVentana(null)}
          >
            <table className="tabla">
              <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</th><th className="num">Saldo</th><th className="num">Días</th></tr></thead>
              <tbody>
                {abiertas.map((f) => (
                  <tr key={f.id} {...ligaFila(() => setCfdiVista(f.id), 'Ver el CFDI de esta factura')}>
                    <td className="mono">{[f.serie, f.folio].filter(Boolean).join('-') || '—'}</td>
                    <td>{fecha(f.fecha)}</td>
                    <td>{f.metodoPago}</td>
                    <td className="num">{mxn(f.total)}</td>
                    <td className="num">{mxn(f.pagado)}</td>
                    <td className="num neg">{mxn(f.saldo)}</td>
                    <td className="num" style={dias(f.fecha) > 60 ? { color: 'var(--neg)' } : undefined}>{dias(f.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </VentanaDetalle>
        )
      })()}

      {ventana === 'facturas' && perfil && (
        <VentanaDetalle
          titulo="Facturas"
          glosa={`${perfil.facturas.length} · ${mxn(perfil.resumen.totalFacturado)}`}
          onCerrar={() => setVentana(null)}
        >
          <table className="tabla">
            <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</th><th className="num">REP pend.</th><th className="num">Saldo</th><th>CFDI</th></tr></thead>
            <tbody>
              {perfil.facturas.map((f) => (
                <tr key={f.id} {...ligaFila(() => setCfdiVista(f.id), 'Ver el CFDI de esta factura')}>
                  <td className="mono">{[f.serie, f.folio].filter(Boolean).join('-') || '—'}</td>
                  <td>{fecha(f.fecha)}</td>
                  <td>{f.metodoPago}</td>
                  <td className="num">{mxn(f.total)}</td>
                  <td className="num">{mxn(f.pagado)}</td>
                  <td className="num">{f.repPendiente > 1 ? <span className="neg">{mxn(f.repPendiente)}</span> : '—'}</td>
                  <td className="num">{mxn(f.saldo)}</td>
                  <td onClick={soloEsto()}><CfdiAcciones invoice={f} onVer={setCfdiVista} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </VentanaDetalle>
      )}

      {ventana === 'refacciones' && perfil?.refacciones && (
        <VentanaDetalle
          titulo="Refacciones"
          glosa={`${perfil.refacciones.partes} parte(s) · ${mxn(perfil.refacciones.importe)}`}
          onCerrar={() => setVentana(null)}
        >
          <table className="tabla">
            <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Piezas</th><th className="num">Importe</th></tr></thead>
            <tbody>
              {perfil.refacciones.top.map((r) => (
                <tr key={r.numeroParte}>
                  <td className="mono">{r.numeroParte}</td>
                  <td>{r.descripcion}</td>
                  <td className="num">{r.piezas}</td>
                  <td className="num">{mxn(r.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-note">
            Detalle, <b>no venta adicional</b>: {mxn(perfil.refacciones.enOrdenes)} ya van dentro de las órdenes
            de taller y {mxn(perfil.refacciones.mostrador)} son venta de mostrador. Sumar esto con Taller
            contaría dos veces las mismas piezas.
          </div>
        </VentanaDetalle>
      )}

      {ventana === 'estado' && perfil && lado === 'CLIENTE' && (
        <VentanaDetalle titulo="Estado de cuenta" glosa={perfil.contacto.razonSocial} onCerrar={() => setVentana(null)}>
          <div style={{ padding: '16px 22px' }}>
            <EstadoDeCuenta clienteId={perfil.contacto.id} completo setCfdi={setCfdiVista} />
          </div>
        </VentanaDetalle>
      )}

      {ventana === 'taller' && perfil?.servicio && (
        <VentanaDetalle
          titulo="Órdenes de servicio"
          glosa={`${perfil.servicio.ordenes} órdenes · ${mxn(perfil.servicio.total)} · ticket promedio ${mxn(perfil.servicio.total / perfil.servicio.ordenes)}`}
          onCerrar={() => setVentana(null)}
        >
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Trabajo</th><th>Unidad</th><th className="num">M. de obra</th><th className="num">Refacc.</th><th className="num">Total</th><th>Orden y CFDI</th></tr></thead>
            <tbody>
              {perfil.servicio.ultimas.map((s) => (
                <FilaServicio key={s.id} s={s} onVer={setCfdiVista} desglosado />
              ))}
            </tbody>
          </table>
          {/* La ventana trae las últimas que devuelve el hub, que pueden ser
              menos que el total histórico. Se dice en vez de dejar que alguien
              cuente los renglones y crea que faltan. */}
          {perfil.servicio.ultimas.length < perfil.servicio.ordenes && (
            <div className="card-note">
              Se enseñan las {perfil.servicio.ultimas.length} más recientes de {perfil.servicio.ordenes}.
              El total y el ticket promedio del encabezado sí cubren las {perfil.servicio.ordenes}.
            </div>
          )}
        </VentanaDetalle>
      )}
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
        <Link to={lado === 'PROVEEDOR' ? '/proveedores' : '/clientes'}>← {lado === 'PROVEEDOR' ? 'Proveedores' : 'Clientes'}</Link>
      </p>
      {error && <div className="error">{error}</div>}
      {perfil && (
        <>
          <header className="page-head" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
              <span className="avatar" style={{ width: 52, height: 52, fontSize: 18, borderRadius: 14, flexShrink: 0 }}>
                {iniciales(perfil.contacto.razonSocial)}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{perfil.contacto.razonSocial}</h1>
                <span className="glosa" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                  <span className="mono">{perfil.contacto.rfc}</span>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 10.5, padding: '1px 6px' }}
                    onClick={() => navigator.clipboard?.writeText(perfil.contacto.rfc ?? '')}
                  >
                    Copiar RFC
                  </button>
                  {perfil.contacto.phone && (
                    <>
                      <span className="mono">{perfil.contacto.phone}</span>
                      <a
                        href={`https://wa.me/${String(perfil.contacto.phone).replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11.5 }}
                      >
                        WhatsApp →
                      </a>
                    </>
                  )}
                  {perfil.contacto.email && <span style={{ color: 'var(--ink3)' }}>{perfil.contacto.email}</span>}
                </span>
                {/* Etiquetas: lo que describe la relación, derivado de los
                    datos — nunca inventado. */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                  {etiquetasDe(perfil, lado).map((t) => (
                    <span key={t} className="badge">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="head-actions">
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={lado === 'CLIENTE'} className={lado === 'CLIENTE' ? 'activo' : ''} onClick={() => setLado('CLIENTE')}>Como cliente</button>
                <button type="button" role="tab" aria-selected={lado === 'PROVEEDOR'} className={lado === 'PROVEEDOR' ? 'activo' : ''} onClick={() => setLado('PROVEEDOR')}>Como proveedor</button>
              </div>
              {lado === 'CLIENTE' && <button onClick={crearPortal}>Crear acceso al portal</button>}
            </div>
          </header>
          {portalMsg && <div className="warn">✓ {portalMsg}</div>}

          {/* ── Pendiente ahora ─────────────────────────────────────────────
              El handoff abre los dos expedientes con lo ACCIONABLE, antes que
              con los totales: un saldo abierto o un REP que falta es lo que
              hace que alguien entre a esta pantalla. */}
          {(() => {
            const saldo = perfil.resumen?.saldo ?? 0
            const rep = perfil.resumen?.repPendienteFacturas ?? 0
            if (saldo <= 0.01 && rep === 0) return null
            const esRiesgo = lado === 'PROVEEDOR' && rep > 0
            return (
              <div
                className="card"
                style={{
                  marginBottom: 14,
                  background: esRiesgo ? 'var(--negBg)' : 'var(--warnBg)',
                  borderColor: esRiesgo ? 'var(--neg)' : 'var(--warn)',
                }}
              >
                <strong style={{ color: esRiesgo ? 'var(--neg)' : 'var(--warn)' }}>Pendiente ahora</strong>{' '}
                <span style={{ fontSize: 12.5 }}>
                  {saldo > 0.01 && (
                    <>Saldo abierto de <b>{mxn(saldo)}</b>{rep > 0 ? '. ' : '.'}</>
                  )}
                  {rep > 0 && (lado === 'CLIENTE'
                    ? <>Faltan <b>{rep}</b> complemento(s) de pago por emitir, por {mxn(perfil.resumen.repPendienteMonto)} — vencen el día 5 del mes siguiente al cobro.</>
                    : <>El proveedor no ha emitido <b>{rep}</b> complemento(s) por {mxn(perfil.resumen.repPendienteMonto)}: ese IVA no es acreditable hasta que llegue.</>)}
                </span>
              </div>
            )
          })()}


          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="kpi-label">Facturado</span>
              <span className="kpi">{mxn(perfil.resumen.totalFacturado)}</span>
              <span className="kpi-sub">
                {perfil.resumen.numFacturas} facturas
                {perfil.resumen.totalNotasCredito > 0
                  ? ` · ${mxn(perfil.resumen.totalNotasCredito)} en notas de crédito`
                  : ''}
                {perfil.resumen.totalAnticipos > 0
                  ? ` · ${mxn(perfil.resumen.totalAnticipos)} en anticipos`
                  : ''}
              </span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</span>
              <span className="kpi">{mxn(perfil.resumen.totalPagado)}</span>
              <span className="kpi-sub">Saldo: {mxn(perfil.resumen.saldo)}</span>
            </div>
            {lado === 'CLIENTE' && perfil.rentabilidad && (
              <div className="kpi-item">
                <span className="kpi-label">Utilidad generada</span>
                <span className={`kpi ${perfil.rentabilidad.utilidad >= 0 ? '' : 'neg'}`}>{mxn(perfil.rentabilidad.utilidad)}</span>
                <span className="kpi-sub">
                  {perfil.rentabilidad.unidades} unidad(es)
                  {perfil.rentabilidad.margen != null ? ` · margen ${perfil.rentabilidad.margen}%` : ''}
                  {perfil.rentabilidad.sinCosto > 0 ? ` · ${perfil.rentabilidad.sinCosto} sin costo conocido` : ''}
                </span>
              </div>
            )}
            <div className="kpi-item">
              <span className="kpi-label">Complementos</span>
              {perfil.resumen.repPendienteFacturas > 0 ? (
                <>
                  <span className="kpi neg">{mxn(perfil.resumen.repPendienteMonto)}</span>
                  <span className="kpi-sub">
                    {perfil.resumen.repPendienteFacturas} factura(s) — {lado === 'CLIENTE'
                      ? 'te falta emitir el REP (vence el día 5 del mes siguiente al cobro)'
                      : 'el proveedor no te ha emitido el REP: riesgo para tu deducción'}
                  </span>
                </>
              ) : (
                <>
                  <span className="kpi">Al día</span>
                  <span className="kpi-sub">sin REP pendiente</span>
                </>
              )}
            </div>
          </div>

          {/* Las pestañas ya no CAMBIAN la vista —el expediente entero se ve
              abajo, en dos columnas— sino que abren la lista completa a
              pantalla llena. Antes eran excluyentes y obligaban a adivinar en
              cuál estaba lo que ibas a decidir; ahora son el atajo al detalle.
              El contador dice de una si hay algo que ver. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 16px' }}>
            {SECCIONES.filter((s) => s.lados.includes(lado)).map((s) => {
              const n = s.contar(perfil)
              const vacia = n === 0
              return (
                <button
                  type="button"
                  key={s.clave}
                  className="filtro"
                  disabled={vacia}
                  title={vacia ? `${s.titulo}: nada que ver` : `Abrir ${s.titulo.toLowerCase()} completo`}
                  onClick={() => setVentana(s.clave)}
                >
                  {s.titulo}{n != null ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>

          {/* El expediente en DOS COLUMNAS, sin pestañas. A la izquierda lo que
              el cliente TIENE con la agencia —sus unidades, su taller, su
              cuenta—; a la derecha lo que la agencia tiene PENDIENTE con él.
              Estaba en pestañas y eso obligaba a adivinar dónde mirar. */}
          <div className="expediente-cols">
            <div>
            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>{lado === 'CLIENTE' ? 'Unidades del cliente' : 'Unidades suministradas'}</span>
                <span className="muted" style={{ fontWeight: 400 }}>{perfil.unidades.length} en total</span>
                {perfil.unidades.length > TOPE && (
                  <button type="button" className="ver-todas" onClick={() => setVentana('unidades')}>Ver todas →</button>
                )}
              </div>
              {perfil.unidades.length === 0 ? <p className="muted">Sin unidades.</p> : (
                <table className="tabla">
                  <thead><tr><th>VIN</th><th>Unidad</th><th>Estado</th><th className="num">{lado === 'CLIENTE' ? 'Precio' : 'Costo'}</th>{lado === 'CLIENTE' && <th className="num">Utilidad</th>}</tr></thead>
                  <tbody>
                    {perfil.unidades.slice(0, TOPE).map((v) => <FilaUnidad key={v.id} v={v} lado={lado} />)}
                  </tbody>
                  {perfil.unidades.length > TOPE && (
                    <tfoot><tr>
                      <td className="alcance" colSpan={lado === 'CLIENTE' ? 5 : 4}>
                        {TOPE} de {perfil.unidades.length}
                      </td>
                    </tr></tfoot>
                  )}
                </table>
              )}
            </section>

            <section className="card">
              <div className="card-head" style={{ gap: 10 }}>
                <span>Órdenes de servicio</span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {perfil.servicio?.ordenes > 0
                    ? `${perfil.servicio.ordenes} · ticket prom. ${mxn(perfil.servicio.total / perfil.servicio.ordenes)}`
                    : 'sin historial'}
                </span>
                {(perfil.servicio?.ultimas?.length ?? 0) > TOPE && (
                  <button type="button" className="ver-todas" onClick={() => setVentana('taller')}>Ver todas →</button>
                )}
              </div>
              {(perfil.servicio?.ordenes ?? 0) === 0 ? (
                <p className="muted">Sin órdenes de taller para este cliente todavía.</p>
              ) : (
                <>
                  <table className="tabla">
                    <thead><tr><th>Fecha</th><th>Trabajo</th><th>Unidad</th><th className="num">Total</th><th>CFDI</th></tr></thead>
                    <tbody>
                      {perfil.servicio.ultimas.slice(0, TOPE).map((s) => (
                        <FilaServicio key={s.id} s={s} onVer={setCfdiVista} />
                      ))}
                    </tbody>
                    <tfoot><tr>
                      <td className="alcance" colSpan={3}>
                        {Math.min(TOPE, perfil.servicio.ultimas.length)} de {perfil.servicio.ordenes}
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {mxn(perfil.servicio.ultimas.slice(0, TOPE).reduce((a, s) => a + s.total, 0))}
                      </td>
                      <td />
                    </tr></tfoot>
                  </table>
                  <div className="card-note">
                    Mano de obra {mxn(perfil.servicio.manoObra)} y refacciones {mxn(perfil.servicio.refacciones)} ya
                    van DENTRO del total — sumarlas aparte cuenta las piezas dos veces. Última visita {fecha(perfil.servicio.ultimaVisita)}.
                  </div>
                </>
              )}
            </section>

            {lado === 'CLIENTE' && <EstadoDeCuenta clienteId={perfil.contacto.id} setCfdi={setCfdiVista} />}
            </div>

            <div>
            {/* ── Antigüedad del saldo ────────────────────────────────────────
                Cuánto deben importa menos que desde cuándo. Mismo patrón de
                tramos que el inventario, aplicado al otro lado del libro. */}
            {(() => {
              const abiertas = (perfil.facturas ?? []).filter((f) => (f.saldo ?? 0) > 0.01)
              if (abiertas.length === 0) return null
              const hoy = Date.now()
              const tramos = TRAMOS_SALDO.map((r) => {
                const dentro = abiertas.filter((f) => {
                  const dias = Math.floor((hoy - new Date(f.fecha).getTime()) / 86400000)
                  return dias >= r.min && dias <= r.max
                })
                return {
                  ...r,
                  facturas: dentro.length,
                  importe: dentro.reduce((a, f) => a + (f.saldo ?? 0), 0),
                }
              }).filter((t) => t.facturas > 0)
              const total = tramos.reduce((a, t) => a + t.importe, 0) || 1
              return (
                <section className="card" style={{ marginBottom: 14 }}>
                  <div className="card-head" style={{ marginBottom: 12 }}>
                    <span>{lado === 'CLIENTE' ? 'Cartera del cliente' : 'Cuentas por pagar'}</span>
                    <span className="muted" style={{ fontSize: 11.5 }}>desde cuándo está abierto el saldo</span>
                  </div>
                  <div className="tramos">
                    {tramos.map((t) => (
                      <span key={t.etiqueta} title={`${t.etiqueta}: ${mxn(t.importe)}`}
                        style={{ background: t.color, width: `${(t.importe / total) * 100}%` }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                    {tramos.map((t) => (
                      <div key={t.etiqueta}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
                          <span className="tramos-punto" style={{ background: t.color }} />
                          {t.etiqueta}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, marginTop: 3,
                          color: t.etiqueta === 'Más de 60' ? 'var(--neg)' : 'var(--ink)' }}>
                          {mxn(t.importe)}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{t.facturas} factura(s)</div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })()}

            {(() => {
              const abiertas = perfil.facturas.filter((f) => f.saldo > 1)
              if (abiertas.length === 0) return <p className="muted">Sin saldo abierto — todo cobrado.</p>
              const total = abiertas.reduce((s, f) => s + f.saldo, 0)
              const dias = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)
              return (
                <section className="card">
                  <div className="card-head" style={{ gap: 10 }}>
                    <span>{lado === 'CLIENTE' ? 'Facturas por cobrar' : 'Facturas por pagar'}</span>
                    <span className="muted" style={{ fontWeight: 400 }}>{abiertas.length} · {mxn(total)}</span>
                    {abiertas.length > TOPE && (
                      <button type="button" className="ver-todas" onClick={() => setVentana('cobranza')}>Ver todas →</button>
                    )}
                  </div>
                  <table>
                    <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">Cobrado</th><th className="num">Saldo</th><th className="num">Días</th></tr></thead>
                    <tbody>
                      {abiertas.slice(0, TOPE).map((f) => (
                        <tr key={f.id} {...ligaFila(() => setCfdiVista(f.id), 'Ver el CFDI de esta factura')}>
                          <td className="mono">{folio(f)}</td>
                          <td>{fecha(f.fecha)}</td>
                          <td style={{ color: 'var(--ink-3)' }}>{f.metodoPago}</td>
                          <td className="num">{mxn(f.total)}</td>
                          <td className="num">{mxn(f.pagado)}</td>
                          <td className="num neg">{mxn(f.saldo)}</td>
                          <td className={`num ${dias(f.fecha) > 90 ? 'neg' : ''}`}>{dias(f.fecha)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {abiertas.length > TOPE && (
                      <tfoot><tr>
                        <td className="alcance" colSpan={5}>{TOPE} de {abiertas.length}</td>
                        <td className="num neg">{mxn(total)}</td>
                        <td />
                      </tr></tfoot>
                    )}
                  </table>
                  <p className="faint" style={NOTA}>
                    PUE se considera cobrada en su emisión; PPD por la mejor evidencia (REP o conciliación bancaria).
                  </p>
                  {perfil.resumen.totalAnticipos > 0 && (
                    <div className="warn" style={{ marginTop: 8 }}>
                      Este cliente tiene {mxn(perfil.resumen.totalAnticipos)} en <b>anticipos</b> facturados aparte
                      (clave <span className="mono">84111506</span>). Si la factura final se emitió por el total sin descontarlos, parte de este saldo
                      ya está cobrado y el ingreso está contado dos veces — revísalo con tu contador.
                    </div>
                  )}
                </section>
              )
            })()}

            {lado === 'CLIENTE' && (
              <>
                {/* ── Reporte problema cliente (RPC) ───────────────────────────
                    Sin modelo todavía. La caja va con la forma que va a tener:
                    cuatro cifras arriba y la lista de reportes abajo. */}
                <section className="card">
                  <div className="card-head">
                    <span>Reporte problema cliente</span>
                    <span className="badge">RPC</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>por cablear</span>
                  </div>
                  <div className="caja-stats">
                    {['RPC abiertos', 'Cerrados 12 m', 'Cierre promedio', 'Reincidencias'].map((k) => (
                      <div key={k}>
                        <span className="v pendiente">—</span>
                        <span className="k">{k}</span>
                      </div>
                    ))}
                  </div>
                  <p className="sin-cablear">
                    <b>Todavía no se levantan RPC en el sistema.</b> No hay dónde guardarlos: falta el
                    modelo con folio, severidad, área, estado y el compromiso de respuesta. Se conecta
                    en la pasada de CRM.
                  </p>
                  <p className="nota-regla">
                    Cómo debe portarse cuando exista: un RPC abierto bloquea la encuesta de satisfacción
                    de la unidad y escala a planta a los 5 días hábiles.
                  </p>
                </section>

                {/* ── Historial de contacto ────────────────────────────────────
                    Lo más cercano hoy es Prospecto.notas, que es UN renglón por
                    prospecto y se pierde cuando el prospecto se convierte en
                    cliente. Un historial necesita un renglón por toque. */}
                <section className="card">
                  <div className="card-head">
                    <span>Historial de contacto</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>por cablear</span>
                  </div>
                  <div className="caja-stats">
                    {['Contactos 12 m', 'Efectivos', 'Tasa de contacto'].map((k) => (
                      <div key={k}>
                        <span className="v pendiente">—</span>
                        <span className="k">{k}</span>
                      </div>
                    ))}
                  </div>
                  <p className="sin-cablear">
                    <b>No se registran los toques con el cliente.</b> Lo más cercano que existe hoy es la
                    nota del prospecto, que es un solo renglón y se pierde cuando el prospecto se vuelve
                    cliente. Un historial necesita un renglón por contacto —canal, si fue efectivo, qué se
                    dijo y quién lo hizo— y sobrevivir a la conversión. Se conecta en la pasada de CRM.
                  </p>
                  <p className="nota-regla">
                    Los mensajes de WhatsApp que ya se guardan NO sirven aquí: son del asistente hablando
                    con el personal de la agencia, no de la agencia hablando con el cliente.
                  </p>
                </section>
              </>
            )}
            </div>
          </div>

          {/* Detalle fiscal: se consulta, no se vigila. Va abajo y plegado
              para no competir con lo que sí pide acción. */}
          <details className="detalle-extra" onToggle={(e) => setExtraAbierto(e.currentTarget.open)}>
            <summary>Facturas y refacciones</summary>
            {extraAbierto && (<>
            {(
            <section>
              <h2 style={{ marginBottom: 10 }}>Facturas</h2>
              {perfil.facturas.length === 0 ? <p className="muted">Sin facturas de este lado.</p> : (
                <table>
                  <thead><tr><th>Folio</th><th>Fecha</th><th>Método</th><th className="num">Total</th><th className="num">{lado === 'CLIENTE' ? 'Cobrado' : 'Pagado'}</th><th className="num">REP pendiente</th><th className="num">Saldo</th><th>CFDI</th></tr></thead>
                  <tbody>
                    {perfil.facturas.map((f) => (
                      <tr key={f.id} {...ligaFila(() => setCfdiVista(f.id), 'Ver el CFDI de esta factura')}>
                        <td>
                          <span className="mono">{folio(f)}</span>
                          {perfil.anticipos?.some((a) => a.id === f.id) && (
                            <span className="badge badge-warn" style={{ marginLeft: 6 }}>anticipo</span>
                          )}
                        </td>
                        <td>{fecha(f.fecha)}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{f.metodoPago}</td>
                        <td className="num">{mxn(f.total)}</td>
                        <td className="num">{mxn(f.pagado)}</td>
                        <td className="num">{f.repPendiente > 1 ? <span className="neg">{mxn(f.repPendiente)}</span> : '—'}</td>
                        <td className="num">{mxn(f.saldo)}</td>
                        <td onClick={soloEsto()}><CfdiAcciones invoice={f} onVer={setCfdiVista} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            )}

            {perfil.notasCredito?.length > 0 && (
              <section style={{ marginTop: 26 }}>
                <h2 style={{ marginBottom: 10 }}>Notas de crédito ({perfil.notasCredito.length})</h2>
                <table>
                  <thead><tr><th>Folio</th><th>Fecha</th><th className="num">Importe</th><th>CFDI</th></tr></thead>
                  <tbody>
                    {perfil.notasCredito.map((n) => (
                      <tr key={n.id}>
                        <td className="mono">{[n.serie, n.folio].filter(Boolean).join('-') || '—'}</td>
                        <td>{fecha(n.fecha)}</td>
                        <td className="num neg">−{mxn(n.total)}</td>
                        <td onClick={soloEsto()}><CfdiAcciones invoice={n} onVer={setCfdiVista} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="faint" style={NOTA}>
                  Restan a lo facturado; las que referencian un VIN también restan a la utilidad de esa unidad.
                </p>
              </section>
            )}

            {(perfil.refacciones?.partes ?? 0) === 0 && (
              <p className="muted">Sin refacciones ligadas a sus CFDIs.</p>
            )}
            {perfil.refacciones?.partes > 0 && (
              <section>
                <h2 style={{ marginBottom: 4 }}>Refacciones {lado === 'CLIENTE' ? 'compradas' : 'suministradas'}</h2>
                <p className="faint" style={{ margin: '0 0 12px', fontSize: 12 }}>
                  {perfil.refacciones.partes} parte(s) distintas · {perfil.refacciones.piezas} piezas ·{' '}
                  {mxn(perfil.refacciones.importe)}
                </p>
                <div className="warn" style={{ fontSize: 12, marginBottom: 12 }}>
                  Detalle, <b>no venta adicional</b>: {mxn(perfil.refacciones.enOrdenes)} ya van dentro de las órdenes de
                  taller y {mxn(perfil.refacciones.mostrador)} son venta de mostrador. Sumar esta pestaña con Taller
                  contaría dos veces las mismas piezas.
                </div>
                <table>
                  <thead><tr><th>No. de parte</th><th>Descripción</th><th className="num">Piezas</th><th className="num">Importe</th></tr></thead>
                  <tbody>
                    {perfil.refacciones.top.map((p) => (
                      <tr key={p.numeroParte}>
                        <td className="mono">{p.numeroParte}</td>
                        <td>{p.descripcion}</td>
                        <td className="num">{p.piezas}</td>
                        <td className="num">{mxn(p.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            </>)}
          </details>
        </>
      )}
    </div>
  )
}

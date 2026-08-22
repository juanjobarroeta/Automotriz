import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { AvisoError, EsqueletoTabla, Vacio } from '../components/Estados'
import { BarraTramos, Facetas, MicroBarra, Tabla } from '../components/Primitivos'

const ESTADO_LABEL = {
  EN_TRANSITO: 'En tránsito', DISPONIBLE: 'Disponible', APARTADO: 'Apartado',
  VENDIDO: 'Vendido', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
}
const USO_LABEL = { VENTA: 'Venta', DEMO: 'Demo', CORTESIA: 'Cortesía' }
const TIPO_LABEL = { NUEVO: 'Nuevo', SEMINUEVO: 'Seminuevo' }
const SEC = { color: 'var(--ink3)' }

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

// El VIN se dicta por teléfono por sus ÚLTIMOS SEIS: se resaltan y el resto se
// deja tenue. Es el handoff §3 y es como la gente lo usa de verdad.
function Vin({ vin }) {
  if (!vin) return <span style={SEC}>—</span>
  return (
    <>
      <span style={{ color: 'var(--ink3)' }}>{vin.slice(0, -6)}</span>
      <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{vin.slice(-6)}</b>
    </>
  )
}

// Vistas guardadas: cada una es una rebanada del padrón, no un filtro que se
// acumula. El default es lo que está en piso — entrar a inventario es preguntar
// «qué tengo para vender», no «qué ha pasado por aquí».
const VISTAS = [
  { clave: 'DISPONIBLE', etiqueta: 'Disponible', filtro: (v) => v.estado === 'DISPONIBLE' },
  { clave: 'EN_TRANSITO', etiqueta: 'En tránsito', filtro: (v) => v.estado === 'EN_TRANSITO' },
  { clave: 'APARTADO', etiqueta: 'Apartado', filtro: (v) => v.estado === 'APARTADO' },
  { clave: 'VENDIDO', etiqueta: 'Vendido', filtro: (v) => v.estado === 'VENDIDO' || v.estado === 'ENTREGADO' },
  { clave: 'NUEVO', etiqueta: 'Nuevo', filtro: (v) => v.tipo === 'NUEVO' && v.estado !== 'VENDIDO' && v.estado !== 'ENTREGADO' },
  { clave: 'SEMINUEVO', etiqueta: 'Seminuevo', filtro: (v) => v.tipo === 'SEMINUEVO' && v.estado !== 'VENDIDO' && v.estado !== 'ENTREGADO' },
  { clave: 'DEMO', etiqueta: 'Demo', filtro: (v) => v.uso && v.uso !== 'VENTA' && v.estado !== 'VENDIDO' && v.estado !== 'ENTREGADO' },
  // Ésta no está en el handoff: es NUESTRA excepción real. 238 unidades
  // vendidas sin CFDI de compra son 238 utilidades que no se pueden calcular.
  { clave: 'SIN_COSTO', etiqueta: 'Sin documentar', filtro: (v) => !v.costoCompra, alerta: true },
]

const RANGOS = [
  { clave: '0-30', etiqueta: '0–30 días', color: 'var(--posFill)', min: 0, max: 30 },
  { clave: '31-60', etiqueta: '31–60 días', color: 'var(--accFill)', min: 31, max: 60 },
  { clave: '61-90', etiqueta: '61–90 días', color: 'var(--warnFill)', min: 61, max: 90 },
  { clave: '+90', etiqueta: 'Más de 90', color: 'var(--negFill)', min: 91, max: Infinity },
]

// nulos SIEMPRE al final: una unidad sin dato no encabeza ningún orden.
const cmp = (get, dir = 'desc') => (a, b) => {
  const x = get(a), y = get(b)
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  if (typeof x === 'string') return dir === 'asc' ? x.localeCompare(y, 'es') : y.localeCompare(x, 'es')
  return dir === 'asc' ? x - y : y - x
}

const utilidadDe = (v) =>
  v.costoCompra && v.precioVenta ? v.precioVenta - v.costoCompra - (v.costosTotal ?? 0) : null

const ORDENES = [
  { clave: 'reciente', etiqueta: 'recién ingresadas', cmp: cmp((v) => v.diasEnPiso, 'asc') },
  { clave: 'antiguedad', etiqueta: 'días en piso', cmp: cmp((v) => v.diasEnPiso, 'desc') },
  { clave: 'interes', etiqueta: 'interés devengado', cmp: cmp((v) => v.interesPiso || null, 'desc') },
  { clave: 'costo', etiqueta: 'costo', cmp: cmp((v) => v.costoCompra || null, 'desc') },
  { clave: 'precio', etiqueta: 'precio', cmp: cmp((v) => v.precioVenta || null, 'desc') },
  { clave: 'utilidad', etiqueta: 'utilidad proyectada', cmp: cmp(utilidadDe, 'desc') },
  { clave: 'marca', etiqueta: 'marca y modelo', cmp: cmp((v) => `${v.marca ?? ''} ${v.modelo ?? ''}`.trim(), 'asc') },
  { clave: 'anio', etiqueta: 'año', cmp: cmp((v) => v.anio, 'desc') },
]

export default function Inventario() {
  const { activeCompany } = useAuth()
  const [params] = useSearchParams()
  const [items, setItems] = useState([])
  // El menú entra aquí con ?vista= (Seminuevos es esta misma pantalla, otra
  // rebanada). Sólo manda en el primer render: después el chip es el que manda.
  const [vista, setVista] = useState(() => {
    const v = params.get('vista')
    return v && VISTAS.some((x) => x.clave === v) ? v : 'DISPONIBLE'
  })
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState('reciente')
  // Tramo de antigüedad elegido desde la barra. null = todos.
  const [tramo, setTramo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAlta, setShowAlta] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ companyId: activeCompany.id })
      const data = await apiFetch(`/api/automotriz/vehiculos?${qs}`)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])

  // Los conteos de las vistas se calculan sobre TODO el padrón, no sobre lo
  // que la vista activa deja ver: un chip que cambia de número al hacer clic
  // en otro no sirve para decidir a dónde ir.
  const conteos = useMemo(() => {
    const m = {}
    for (const v of VISTAS) m[v.clave] = items.filter(v.filtro).length
    return m
  }, [items])

  const visibles = useMemo(() => {
    const def = VISTAS.find((v) => v.clave === vista)
    let out = def ? items.filter(def.filtro) : items
    const t = q.trim().toLowerCase()
    if (t) {
      out = out.filter((v) => {
        const texto = `${v.vin} ${v.marca} ${v.modelo} ${v.version ?? ''} ${v.anio} ${v.color ?? ''} ${v.numeroEconomico ?? ''} ${v.cliente?.razonSocial ?? ''}`.toLowerCase()
        return t.split(/\s+/).filter(Boolean).every((p) => texto.includes(p))
      })
    }
    if (tramo) {
      const r = RANGOS.find((x) => x.clave === tramo)
      if (r) out = out.filter((v) => v.diasEnPiso != null && v.diasEnPiso >= r.min && v.diasEnPiso <= r.max)
    }
    const criterio = ORDENES.find((o) => o.clave === orden) ?? ORDENES[0]
    return [...out].sort(criterio.cmp)
  }, [items, vista, q, orden, tramo])

  // El capital en piso es de lo que SIGUE en piso: contar lo vendido lo infla.
  const enPiso = useMemo(
    () => items.filter((v) => (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO') && (v.uso ?? 'VENTA') === 'VENTA'),
    [items]
  )
  const capital = enPiso.reduce((a, v) => a + (v.costoCompra ?? 0), 0)

  return (
    <div>
      <header className="page-head">
        <h1>Inventario</h1>
        {!loading && items.length > 0 && (
          <span className="glosa">
            {enPiso.length.toLocaleString('es-MX')} unidades en piso ·{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{mxn(capital)}</span> de capital
          </span>
        )}
        <div className="head-actions">
          <input
            placeholder="Buscar VIN, marca, modelo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220, width: 'auto' }}
          />
          <button onClick={() => setShowAlta(true)}>Alta de unidad</button>
        </div>
      </header>

      {!loading && enPiso.length > 0 && (() => {
        const elegirTramo = (clave) => {
          setTramo((t) => (t === clave ? null : clave))
          if (!['DISPONIBLE', 'EN_TRANSITO', 'APARTADO', 'NUEVO', 'SEMINUEVO', 'DEMO'].includes(vista)) setVista('DISPONIBLE')
        }
        const tramos = RANGOS.map((r) => {
          const dentro = enPiso.filter((v) => v.diasEnPiso != null && v.diasEnPiso >= r.min && v.diasEnPiso <= r.max)
          return {
            clave: r.clave, etiqueta: r.etiqueta, color: r.color, unidades: dentro.length,
            importe: dentro.reduce((a, v) => a + (v.costoCompra ?? 0), 0),
            interes: dentro.reduce((a, v) => a + (v.interesPiso ?? 0), 0),
          }
        })
        const interesTotal = enPiso.reduce((a, v) => a + (v.interesPiso ?? 0), 0)
        const viejas = enPiso.filter((v) => (v.diasEnPiso ?? 0) > 90)
        const interesViejas = viejas.reduce((a, v) => a + (v.interesPiso ?? 0), 0)
        const sinFecha = enPiso.filter((v) => v.diasEnPiso == null).length
        return (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'stretch' }}>
            <section className="card" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Antigüedad de la unidad</span>
                <span className="muted" style={{ fontSize: 11.5 }}>cuánto plan piso se paga por metal parado</span>
              </div>
              <div className="tramos">
                {tramos.map((t) => (
                  <button
                    key={t.clave}
                    type="button"
                    title={`${t.etiqueta}: ${t.unidades} — clic para ver sólo éstas`}
                    aria-pressed={tramo === t.clave}
                    onClick={() => elegirTramo(t.clave)}
                    style={{
                      background: t.color,
                      width: `${(t.unidades / (enPiso.length || 1)) * 100}%`,
                      border: 0, padding: 0, cursor: 'pointer',
                      opacity: tramo && tramo !== t.clave ? 0.35 : 1,
                    }}
                  />
                ))}
              </div>
              {/* La leyenda del handoff: etiqueta, la cifra grande, y debajo
                  las unidades con su interés. Cuatro columnas, no una rejilla. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 14 }}>
                {tramos.map((t) => (
                  <button
                    key={t.clave}
                    type="button"
                    onClick={() => elegirTramo(t.clave)}
                    aria-pressed={tramo === t.clave}
                    style={{
                      background: tramo === t.clave ? 'var(--panel2)' : 'transparent',
                      border: '1px solid', borderColor: tramo === t.clave ? 'var(--line2)' : 'transparent',
                      borderRadius: 'var(--radius-chip)', padding: '6px 8px', margin: '-6px -8px',
                      textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
                      <span className="tramos-punto" style={{ background: t.color }} />
                      {t.etiqueta}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, marginTop: 4,
                      color: t.etiqueta === 'Más de 90' ? 'var(--neg)' : 'var(--ink)' }}>
                      {mxn(t.importe)}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {t.unidades} u · interés {mxn(t.interes)}
                    </div>
                  </button>
                ))}
              </div>
              {sinFecha > 0 && (
                <p className="muted" style={{ fontSize: 11, marginTop: 12, marginBottom: 0 }}>
                  {sinFecha} sin fecha de entrada — no entran al conteo por tramo.
                </p>
              )}
            </section>
            {interesTotal > 0 && (
              <section className="card" style={{ width: 250, flexShrink: 0, background: 'var(--negBg)', borderColor: 'var(--neg)' }}>
                <span className="kpi-label">Interés devengado</span>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--neg)', margin: '6px 0 8px' }}>
                  {mxn(interesTotal)}
                </div>
                {viejas.length > 0 && interesTotal > 0 && (
                  <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                    Las {viejas.length} unidades de más de 90 días son el{' '}
                    {Math.round((interesViejas / interesTotal) * 100)}% de ese costo.
                  </p>
                )}
              </section>
            )}
          </div>
        )
      })()}

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <Facetas
            opciones={VISTAS.map((v) => ({
              clave: v.clave, etiqueta: v.etiqueta, conteo: conteos[v.clave], alerta: v.alerta,
            }))}
            valor={vista}
            onCambio={setVista}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Un filtro que no se ve es un filtro que le echan la culpa a los
                datos: el tramo activo se anuncia y se puede quitar de un clic. */}
            {tramo && (
              <button
                type="button"
                className="faceta activa"
                onClick={() => setTramo(null)}
                title="Quitar el filtro de antigüedad"
              >
                {RANGOS.find((r) => r.clave === tramo)?.etiqueta} ✕
              </button>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
              Orden
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                style={{ width: 'auto', height: 29, fontSize: 11.5, padding: '0 8px' }}
              >
                {ORDENES.map((o) => (
                  <option key={o.clave} value={o.clave}>{o.etiqueta} ↓</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}
      {loading ? (
        <EsqueletoTabla columnas={[2, 1, 2, 1, 1, 1, 1, 1, 1, 1]} filas={8} />
      ) : visibles.length === 0 ? (
        error ? null : items.length > 0 ? (
          <Vacio
            icono="filtro"
            titulo="Ninguna unidad en esta vista"
            detalle={`Hay ${items.length.toLocaleString('es-MX')} unidades en el padrón; ${tramo ? 'el tramo de antigüedad' : q.trim() ? 'la búsqueda' : 'esta vista'} las deja todas fuera.`}
            accion={<button type="button" className="ghost" onClick={() => { setVista('DISPONIBLE'); setQ(''); setTramo(null) }}>Ver lo disponible</button>}
          />
        ) : (
          <Vacio
            titulo="Todavía no hay unidades en el padrón"
            detalle="Cada unidad que des de alta aparece aquí con su VIN, su costo y su estado en el piso."
            accion={<button type="button" onClick={() => setShowAlta(true)}>Alta de unidad</button>}
          />
        )
      ) : (
        <Tabla
          columnas={[
            { clave: 'vin', etiqueta: 'VIN' },
            { clave: 'marca', etiqueta: 'Marca' },
            { clave: 'modelo', etiqueta: 'Modelo' },
            { clave: 'anio', etiqueta: 'Año', num: true },
            { clave: 'color', etiqueta: 'Color' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'tipo', etiqueta: 'Tipo' },
            { clave: 'dias', etiqueta: 'Días en piso', num: true },
            { clave: 'interes', etiqueta: 'Interés devengado', num: true },
            { clave: 'costo', etiqueta: 'Costo', num: true },
            { clave: 'precio', etiqueta: 'Precio', num: true },
            { clave: 'utilidad', etiqueta: 'Utilidad proy.', num: true },
          ]}
          filas={visibles.slice(0, 200)}
          claveFila={(v) => v.id}
          esExcepcion={(v) => (v.diasEnPiso ?? 0) > 90 && (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO')}
          render={{
            vin: (v) => (
              <span className="mono">
                <Link to={`/vehiculos/${v.id}`}><Vin vin={v.vin} /></Link>
                {v.ciclo > 1 ? <> <span className="badge" title="La unidad ya pasó antes por el piso">{v.ciclo}º ciclo</span></> : null}
              </span>
            ),
            marca: (v) => v.marca,
            // La versión es la ficha técnica completa de la planta («Active,
            // automático, 1.5 lts., Turbo, 4 cil., CVT»). En una lista no cabe
            // y no ayuda a distinguir: vive en el title y en el expediente.
            modelo: (v) => <span title={v.version || undefined}>{v.modelo}</span>,
            anio: (v) => <span style={SEC}>{v.anio}</span>,
            color: (v) => (v.color ? <span style={SEC}>{v.color}</span> : <span style={{ color: 'var(--ink3)' }}>—</span>),
            estado: (v) => <span className={`badge badge-${v.estado}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span>,
            tipo: (v) => (
              <span style={SEC}>
                {TIPO_LABEL[v.tipo] ?? v.tipo}
                {v.uso && v.uso !== 'VENTA' ? <> <span className="badge">{USO_LABEL[v.uso] ?? v.uso}</span></> : null}
              </span>
            ),
            dias: (v) => (v.diasEnPiso == null
              ? <span style={{ color: 'var(--ink3)' }}>n/d</span>
              : <MicroBarra valor={v.diasEnPiso} />),
            interes: (v) => (v.interesPiso > 0
              ? <span style={{ color: 'var(--neg)' }}>{mxn(v.interesPiso)}</span>
              : <span style={{ color: 'var(--ink3)' }}>—</span>),
            costo: (v) => (v.costoCompra
              ? mxn(v.costoCompra)
              : <span style={{ color: 'var(--neg)' }}>sin documentar</span>),
            precio: (v) => mxn(v.precioVenta),
            // Sin costo no hay utilidad que proyectar: n/d, nunca un cero.
            utilidad: (v) => {
              if (!v.costoCompra || !v.precioVenta) return <span style={{ color: 'var(--ink3)' }}>n/d</span>
              const u = v.precioVenta - v.costoCompra - (v.costosTotal ?? 0)
              return <span style={u < 0 ? { color: 'var(--neg)' } : undefined}>{mxn(u)}</span>
            },
          }}
          pie={{
            alcance: `${Math.min(visibles.length, 200).toLocaleString('es-MX')} de ${visibles.length.toLocaleString('es-MX')}`,
            valores: {
              dias: (() => {
                const con = visibles.filter((v) => v.diasEnPiso != null)
                return con.length ? Math.round(con.reduce((a, v) => a + v.diasEnPiso, 0) / con.length) : '—'
              })(),
              interes: mxn(visibles.reduce((a, v) => a + (v.interesPiso ?? 0), 0)),
              costo: mxn(visibles.reduce((a, v) => a + (v.costoCompra ?? 0), 0)),
              precio: mxn(visibles.reduce((a, v) => a + (v.precioVenta ?? 0), 0)),
            },
          }}
        />
      )}

      {showAlta && (
        <AltaUnidad
          companyId={activeCompany.id}
          onClose={() => setShowAlta(false)}
          onCreated={() => { setShowAlta(false); cargar() }}
        />
      )}
    </div>
  )
}

function AltaUnidad({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({
    vin: '', marca: '', modelo: '', version: '', anio: new Date().getFullYear(),
    tipo: 'NUEVO', color: '', costoCompra: '', precioLista: '', planPisoTasaAnual: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await apiFetch('/api/automotriz/vehiculos', {
        method: 'POST',
        body: {
          companyId,
          vin: form.vin,
          marca: form.marca,
          modelo: form.modelo,
          version: form.version || null,
          anio: Number(form.anio),
          tipo: form.tipo,
          color: form.color || null,
          costoCompra: form.costoCompra ? Number(form.costoCompra) : 0,
          precioLista: form.precioLista ? Number(form.precioLista) : null,
          planPisoTasaAnual: form.planPisoTasaAnual ? Number(form.planPisoTasaAnual) / 100 : null,
        },
      })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Alta de unidad</h2>
        <div className="grid2">
          <label>VIN<input className="mono" style={{ fontSize: 12.5 }} value={form.vin} onChange={set('vin')} required minLength={11} maxLength={17} /></label>
          <label>Tipo
            <select value={form.tipo} onChange={set('tipo')}>
              <option value="NUEVO">Nuevo</option>
              <option value="SEMINUEVO">Seminuevo</option>
            </select>
          </label>
          <label>Marca<input value={form.marca} onChange={set('marca')} required /></label>
          <label>Modelo<input value={form.modelo} onChange={set('modelo')} required /></label>
          <label>Versión<input value={form.version} onChange={set('version')} /></label>
          <label>Año<input type="number" value={form.anio} onChange={set('anio')} required /></label>
          <label>Color<input value={form.color} onChange={set('color')} /></label>
          <label>Costo compra (sin IVA)<input type="number" step="0.01" value={form.costoCompra} onChange={set('costoCompra')} /></label>
          <label>Precio lista<input type="number" step="0.01" value={form.precioLista} onChange={set('precioLista')} /></label>
          <label>Tasa plan piso (% anual)<input type="number" step="0.01" value={form.planPisoTasaAnual} onChange={set('planPisoTasaAnual')} /></label>
        </div>
        <div className="card-note">
          La unidad nace en tránsito; al recibirla se postea el inventario a contabilidad.
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

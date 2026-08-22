import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { AvisoError, EsqueletoTabla, Vacio } from '../components/Estados'
import { BarraTramos, MicroBarra, Tabla } from '../components/Primitivos'

const ESTADOS = ['', 'EN_TRANSITO', 'DISPONIBLE', 'APARTADO', 'VENDIDO', 'ENTREGADO', 'CANCELADO']

// Los chips nunca van en mayúsculas forzadas (DESIGN §6): el enum se rotula.
const ESTADO_LABEL = {
  EN_TRANSITO: 'En tránsito', DISPONIBLE: 'Disponible', APARTADO: 'Apartado',
  VENDIDO: 'Vendido', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
}
const USO_LABEL = { VENTA: 'Venta', DEMO: 'Demo', CORTESIA: 'Cortesía' }
const TIPO_LABEL = { NUEVO: 'Nuevo', SEMINUEVO: 'Seminuevo' }

// Columnas secundarias de la tabla: 12.5px --ink-3 (DESIGN §6 «Tabla»).
const SEC = { color: 'var(--ink-3)' }

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export default function Inventario() {
  const { activeCompany } = useAuth()
  const [items, setItems] = useState([])
  // Por default sólo lo que está en piso: entrar a inventario es preguntar
  // «qué tengo para vender», no «qué ha pasado por aquí».
  const [estado, setEstado] = useState('DISPONIBLE')
  const [soloUso, setSoloUso] = useState('')
  const [q, setQ] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [color, setColor] = useState('')
  const [anio, setAnio] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAlta, setShowAlta] = useState(false)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setLoading(true)
    setError(null)
    try {
      // Se pide el padrón completo y el estado se filtra del lado del cliente:
      // así las cifras de arriba (en piso, vendidas, demos) siguen contando
      // sobre todo el inventario aunque la tabla enseñe una rebanada.
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

  // Los filtros de cliente, en un solo lugar: los usa la tabla Y el estado
  // vacío, que es lo que antes no cuadraba.
  const visibles = items
    .filter((v) => !estado || v.estado === estado)
    .filter((v) => !soloUso || v.uso === soloUso)
    .filter((v) => !marca || v.marca === marca)
    .filter((v) => !modelo || v.modelo === modelo)
    .filter((v) => !color || v.color === color)
    .filter((v) => !anio || String(v.anio) === String(anio))
    .filter((v) => {
      if (!q.trim()) return true
      const texto = `${v.vin} ${v.marca} ${v.modelo} ${v.version ?? ''} ${v.anio} ${v.color ?? ''} ${v.numeroMotor ?? ''} ${v.numeroEconomico ?? ''} ${v.cliente?.razonSocial ?? ''} ${v.supplier?.razonSocial ?? ''}`.toLowerCase()
      // Cada palabra de la búsqueda debe aparecer (VIN parcial cuenta).
      return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => texto.includes(t))
    })

  // Filtrado a cero ≠ padrón vacío. Son dos mensajes distintos porque son dos
  // problemas distintos: uno se arregla dando de alta una unidad, el otro
  // quitando un filtro.
  const hayFiltros = Boolean(estado || soloUso || marca || modelo || color || anio || q.trim())
  const limpiarFiltros = () => {
    setEstado(''); setSoloUso(''); setMarca(''); setModelo(''); setColor(''); setAnio(''); setQ('')
  }

  return (
    <div>
      <header className="page-head">
        <h1>Inventario de unidades</h1>
        {!loading && items.length > 0 && (
          <span className="glosa">{items.length} unidades en el padrón</span>
        )}
        <div className="head-actions">
          <input
            placeholder="Buscar VIN, marca, modelo, motor, cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260, width: 'auto' }}
          />
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 'auto' }}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e ? ESTADO_LABEL[e] : 'Todos los estados'}</option>
            ))}
          </select>
          <select value={soloUso} onChange={(e) => setSoloUso(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los usos</option>
            <option value="VENTA">Venta</option>
            <option value="DEMO">Demo</option>
            <option value="CORTESIA">Cortesía</option>
          </select>
          <select value={marca} onChange={(e) => { setMarca(e.target.value); setModelo('') }} style={{ width: 'auto' }}>
            <option value="">Todas las marcas</option>
            {[...new Set(items.map((v) => v.marca))].sort().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los modelos</option>
            {[...new Set(items.filter((v) => !marca || v.marca === marca).map((v) => v.modelo).filter(Boolean))]
              .sort().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los colores</option>
            {[...new Set(items.map((v) => v.color).filter(Boolean))].sort().map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Año</option>
            {[...new Set(items.map((v) => v.anio))].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowAlta(true)}>+ Alta de unidad</button>
        </div>
      </header>

      {!loading && items.length > 0 && (() => {
        const enPiso = items.filter((v) => (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO') && (v.uso ?? 'VENTA') === 'VENTA')
        const vendidas = items.filter((v) => v.estado === 'VENDIDO' || v.estado === 'ENTREGADO')
        const sinCosto = vendidas.filter((v) => !v.costoCompra)
        const demos = items.filter((v) => v.uso && v.uso !== 'VENTA' && v.estado !== 'VENDIDO' && v.estado !== 'ENTREGADO')
        // Inventario es pantalla de catálogo: la cifra va a 27px (DESIGN §6).
        const cols = sinCosto.length > 0 ? 5 : 4
        return (
          <div className="kpi-strip densa" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, paddingBottom: 20, marginBottom: 20 }}>
            <div className="kpi-item">
              <span className="kpi-label">En piso</span>
              <span className="kpi">{enPiso.length}</span>
              <span className="kpi-sub">{mxn(enPiso.reduce((s, v) => s + v.costoCompra, 0))} en inventario</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Apartadas</span>
              <span className="kpi">{items.filter((v) => v.estado === 'APARTADO').length}</span>
              <span className="kpi-sub">comprometidas con cliente</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Vendidas</span>
              <span className="kpi">{vendidas.length}</span>
              <span className="kpi-sub">facturadas y entregadas</span>
            </div>
            <div className="kpi-item">
              <span className="kpi-label">Demos / cortesía</span>
              <span className="kpi">{demos.length}</span>
              <span className="kpi-sub">fuera del piso de venta</span>
            </div>
            {sinCosto.length > 0 && (
              <div className="kpi-item">
                <span className="kpi-label">Sin costo (pre-2021)</span>
                <span className="kpi neg">{sinCosto.length}</span>
                <span className="kpi-sub">captúralos en el detalle</span>
              </div>
            )}
          </div>
        )
      })()}

      {!loading && items.length > 0 && (() => {
        // Los tramos se calculan sobre lo que SIGUE en piso: una unidad
        // vendida ya dejó de devengar y contarla inflaría el costo de hoy.
        const enPiso = items.filter(
          (v) => (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO') && (v.uso ?? 'VENTA') === 'VENTA'
        )
        const rangos = [
          { etiqueta: '0–30 días', color: 'var(--posFill)', min: 0, max: 30 },
          { etiqueta: '31–60 días', color: 'var(--accFill)', min: 31, max: 60 },
          { etiqueta: '61–90 días', color: 'var(--warnFill)', min: 61, max: 90 },
          { etiqueta: '+90 días', color: 'var(--negFill)', min: 91, max: Infinity },
        ]
        const tramos = rangos.map((r) => {
          const dentro = enPiso.filter((v) => v.diasEnPiso != null && v.diasEnPiso >= r.min && v.diasEnPiso <= r.max)
          return {
            etiqueta: r.etiqueta,
            color: r.color,
            unidades: dentro.length,
            importe: dentro.reduce((a, v) => a + (v.costoCompra ?? 0), 0),
            nota: dentro.reduce((a, v) => a + (v.interesPiso ?? 0), 0) > 0
              ? `${mxn(dentro.reduce((a, v) => a + (v.interesPiso ?? 0), 0))} de interés`
              : null,
          }
        })
        const interesTotal = enPiso.reduce((a, v) => a + (v.interesPiso ?? 0), 0)
        const viejas = enPiso.filter((v) => (v.diasEnPiso ?? 0) > 90)
        const interesViejas = viejas.reduce((a, v) => a + (v.interesPiso ?? 0), 0)
        const sinFecha = enPiso.filter((v) => v.diasEnPiso == null).length
        if (enPiso.length === 0) return null
        return (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'stretch' }}>
            <section className="card" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Antigüedad de la unidad</span>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  cuánto plan piso se paga por metal parado
                </span>
              </div>
              <BarraTramos tramos={tramos} />
              {sinFecha > 0 && (
                <p className="muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
                  {sinFecha} sin fecha de entrada — no entran al conteo por tramo.
                </p>
              )}
            </section>
            {interesTotal > 0 && (
              <section
                className="card"
                style={{ width: 260, flexShrink: 0, background: 'var(--negBg)', borderColor: 'var(--neg)' }}
              >
                <span className="kpi-label">Interés devengado</span>
                <div className="kpi neg" style={{ marginTop: 4 }}>{mxn(interesTotal)}</div>
                {viejas.length > 0 && (
                  <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
                    Las {viejas.length} unidades de más de 90 días son el{' '}
                    {Math.round((interesViejas / interesTotal) * 100)}% de ese costo.
                  </p>
                )}
              </section>
            )}
          </div>
        )
      })()}
      {error && <AvisoError onReintentar={cargar}>{error}</AvisoError>}
      {loading ? (
        <EsqueletoTabla columnas={[2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2]} filas={8} />
      ) : visibles.length === 0 ? (
        // Con error NO se pinta el vacío: si la consulta falló, el padrón no
        // está vacío — no lo pudimos leer. Decirle «da de alta la primera
        // unidad» a quien tiene 42 y se le cayó el hub es mentirle, y el aviso
        // de arriba ya explica qué pasó.
        error ? null : hayFiltros ? (
          <Vacio
            icono="filtro"
            titulo="Ninguna unidad coincide con estos filtros"
            detalle={
              items.length > 0
                ? `Hay ${items.length} ${items.length === 1 ? 'unidad' : 'unidades'} en el padrón, pero los filtros activos las dejan todas fuera.`
                : 'Prueba con otros filtros.'
            }
            accion={<button type="button" className="ghost" onClick={limpiarFiltros}>Quitar los filtros</button>}
          />
        ) : (
          <Vacio
            titulo="Todavía no hay unidades en el padrón"
            detalle="Cada unidad que des de alta aparece aquí con su VIN, su costo y su estado en el piso."
            accion={<button type="button" onClick={() => setShowAlta(true)}>+ Alta de unidad</button>}
          />
        )
      ) : (
        <Tabla
          columnas={[
            { clave: 'vin', etiqueta: 'VIN' },
            { clave: 'unidad', etiqueta: 'Unidad' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'tipo', etiqueta: 'Tipo' },
            { clave: 'dias', etiqueta: 'Días en piso', num: true },
            { clave: 'interes', etiqueta: 'Interés devengado', num: true },
            { clave: 'costo', etiqueta: 'Costo', num: true },
            { clave: 'precio', etiqueta: 'Precio', num: true },
            { clave: 'cliente', etiqueta: 'Cliente' },
          ]}
          filas={visibles}
          claveFila={(v) => v.id}
          // La excepción es el metal parado: +90 días marca el renglón.
          esExcepcion={(v) => (v.diasEnPiso ?? 0) > 90 && (v.estado === 'DISPONIBLE' || v.estado === 'APARTADO')}
          render={{
            vin: (v) => (
              <span className="mono">
                <Link to={`/vehiculos/${v.id}`}>{v.vin}</Link>
                {v.ciclo > 1 ? <> <span className="badge" title="La unidad ya pasó antes por el piso">{v.ciclo}º ciclo</span></> : null}
              </span>
            ),
            unidad: (v) => (
              <span className="celda2">
                <b>{v.marca} {v.modelo}{v.version ? ` ${v.version}` : ''}</b>
                <span>{[v.anio, v.color].filter(Boolean).join(' · ')}</span>
              </span>
            ),
            estado: (v) => (
              <span className={`badge badge-${v.estado}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span>
            ),
            tipo: (v) => (
              <span style={SEC}>
                {TIPO_LABEL[v.tipo] ?? v.tipo}
                {v.uso && v.uso !== 'VENTA' ? <> <span className="badge">{USO_LABEL[v.uso] ?? v.uso}</span></> : null}
              </span>
            ),
            // Sin fecha de entrada no se pinta un cero: no es que lleve cero
            // días, es que no sabemos cuándo entró.
            dias: (v) => (v.diasEnPiso == null
              ? <span style={{ color: 'var(--ink3)' }}>n/d</span>
              : <MicroBarra valor={v.diasEnPiso} />),
            interes: (v) => (v.interesPiso > 0
              ? <span style={{ color: 'var(--neg)' }}>{mxn(v.interesPiso)}</span>
              : <span style={{ color: 'var(--ink3)' }}>—</span>),
            // Costo sin documentar ≠ costo cero (contrato de integridad 2).
            costo: (v) => (v.costoCompra
              ? mxn(v.costoCompra)
              : <span style={{ color: 'var(--neg)' }}>sin documentar</span>),
            precio: (v) => mxn(v.precioVenta),
            cliente: (v) => (
              <span style={SEC}>
                {v.cliente
                  ? <Link to={`/contactos/${v.cliente.id}`}>{v.cliente.razonSocial}</Link>
                  : (v.ventaInvoiceId ? <span className="muted">Público en general</span> : '—')}
              </span>
            ),
          }}
          pie={{
            alcance: `${visibles.length} de ${items.length}`,
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

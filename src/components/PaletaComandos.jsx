import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import Icons from './Icons'

/**
 * Paleta de comandos (⌘K / Ctrl+K).
 *
 * El acto atómico de esta herramienta es «encuentra esto»: un VIN que trae el
 * cliente por teléfono, una razón social a medias, un folio de taller. Hasta
 * ahora eso costaba ir a la pantalla correcta, esperar la tabla y escribir en
 * SU buscador — y sólo encontraba dentro de esa pantalla. Aquí se teclea desde
 * donde sea y se salta directo a la ficha.
 *
 * La consulta la resuelve el hub en UNA petición (GET /api/automotriz/buscar):
 * barrer las cuatro listas completas en el navegador no escala y, peor, sólo
 * encontraría lo que se hubiera bajado.
 *
 * Los destinos de navegación se filtran aquí mismo, sin pedir nada: la paleta
 * también sirve para moverse, y moverse no debería esperar a la red.
 */

const MIN_CONSULTA = 2
const DEBOUNCE_MS = 180

const DESTINOS = [
  { to: '/panel', label: 'Panel', icon: 'panel' },
  { to: '/', label: 'Inventario', icon: 'inventario' },
  { to: '/pedidos', label: 'Pedidos', icon: 'pedidos' },
  { to: '/servicio', label: 'Servicio', icon: 'servicio' },
  { to: '/refacciones', label: 'Refacciones', icon: 'refacciones' },
  { to: '/ventas', label: 'Ventas y CRM', icon: 'ventas' },
  { to: '/rentabilidad', label: 'Rentabilidad', icon: 'rentabilidad' },
  { to: '/cartera', label: 'Cartera', icon: 'clientes' },
  { to: '/contabilidad', label: 'Contabilidad (CE)', icon: 'contabilidad' },
  { to: '/fiscal', label: 'Impuestos', icon: 'impuestos' },
  { to: '/alertas', label: 'Alertas', icon: 'alertas' },
  { to: '/cobertura', label: 'Cobertura', icon: 'cobertura' },
  { to: '/clientes', label: 'Clientes', icon: 'clientes' },
  { to: '/proveedores', label: 'Proveedores', icon: 'proveedores' },
  { to: '/configuracion', label: 'Configuración', icon: 'configuracion' },
]

const ESTADO_LABEL = {
  EN_TRANSITO: 'En tránsito', DISPONIBLE: 'Disponible', APARTADO: 'Apartado',
  VENDIDO: 'Vendido', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
  RECIBIDA: 'Recibida', EN_PROCESO: 'En proceso', LISTA: 'Lista',
  ENTREGADA: 'Entregada', CERRADA: 'Cerrada',
}

/** ⌘ en Mac, Ctrl en el resto. Sólo cambia la etiqueta que se enseña. */
const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
export const TECLA_PALETA = esMac ? '⌘K' : 'Ctrl K'

export default function PaletaComandos({ abierta, onCerrar }) {
  const navigate = useNavigate()
  const { activeCompany } = useAuth()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const listaRef = useRef(null)
  const focoPrevio = useRef(null)

  const consulta = q.trim()

  // Al abrir: foco al campo y memoria de dónde estaba el foco, para devolverlo
  // al cerrar. Sin eso, cerrar con Esc deja el foco en ninguna parte y el
  // teclado se queda sin punto de partida.
  useEffect(() => {
    if (!abierta) return
    focoPrevio.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      setQ(''); setResultados(null); setSel(0); setFallo(false)
      if (focoPrevio.current instanceof HTMLElement) focoPrevio.current.focus()
    }
  }, [abierta])

  // Consulta al hub, con freno y cancelación. Dos protecciones distintas:
  // el debounce evita una petición por tecla, y el AbortController evita que
  // una respuesta lenta de «MAJ» pise a la de «MAJ6S3» — el clásico resultado
  // que parpadea y muestra lo que ya no se está buscando.
  useEffect(() => {
    if (!abierta) return
    if (consulta.length < MIN_CONSULTA || !activeCompany?.id) {
      setResultados(null); setBuscando(false); setFallo(false)
      return
    }
    const ctrl = new AbortController()
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ companyId: activeCompany.id, q: consulta })
        const data = await apiFetch(`/api/automotriz/buscar?${qs}`, { signal: ctrl.signal })
        if (ctrl.signal.aborted) return
        setResultados(data); setFallo(false)
      } catch (err) {
        if (ctrl.signal.aborted || err.name === 'AbortError') return
        setResultados(null); setFallo(true)
      } finally {
        if (!ctrl.signal.aborted) setBuscando(false)
      }
    }, DEBOUNCE_MS)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [abierta, consulta, activeCompany?.id])

  // Una sola lista plana de opciones «seleccionables», con sus encabezados
  // intercalados. Plana porque el teclado recorre opciones, no grupos.
  const grupos = useMemo(() => {
    const out = []
    const destinos = DESTINOS.filter((d) =>
      !consulta || d.label.toLowerCase().includes(consulta.toLowerCase())
    )
    if (destinos.length) {
      out.push({
        titulo: 'Ir a',
        items: destinos.map((d) => ({
          clave: `nav:${d.to}`, icono: d.icon, titulo: d.label, ir: () => navigate(d.to),
        })),
      })
    }
    const r = resultados
    if (r?.vehiculos?.length) {
      out.push({
        titulo: 'Unidades',
        items: r.vehiculos.map((v) => ({
          clave: `veh:${v.id}`,
          icono: 'inventario',
          titulo: `${v.marca} ${v.modelo} ${v.version ?? ''} ${v.anio}`.replace(/\s+/g, ' ').trim(),
          mono: v.vin,
          nota: [ESTADO_LABEL[v.estado] ?? v.estado, v.color].filter(Boolean).join(' · '),
          ir: () => navigate(`/vehiculos/${v.id}`),
        })),
      })
    }
    if (r?.contactos?.length) {
      out.push({
        titulo: 'Directorio',
        items: r.contactos.map((c) => ({
          clave: `con:${c.id}`, icono: 'clientes', titulo: c.razonSocial, mono: c.rfc,
          ir: () => navigate(`/contactos/${c.id}`),
        })),
      })
    }
    if (r?.ordenes?.length) {
      out.push({
        titulo: 'Órdenes de servicio',
        items: r.ordenes.map((o) => ({
          clave: `ord:${o.id}`,
          icono: 'servicio',
          titulo: o.descripcionUnidad || o.cliente?.razonSocial || `Orden ${o.folio}`,
          mono: `Folio ${o.folio}`,
          nota: ESTADO_LABEL[o.estado] ?? o.estado,
          // Servicio no tiene ficha por orden: se abre la lista con el folio
          // ya buscado, que es lo más cerca que se puede llevar a alguien.
          ir: () => navigate(`/servicio?q=${encodeURIComponent(o.folio)}`),
        })),
      })
    }
    if (r?.refacciones?.length) {
      out.push({
        titulo: 'Refacciones',
        items: r.refacciones.map((p) => ({
          clave: `ref:${p.id}`, icono: 'refacciones', titulo: p.descripcion, mono: p.numeroParte,
          ir: () => navigate(`/refacciones?q=${encodeURIComponent(p.numeroParte)}`),
        })),
      })
    }
    return out
  }, [resultados, consulta, navigate])

  const planas = useMemo(() => grupos.flatMap((g) => g.items), [grupos])

  // La selección se reancla arriba en cuanto cambia lo que hay que elegir.
  useEffect(() => { setSel(0) }, [consulta, resultados])

  const ejecutar = useCallback((item) => {
    if (!item) return
    onCerrar()
    item.ir()
  }, [onCerrar])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCerrar(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!planas.length) return
      const paso = e.key === 'ArrowDown' ? 1 : -1
      setSel((i) => (i + paso + planas.length) % planas.length)
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); ejecutar(planas[sel]) }
  }

  // Mantener a la vista lo seleccionado cuando se recorre con el teclado.
  useEffect(() => {
    listaRef.current
      ?.querySelector('[data-sel="1"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!abierta) return null

  const sinResultados =
    consulta.length >= MIN_CONSULTA && !buscando && !fallo && planas.length === 0

  let indice = -1

  return (
    <div className="paleta-fondo" onMouseDown={onCerrar}>
      <div
        className="paleta"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en la agencia"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="paleta-campo">
          <Icons.buscar />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar VIN, cliente, orden, refacción…"
            aria-label="Buscar VIN, cliente, orden o refacción"
            aria-controls="paleta-lista"
            aria-expanded="true"
            role="combobox"
            autoComplete="off"
            spellCheck="false"
          />
          {buscando && <span className="paleta-cargando" aria-hidden="true" />}
          <kbd className="paleta-kbd">esc</kbd>
        </div>

        <div className="paleta-lista" id="paleta-lista" role="listbox" ref={listaRef}>
          {grupos.map((g) => (
            <div className="paleta-grupo" key={g.titulo}>
              <div className="paleta-grupo-titulo">{g.titulo}</div>
              {g.items.map((item) => {
                indice += 1
                const i = indice
                const activo = i === sel
                const Icono = Icons[item.icono] ?? Icons.buscar
                return (
                  <button
                    type="button"
                    key={item.clave}
                    role="option"
                    aria-selected={activo}
                    data-sel={activo ? '1' : '0'}
                    className={activo ? 'paleta-item activo' : 'paleta-item'}
                    // `mousemove` y no `mouseenter`: al desplazar con el teclado
                    // el puntero queda quieto encima de otra fila y un
                    // mouseenter espurio robaba la selección.
                    onMouseMove={() => setSel(i)}
                    onClick={() => ejecutar(item)}
                  >
                    <Icono />
                    <span className="paleta-item-texto">
                      <span className="paleta-item-titulo">{item.titulo}</span>
                      {item.nota && <span className="paleta-item-nota">{item.nota}</span>}
                    </span>
                    {item.mono && <span className="paleta-item-mono">{item.mono}</span>}
                  </button>
                )
              })}
            </div>
          ))}

          {fallo && (
            <p className="paleta-mensaje">
              No se pudo buscar. Revisa la conexión con el hub e inténtalo de nuevo.
            </p>
          )}
          {sinResultados && (
            <p className="paleta-mensaje">
              Nada coincide con «{consulta}» en {activeCompany?.razonSocial ?? 'esta agencia'}.
            </p>
          )}
          {consulta.length > 0 && consulta.length < MIN_CONSULTA && (
            <p className="paleta-mensaje">Escribe una letra más para buscar.</p>
          )}
        </div>

        <div className="paleta-pie">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> cerrar</span>
          <span className="paleta-pie-agencia">{activeCompany?.razonSocial}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Engancha ⌘K / Ctrl+K en toda la app. Vive aparte del componente para que el
 * atajo funcione aunque la paleta esté cerrada (que es, justamente, cuando
 * hace falta).
 */
export function useAtajoPaleta(onAbrir) {
  useEffect(() => {
    const alTeclear = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onAbrir()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onAbrir])
}

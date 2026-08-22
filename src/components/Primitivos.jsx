// ─────────────────────────────────────────────────────────────────────────────
// Los ocho primitivos del handoff (v4). Se construyen UNA vez y las nueve
// pantallas los componen; una corrección se hace aquí y no en nueve lugares.
//
// Dos reglas del sistema viven adentro y no se negocian por pantalla:
//   · Toda tabla lleva pie de totales. Existe para que nadie exporte a Excel
//     a sumar una columna.
//   · El color significa excepción. Lo positivo va en tinta; el rojo y el
//     ámbar sólo donde algo pide acción.
// ─────────────────────────────────────────────────────────────────────────────

const mxn = (n) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

// ── 1. Tabla ────────────────────────────────────────────────────────────────
// columnas: [{ clave, etiqueta, num?, ancho? }]
// filas:    objetos; `render[clave]` permite pintar una celda a mano.
// pie:      { alcance: '8 de 96', valores: { clave: nodo } }
export function Tabla({ columnas, filas, pie, render = {}, onFila, esExcepcion, claveFila, seleccion }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tabla">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} style={{ textAlign: c.num ? 'right' : 'left', width: c.ancho }}>
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const id = claveFila ? claveFila(f) : i
            const clases = [
              onFila ? 'clicable' : '',
              esExcepcion?.(f) ? 'excepcion' : '',
              seleccion === id ? 'seleccionada' : '',
            ].filter(Boolean).join(' ')
            return (
              <tr key={id} className={clases || undefined} onClick={onFila ? () => onFila(f) : undefined}>
                {columnas.map((c) => (
                  <td key={c.clave} className={c.num ? 'num' : undefined}>
                    {render[c.clave] ? render[c.clave](f) : f[c.clave]}
                  </td>
                ))}
              </tr>
            )
          })}
          {filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} style={{ color: 'var(--ink3)' }}>
                Sin renglones para este filtro.
              </td>
            </tr>
          )}
        </tbody>
        {pie && (
          <tfoot>
            <tr>
              {columnas.map((c, i) => (
                <td
                  key={c.clave}
                  className={i === 0 ? 'alcance' : undefined}
                  style={c.num ? { textAlign: 'right' } : undefined}
                >
                  {i === 0 ? pie.alcance : (pie.valores?.[c.clave] ?? '')}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── 2. Facetas ──────────────────────────────────────────────────────────────
// opciones: [{ clave, etiqueta, conteo?, alerta? }]
export function Facetas({ opciones, valor, onCambio, extra }) {
  return (
    <div className="facetas">
      {opciones.map((o) => (
        <button
          key={o.clave}
          type="button"
          className={`faceta${valor === o.clave ? ' activa' : ''}`}
          aria-pressed={valor === o.clave}
          onClick={() => onCambio(o.clave)}
        >
          {o.etiqueta}
          {o.conteo != null && (
            <span className={`faceta-conteo${o.alerta ? ' alerta' : ''}`}>{o.conteo}</span>
          )}
        </button>
      ))}
      {extra}
    </div>
  )
}

// ── 3. Barra de tramos ──────────────────────────────────────────────────────
// tramos: [{ etiqueta, color, unidades, importe?, nota? }]
export function BarraTramos({ tramos }) {
  const total = tramos.reduce((s, t) => s + (t.unidades || 0), 0) || 1
  return (
    <div>
      <div className="tramos">
        {tramos.map((t) => (
          <span
            key={t.etiqueta}
            title={`${t.etiqueta}: ${t.unidades}`}
            style={{ background: t.color, width: `${((t.unidades || 0) / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="tramos-leyenda">
        {tramos.map((t) => (
          <div key={t.etiqueta}>
            <dt>
              <span className="tramos-punto" style={{ background: t.color }} />
              {t.etiqueta}
            </dt>
            <dd>
              {t.unidades}
              {t.importe != null && ` · ${mxn(t.importe)}`}
              {t.nota && <span style={{ color: 'var(--ink3)' }}> · {t.nota}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ── 4. Micro-barra ──────────────────────────────────────────────────────────
// Umbrales del handoff: >90 rojo, >55 ámbar, si no verde. Ancho como
// porcentaje de 120 días.
export function MicroBarra({ valor, max = 120, umbralAlto = 90, umbralMedio = 55 }) {
  const color =
    valor > umbralAlto ? 'var(--negFill)' : valor > umbralMedio ? 'var(--warnFill)' : 'var(--posFill)'
  const tinta = valor > umbralAlto ? 'var(--neg)' : 'var(--ink)'
  return (
    <span className="microbarra">
      <span className="microbarra-riel">
        <span style={{ background: color, width: `${Math.min(100, (valor / max) * 100)}%` }} />
      </span>
      <span className="microbarra-valor" style={{ color: tinta, fontWeight: valor > umbralAlto ? 600 : 400 }}>
        {valor}
      </span>
    </span>
  )
}

// ── 5. Línea de proceso ─────────────────────────────────────────────────────
// pasos: [{ etiqueta, estado: 'hecho' | 'actual' | 'pendiente', nota? }]
export function LineaProceso({ pasos }) {
  return (
    <div className="linea-proceso">
      {pasos.map((p) => (
        <div key={p.etiqueta} className={`linea-nodo ${p.estado}`}>
          <i />
          <span>{p.etiqueta}</span>
          {/* La hora bajo el nodo: en un taller «lista desde las 10:48» decide
              más que «lista». Opcional — sin ella el nodo se ve igual. */}
          {p.nota && <em>{p.nota}</em>}
        </div>
      ))}
    </div>
  )
}

// ── 6. Requisitos ───────────────────────────────────────────────────────────
// items: [{ etiqueta, estado: 'ok' | 'falta' | 'pendiente', accion?: {texto, onClick} }]
export function Requisitos({ items }) {
  const glifo = { ok: '✓', falta: '✗', pendiente: '!' }
  return (
    <div className="requisitos">
      {items.map((r) => (
        <div key={r.etiqueta} className={`requisito ${r.estado}`}>
          <span className="requisito-marca">{glifo[r.estado]}</span>
          <span>{r.etiqueta}</span>
          {r.accion && (
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); r.accion.onClick?.() }}
            >
              {r.accion.texto} →
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── 7. Maestro–detalle ──────────────────────────────────────────────────────
export function MaestroDetalle({ children, detalle, encabezadoDetalle, pieDetalle }) {
  return (
    <div className="maestro-detalle">
      <div>{children}</div>
      {detalle != null && (
        <aside>
          {encabezadoDetalle && <header>{encabezadoDetalle}</header>}
          <div style={{ padding: '16px 20px' }}>{detalle}</div>
          {pieDetalle && <footer style={{ padding: '13px 20px' }}>{pieDetalle}</footer>}
        </aside>
      )}
    </div>
  )
}

// ── 8. Modal de registro ────────────────────────────────────────────────────
// campos: [{ k, v }] — rejilla de dos columnas sobre divisores.
export function ModalRegistro({ encabezado, campos, children, acciones, onCerrar }) {
  return (
    <div className="modal-fondo" onClick={onCerrar} role="presentation">
      <div
        className="modal-registro"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header>{encabezado}</header>
        {campos?.length > 0 && (
          <dl className="modal-campos">
            {campos.map((c) => (
              <div key={c.k}>
                <dt>{c.k}</dt>
                <dd>{c.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {children && <div style={{ padding: '16px 22px' }}>{children}</div>}
        <footer>
          {acciones}
          <button type="button" className="ghost" onClick={onCerrar}>Cerrar</button>
        </footer>
      </div>
    </div>
  )
}

// ── 9. Ventana de detalle ───────────────────────────────────────────────────
// La tarjeta del expediente enseña los primeros renglones; «Ver todas» abre
// esto con la lista completa. Se separa de ModalRegistro porque el contenido
// es otro: aquella es una ficha de campos, ésta es una tabla que hay que poder
// recorrer sin que la ventana se haga infinita.
export function VentanaDetalle({ titulo, glosa, children, acciones, onCerrar }) {
  return (
    <div className="modal-fondo" onClick={onCerrar} role="presentation">
      <div className="modal-ancho" role="dialog" aria-modal="true" aria-label={titulo}
        onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="titulo">{titulo}</span>
          {glosa && <span className="glosa">{glosa}</span>}
        </header>
        <div className="cuerpo">{children}</div>
        <footer>
          {acciones}
          <button type="button" className="ghost" onClick={onCerrar}>Cerrar</button>
        </footer>
      </div>
    </div>
  )
}

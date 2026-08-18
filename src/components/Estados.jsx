/**
 * Los tres momentos en que una pantalla NO tiene datos que enseñar.
 *
 * Hasta ahora los tres se resolvían con un párrafo gris: «Cargando…», «Sin
 * unidades», y un recuadro rojo con el mensaje crudo del servidor. Son los tres
 * momentos en que el usuario más necesita que le hablen —no sabe si el sistema
 * está pensando, si está vacío o si se rompió— y son justo los que estaban sin
 * diseñar.
 *
 * Viven juntos a propósito: son el mismo problema visto tres veces, y tenerlos
 * en un archivo evita que cada pantalla invente su versión.
 */

/* ── Vacío ─────────────────────────────────────────────────────────────────
   Un vacío tiene dos causas muy distintas y NO se dicen igual:
   - No hay nada todavía → hay que decir cómo empezar (acción).
   - Hay cosas, pero el filtro las escondió → hay que decir cómo volver.
   Confundirlas es lo que produce el clásico «Sin resultados» que deja al
   usuario sin saber si el sistema está vacío o si él lo rompió. */
export function Vacio({ titulo, detalle, accion, icono = 'caja' }) {
  return (
    <div className="vacio">
      <span className="vacio-icono">{ICONOS[icono] ?? ICONOS.caja}</span>
      <p className="vacio-titulo">{titulo}</p>
      {detalle && <p className="vacio-detalle">{detalle}</p>}
      {accion && <div className="vacio-accion">{accion}</div>}
    </div>
  )
}

/* ── Error ─────────────────────────────────────────────────────────────────
   El recuadro rojo decía qué falló pero nunca qué hacer, así que el único
   camino era recargar la página entera y perder los filtros. Con `onReintentar`
   se reintenta la consulta en su sitio. */
export function AvisoError({ children, onReintentar }) {
  return (
    <div className="aviso-error" role="alert">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.01" />
      </svg>
      <span className="aviso-error-texto">{children}</span>
      {onReintentar && (
        <button type="button" className="ghost btn-fila" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

/* ── Cargando ──────────────────────────────────────────────────────────────
   «Cargando…» es una línea de texto: la tabla colapsa a un renglón y cuando
   llegan los datos la página pega un brinco. El esqueleto ocupa el espacio que
   va a ocupar el contenido, así que no hay brinco — y además comunica la forma
   de lo que viene (una tabla, no un formulario).

   `columnas` acepta un número o un arreglo de anchos relativos, para que el
   esqueleto se parezca a SU tabla y no a una genérica. */
export function EsqueletoTabla({ columnas = 5, filas = 6 }) {
  const anchos = Array.isArray(columnas)
    ? columnas
    : Array.from({ length: columnas }, (_, i) => (i === 1 ? 2 : 1))

  return (
    <div className="esqueleto" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }, (_, f) => (
        <div className="esqueleto-fila" key={f}>
          {anchos.map((peso, c) => (
            <span className="esqueleto-celda" key={c} style={{ flexGrow: peso }} />
          ))}
        </div>
      ))}
    </div>
  )
}

const ICONOS = {
  caja: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8M2 4h20v4H2zM10 12h4" />
    </svg>
  ),
  filtro: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h18l-7 8v6l-4 2v-8z" />
    </svg>
  ),
  busca: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
}

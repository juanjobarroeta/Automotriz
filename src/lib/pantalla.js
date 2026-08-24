import { useEffect, useState } from 'react'

// Ancho a partir del cual la barra lateral se va al pie (ver styles.css).
// Vive aquí para que el JS y el CSS no se contradigan: una tabla que el CSS
// cree tabla y el JS cree tarjeta se ve como las dos cosas a la vez.
export const CORTE_MOVIL = 767

/**
 * `true` en pantallas de teléfono. Escucha el cambio en vivo —girar el
 * teléfono cuenta— y no sólo al montar.
 */
export function useEsMovil() {
  const [movil, setMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(`(max-width: ${CORTE_MOVIL}px)`).matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.(`(max-width: ${CORTE_MOVIL}px)`)
    if (!mq) return
    const alCambiar = (e) => setMovil(e.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])
  return movil
}

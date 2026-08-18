import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

/**
 * Selector de agencia.
 *
 * Sustituye al `<select>` nativo invisible que había encima del lockup: aquel
 * abría el menú del sistema operativo (tipografía y colores ajenos al sistema)
 * y sólo mostraba la razón social. Cuando la cuenta tiene «Margom Motors SA de
 * CV» y «Gommar Automotriz SA de CV», la razón social no basta para distinguir
 * de un vistazo — por eso cada opción trae su RFC en mono, que es el
 * identificador con el que la gente realmente las diferencia.
 *
 * Sólo se lista lo que tiene el módulo AUTOMOTRIZ: entrar a una agencia sin el
 * módulo deja todas las pantallas vacías, así que ofrecerla es ofrecer un
 * callejón sin salida.
 */
export default function CompanySwitcher() {
  const { companies, activeCompany, selectCompany } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const cajaRef = useRef(null)

  const conModulo = companies.filter((c) => c.modulos?.includes('AUTOMOTRIZ'))

  // Cerrar al hacer clic fuera o con Escape: sin esto el popover se queda
  // colgado encima de la pantalla y hay que volver a picarle al botón.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!cajaRef.current?.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const nombre = activeCompany?.razonSocial || 'Sin agencia'

  return (
    <div className="topbar-company" ref={cajaRef}>
      <button
        type="button"
        className="topbar-company-btn"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={activeCompany?.rfc ? `${nombre} · ${activeCompany.rfc}` : nombre}
      >
        <span className="mark">{nombre[0]}</span>
        <span className="name">{nombre}</span>
        <span className="caret">▾</span>
      </button>

      {abierto && (
        <div className="company-menu" role="listbox" aria-label="Cambiar de agencia">
          <div className="company-menu-title">
            {conModulo.length > 1 ? 'Tus agencias' : 'Agencia'}
          </div>
          {conModulo.map((c) => {
            const activa = c.id === activeCompany?.id
            return (
              <button
                type="button"
                key={c.id}
                role="option"
                aria-selected={activa}
                className={activa ? 'company-option activa' : 'company-option'}
                onClick={() => { selectCompany(c.id); setAbierto(false) }}
              >
                <span className="mark">{c.razonSocial?.[0] ?? '?'}</span>
                <span className="company-option-ident">
                  <span className="company-option-name">{c.razonSocial}</span>
                  <span className="company-option-rfc">{c.rfc}</span>
                </span>
                {activa && (
                  <svg className="check" width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

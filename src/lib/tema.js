// Tema oscuro/claro. El handoff lo define como UN atributo en el documento:
// `data-tema="claro"` sobreescribe los tokens del oscuro. Sin re-render, sin
// hoja duplicada, sin componentes que conozcan el tema.
//
// Se persiste por usuario. Si nunca eligió, manda el sistema operativo; si el
// sistema tampoco opina, el default del handoff es OSCURO.

const LLAVE = 'automotriz:tema'

export function temaGuardado() {
  try {
    const t = localStorage.getItem(LLAVE)
    if (t === 'claro' || t === 'oscuro') return t
  } catch {
    /* Safari en privado tira al leer localStorage */
  }
  try {
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'claro'
  } catch {
    /* matchMedia puede no existir en entornos de prueba */
  }
  return 'oscuro'
}

export function aplicarTema(tema) {
  const t = tema === 'claro' ? 'claro' : 'oscuro'
  // El oscuro es el default de :root, así que el atributo sólo se pone para claro.
  if (t === 'claro') document.documentElement.setAttribute('data-tema', 'claro')
  else document.documentElement.removeAttribute('data-tema')
  try {
    localStorage.setItem(LLAVE, t)
  } catch {
    /* ídem */
  }
  return t
}

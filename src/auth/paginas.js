// ── Páginas del satélite y permisos de visibilidad por miembro ───────────────
// El hub guarda en CompanyMember.automotrizPaginas las LLAVES de página que un
// miembro puede ver (rejilla de Usuarios). Vacío = ve todas (default
// compatible: nadie pierde acceso hasta que un admin lo restringe). Las llaves
// son de ESTE archivo — el satélite es dueño de su lista; agregar una página
// aquí no pide nada del hub.
//
// Esto es VISIBILIDAD de UI (navegación + guard de rutas). La protección de
// escritura sigue siendo del hub: rol (VIEWER no escribe) y requireModule.

/** Catálogo para la rejilla de permisos, en el orden del árbol de navegación. */
export const PAGINAS = [
  { key: 'panel', label: 'Panel', ruta: '/panel' },
  { key: 'rentabilidad', label: 'Rentabilidad', ruta: '/rentabilidad' },
  { key: 'cobertura', label: 'Cobertura', ruta: '/cobertura' },
  { key: 'alertas', label: 'Alertas', ruta: '/alertas' },
  { key: 'ventas', label: 'Ventas y CRM', ruta: '/ventas' },
  { key: 'clientes', label: 'Clientes', ruta: '/clientes' },
  { key: 'inventario', label: 'Inventario', ruta: '/' },
  { key: 'pedidos', label: 'Pedidos a planta', ruta: '/pedidos' },
  { key: 'servicio', label: 'Órdenes de servicio', ruta: '/servicio' },
  { key: 'refacciones', label: 'Refacciones', ruta: '/refacciones' },
  { key: 'cartera', label: 'Cartera', ruta: '/cartera' },
  { key: 'proveedores', label: 'Proveedores', ruta: '/proveedores' },
  { key: 'estado-resultados', label: 'Estado de resultados', ruta: '/estado-resultados' },
  { key: 'balance', label: 'Balance general', ruta: '/balance' },
  { key: 'nomina', label: 'Nómina', ruta: '/nomina' },
  { key: 'fiscal', label: 'Impuestos', ruta: '/fiscal' },
]

/** true si el miembro puede ver la página (vacío = sin restricción). */
export function puedeVer(paginas, key) {
  if (!Array.isArray(paginas) || paginas.length === 0) return true
  return paginas.includes(key)
}

/** La llave de página de una ruta (para el guard). Los detalles heredan la
 *  llave de su lista: /vehiculos/:id es inventario, /contactos/:id clientes. */
export function paginaDeRuta(pathname) {
  if (pathname === '/' || pathname.startsWith('/vehiculos')) return 'inventario'
  if (pathname.startsWith('/contactos')) return 'clientes'
  if (pathname.startsWith('/contabilidad')) return 'estado-resultados'
  return pathname.split('/')[1] || 'inventario'
}

/** Filtra el árbol de navegación (grupos con items `to`) a lo visible; un
 *  grupo sin items visibles desaparece. Los `porConstruir` acompañan a su
 *  grupo sólo si el grupo sobrevive. */
export function filtrarNav(nav, paginas) {
  if (!Array.isArray(paginas) || paginas.length === 0) return nav
  return nav
    .map((g) => ({
      ...g,
      items: g.items.filter((n) =>
        n.porConstruir ? false : puedeVer(paginas, paginaDeRuta(n.to.split('?')[0]))
      ),
    }))
    .filter((g) => g.items.length > 0)
}

/** La primera ruta que el miembro SÍ puede ver (adónde aterriza y adónde lo
 *  manda el guard); Configuración como último recurso. */
export function primeraRutaPermitida(paginas) {
  const p = PAGINAS.find((x) => puedeVer(paginas, x.key))
  return p ? p.ruta : '/configuracion'
}

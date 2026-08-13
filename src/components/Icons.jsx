// Iconos del rail — trazo de 18px, stroke-width 1.4, fill:none, currentColor.
// Los nueve primeros vienen tal cual del mockup «Automotriz PRO»; el resto se
// dibujó con la misma retícula y el mismo grosor para que no se noten injertos.

const base = {
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const Svg = ({ children }) => <svg {...base} viewBox="0 0 18 18">{children}</svg>

export const Icons = {
  panel: () => (
    <Svg>
      <rect x="2" y="2" width="6" height="6" rx="1.6" />
      <rect x="10" y="2" width="6" height="6" rx="1.6" />
      <rect x="2" y="10" width="6" height="6" rx="1.6" />
      <rect x="10" y="10" width="6" height="6" rx="1.6" />
    </Svg>
  ),
  inventario: () => (
    <Svg>
      <path d="M2 11.4 L3.6 6.8 A1.8 1.8 0 0 1 5.3 5.6 H12.7 A1.8 1.8 0 0 1 14.4 6.8 L16 11.4 V14.4 H13.9 V13.1 H4.1 V14.4 H2 Z" />
      <circle cx="5.2" cy="11.4" r="1" />
      <circle cx="12.8" cy="11.4" r="1" />
    </Svg>
  ),
  rentabilidad: () => (
    <Svg>
      <polyline points="2,13.5 6.6,8.6 9.6,11.2 16,4.4" />
      <polyline points="11.6,4.4 16,4.4 16,8.8" />
    </Svg>
  ),
  ventas: () => (
    <Svg>
      <path d="M3.4 3.2 H14.6 A1.6 1.6 0 0 1 16.2 4.8 V10.6 A1.6 1.6 0 0 1 14.6 12.2 H8.2 L4.6 15 V12.2 H3.4 A1.6 1.6 0 0 1 1.8 10.6 V4.8 A1.6 1.6 0 0 1 3.4 3.2 Z" />
    </Svg>
  ),
  servicio: () => (
    <Svg>
      <path d="M11.9 2.3 A4.1 4.1 0 0 0 6.9 7.6 L2.4 12.1 A1.45 1.45 0 0 0 4.4 14.1 L8.9 9.6 A4.1 4.1 0 0 0 14.2 4.6 L11.9 6.9 L9.6 6.6 L9.3 4.3 Z" />
    </Svg>
  ),
  refacciones: () => (
    <Svg>
      <path d="M9 1.8 L15.8 5.2 V12.8 L9 16.2 L2.2 12.8 V5.2 Z" />
      <path d="M2.2 5.2 L9 8.6 L15.8 5.2" />
      <path d="M9 8.6 V16.2" />
    </Svg>
  ),
  impuestos: () => (
    <Svg>
      <path d="M3.6 1.8 H14.4 V16.2 L12.2 14.9 L10 16.2 L7.8 14.9 L5.6 16.2 L3.6 14.9 Z" />
      <path d="M6.2 5.6 H11.8" />
      <path d="M6.2 8.6 H11.8" />
      <path d="M6.2 11.4 H9.6" />
    </Svg>
  ),
  onboarding: () => (
    <Svg>
      <path d="M9 2.2 V11.4" />
      <polyline points="5.6,8 9,11.4 12.4,8" />
      <path d="M2.6 13.2 V14.6 A1.4 1.4 0 0 0 4 16 H14 A1.4 1.4 0 0 0 15.4 14.6 V13.2" />
    </Svg>
  ),
  portal: () => (
    <Svg>
      <circle cx="9" cy="9" r="7.1" />
      <path d="M1.9 9 H16.1" />
      <path d="M9 1.9 A10.5 10.5 0 0 1 9 16.1 A10.5 10.5 0 0 1 9 1.9 Z" />
    </Svg>
  ),
  configuracion: () => (
    <Svg>
      <circle cx="9" cy="9" r="2.9" />
      <path d="M9 1.6 V3.4" />
      <path d="M9 14.6 V16.4" />
      <path d="M1.6 9 H3.4" />
      <path d="M14.6 9 H16.4" />
      <path d="M3.8 3.8 L5.1 5.1" />
      <path d="M12.9 12.9 L14.2 14.2" />
      <path d="M14.2 3.8 L12.9 5.1" />
      <path d="M5.1 12.9 L3.8 14.2" />
    </Svg>
  ),
  pedidos: () => (
    <Svg>
      <path d="M5.4 2.6 H12.6 A1.4 1.4 0 0 1 14 4 V15 A1.4 1.4 0 0 1 12.6 16.4 H5.4 A1.4 1.4 0 0 1 4 15 V4 A1.4 1.4 0 0 1 5.4 2.6 Z" />
      <path d="M6.8 1.6 H11.2 V3.8 H6.8 Z" />
      <path d="M6.8 7.6 H11.2" />
      <path d="M6.8 10.6 H11.2" />
      <path d="M6.8 13.4 H9.4" />
    </Svg>
  ),
  contabilidad: () => (
    <Svg>
      <path d="M9 2 L16.2 5.6 L9 9.2 L1.8 5.6 Z" />
      <polyline points="1.8,9.4 9,13 16.2,9.4" />
      <polyline points="1.8,12.8 9,16.4 16.2,12.8" />
    </Svg>
  ),
  alertas: () => (
    <Svg>
      <path d="M9 2 A4.9 4.9 0 0 0 4.1 6.9 V10 L2.7 12.7 H15.3 L13.9 10 V6.9 A4.9 4.9 0 0 0 9 2 Z" />
      <path d="M7.3 14.5 A1.8 1.8 0 0 0 10.7 14.5" />
    </Svg>
  ),
  cobertura: () => (
    <Svg>
      <path d="M9 1.8 L15.2 4.2 V9 C15.2 12.6 12.6 15.3 9 16.2 C5.4 15.3 2.8 12.6 2.8 9 V4.2 Z" />
      <polyline points="6.4,8.9 8.4,10.9 11.8,7.3" />
    </Svg>
  ),
  clientes: () => (
    <Svg>
      <circle cx="7" cy="6.2" r="2.8" />
      <path d="M2.2 15.4 A4.8 4.8 0 0 1 11.8 15.4" />
      <path d="M12.4 3.8 A2.6 2.6 0 0 1 12.4 8.8" />
      <path d="M13.6 10.4 A4.4 4.4 0 0 1 16.2 14.6" />
    </Svg>
  ),
  proveedores: () => (
    <Svg>
      <path d="M2 12.4 V6.2 H9.6 V12.4" />
      <path d="M9.6 8.2 H12.8 L15.8 10.6 V12.4 H9.6 Z" />
      <circle cx="5.2" cy="13.6" r="1.5" />
      <circle cx="12.6" cy="13.6" r="1.5" />
      <path d="M2 6.2 V3.6 H9.6 V6.2" />
    </Svg>
  ),
  buscar: () => (
    <svg {...base} width="14" height="14" viewBox="0 0 14 14">
      <circle cx="6.2" cy="6.2" r="4.4" />
      <path d="M9.6 9.6 L12.6 12.6" />
    </svg>
  ),
  campana: () => (
    <svg {...base} width="15" height="15" viewBox="0 0 15 15">
      <path d="M7.5 1.8 A4.4 4.4 0 0 0 3.1 6.2 V9 L1.9 11.4 H13.1 L11.9 9 V6.2 A4.4 4.4 0 0 0 7.5 1.8 Z" />
      <path d="M6 12.8 A1.6 1.6 0 0 0 9 12.8" />
    </svg>
  ),
}

export default Icons

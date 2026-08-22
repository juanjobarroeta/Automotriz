import { Navigate } from 'react-router-dom'

// Contabilidad (CE) se retiró como destino: el estado de resultados son las
// cuentas 4–9 de esa balanza y el balance las 1–3, así que entre los dos la
// cubren entera. Tenerla aparte era una tercera vista de lo mismo.
//
// La ruta sobrevive como redirección porque hay ligas viejas apuntando aquí.
export default function ContabilidadCE() {
  return <Navigate to="/estado-resultados" replace />
}

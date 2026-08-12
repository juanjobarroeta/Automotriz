import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Absorción de servicio, mes a mes.
//
// La línea base es 100%: ahí el taller y refacciones pagan solos TODA la
// estructura de la agencia. Arriba de la línea el back end sobra y cada coche
// vendido es utilidad; abajo, el piso tiene que vender para pagar la luz.
//
// El signo NO lo carga el color. Va en tres canales a la vez —dirección
// respecto de la línea, textura (rayado abajo, sólido arriba) y el número
// escrito en cada barra— porque el par verde/rojo del sistema no separa para
// un lector deuteranope (ΔE 5.7, debajo del piso). El color queda como refuerzo
// redundante, no como el dato.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mxn = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))

const W = 760
const H = 240
const PAD = { top: 18, right: 14, bottom: 34, left: 46 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

/** Barra con el extremo del dato redondeado y la base pegada a la línea. */
function barraPath(x, ancho, yBase, yDatoCrudo, r = 4) {
  const arriba = yDatoCrudo < yBase
  // Un mes en 99% no puede desaparecer: se le garantiza trazo visible.
  const alto = Math.max(Math.abs(yBase - yDatoCrudo), 2)
  const yDato = arriba ? yBase - alto : yBase + alto
  const rr = Math.min(r, ancho / 2, alto)
  return arriba
    ? `M${x} ${yBase} V${yDato + rr} Q${x} ${yDato} ${x + rr} ${yDato} H${x + ancho - rr} Q${x + ancho} ${yDato} ${x + ancho} ${yDato + rr} V${yBase} Z`
    : `M${x} ${yBase} V${yDato - rr} Q${x} ${yDato} ${x + rr} ${yDato} H${x + ancho - rr} Q${x + ancho} ${yDato} ${x + ancho} ${yDato - rr} V${yBase} Z`
}

export default function AbsorcionGrafica({ serie }) {
  const [activo, setActivo] = useState(null)
  const datos = (serie ?? []).filter((m) => m.porcentaje != null)
  if (datos.length === 0) {
    return <p className="muted">Aún no hay meses con estructura registrada para calcular la absorción.</p>
  }

  const vals = datos.map((m) => m.porcentaje)
  const crudoLo = Math.min(...vals, 100)
  const crudoHi = Math.max(...vals, 100)
  const pad = Math.max(10, (crudoHi - crudoLo) * 0.15)
  const lo = crudoLo - pad
  const hi = crudoHi + pad
  const y = (v) => PAD.top + ((hi - v) / (hi - lo)) * PLOT_H
  const yBase = y(100)

  const paso = PLOT_W / datos.length
  const ancho = Math.min(38, paso * 0.62)
  // 2px de respiro entre barras contiguas: el hueco es del lienzo, no del dato.
  const xDe = (i) => PAD.left + i * paso + (paso - ancho) / 2

  // Guías de lectura: sólo las que caben dentro del área de trazo y no se
  // encaraman en la línea de 100% ni en los nombres de los meses.
  const guias = [...new Set([lo, (lo + hi) / 2, hi].map((v) => Math.round(v / 10) * 10))].filter(
    (v) => Math.abs(v - 100) > 6 && y(v) > PAD.top + 8 && y(v) < PAD.top + PLOT_H - 8
  )

  const sel = activo != null ? datos[activo] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="Absorción de servicio por mes contra la línea de 100 por ciento">
        <defs>
          {/* El canal accesible: rayado a 45° para los meses NO absorbidos. */}
          <pattern id="abs-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--danger-tint)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--danger)" strokeWidth="2.4" />
          </pattern>
        </defs>

        {guias.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border-hairline)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{v}%</text>
          </g>
        ))}

        {datos.map((m, i) => {
          const absorbido = m.porcentaje >= 100
          const x = xDe(i)
          return (
            <g key={m.mes} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
              {/* Blanco de hover más grande que la barra. */}
              <rect x={PAD.left + i * paso} y={PAD.top} width={paso} height={PLOT_H} fill="transparent" />
              <path
                d={barraPath(x, ancho, yBase, y(m.porcentaje))}
                fill={absorbido ? 'var(--accent)' : 'url(#abs-rayado)'}
                stroke={absorbido ? 'none' : 'var(--danger)'}
                strokeWidth={absorbido ? 0 : 1}
                opacity={activo == null || activo === i ? 1 : 0.45}
              />
              <text
                x={x + ancho / 2}
                // Se mide desde la línea, no desde el dato: así una barra
                // diminuta no le pega la etiqueta encima al 100%.
                y={absorbido
                  ? Math.min(y(m.porcentaje), yBase - 12) - 6
                  : Math.max(y(m.porcentaje), yBase + 12) + 14}
                textAnchor="middle" fontSize="11" fill="var(--ink-secondary)"
              >
                {Math.round(m.porcentaje)}%
              </text>
              <text x={x + ancho / 2} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
                {MESES[Number(m.mes.slice(5, 7)) - 1]}
              </text>
            </g>
          )
        })}

        {/* La línea que importa: 100% = el back end paga toda la estructura.
            Se rotula en el eje, no flotando sobre el trazo, para que ninguna
            barra alta le caiga encima. */}
        <line x1={PAD.left} x2={W - PAD.right} y1={yBase} y2={yBase} stroke="var(--ink)" strokeWidth="2" />
        <text x={PAD.left - 8} y={yBase + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--ink)">
          100%
        </text>
      </svg>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
        La línea es el 100%: ahí el taller y refacciones pagan solos toda la estructura. Barra sólida hacia
        arriba = mes absorbido; barra rayada hacia abajo = lo que faltó cubrir con la venta de unidades.
      </p>

      {sel && (
        <div
          className="card"
          style={{
            position: 'absolute', top: 0, right: 0, padding: '8px 12px', margin: 0,
            fontSize: 12, pointerEvents: 'none', boxShadow: 'var(--shadow-card)',
          }}
        >
          <div><strong>{sel.mes}</strong> · absorción {Math.round(sel.porcentaje)}%</div>
          <div className="muted">Utilidad taller + refacciones: {mxn(sel.utilidadFixedOps)}</div>
          <div className="muted">Estructura: {mxn(sel.estructura)}</div>
          <div className={sel.porcentaje >= 100 ? 'pos' : 'neg'}>
            {sel.porcentaje >= 100
              ? 'El back end paga solo la estructura.'
              : `Falta ${mxn(sel.estructura - sel.utilidadFixedOps)} que debe salir de vender unidades.`}
          </div>
        </div>
      )}
    </div>
  )
}

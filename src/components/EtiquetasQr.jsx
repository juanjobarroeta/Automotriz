import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Etiquetas QR de refacciones (fase 4b): hoja imprimible con el número de
// parte codificado — pegadas en el anaquel, cualquier lector (pistola o cámara
// del teléfono) escanea el código y lo teclea en la búsqueda para el conteo.
// Reusa las clases del visor de CFDI para que @media print imprima solo la hoja.
export default function EtiquetasQr({ refacciones, onCerrar }) {
  const [codigos, setCodigos] = useState(null) // id → dataURL

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const pares = await Promise.all(
        refacciones.map(async (r) => [
          r.id,
          // Tinta pura sobre blanco: la etiqueta impresa no lleva acento de color.
          await QRCode.toDataURL(r.numeroParte, {
            width: 96, margin: 1, errorCorrectionLevel: 'M',
            color: { dark: '#0A0A0A', light: '#FFFFFF' },
          }),
        ])
      )
      if (vivo) setCodigos(Object.fromEntries(pares))
    })()
    return () => { vivo = false }
  }, [refacciones])

  return (
    <div className="cfdi-overlay" onClick={onCerrar}>
      <div className="cfdi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cfdi-acciones no-print">
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Etiquetas QR</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {refacciones.length} etiqueta(s) — la página actual del catálogo
            </span>
          </div>
          <button className="ghost" onClick={onCerrar}>Cerrar</button>
          <button disabled={!codigos} onClick={() => window.print()}>Imprimir</button>
        </div>
        {!codigos ? (
          <p className="muted">Generando códigos…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {refacciones.map((r) => (
              <div key={r.id} style={{
                border: '1px solid #E8E8E8', borderRadius: 8, padding: 10,
                background: '#FFFFFF', color: '#0A0A0A',
                display: 'flex', gap: 10, alignItems: 'center', breakInside: 'avoid',
              }}>
                <img src={codigos[r.id]} alt={r.numeroParte} width={72} height={72} />
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 500, color: '#0A0A0A', wordBreak: 'break-all' }}>{r.numeroParte}</div>
                  <div style={{ fontSize: 10, color: '#525252', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {r.descripcion}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

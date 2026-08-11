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
          await QRCode.toDataURL(r.numeroParte, { width: 96, margin: 1, errorCorrectionLevel: 'M' }),
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
          <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>
            {refacciones.length} etiqueta(s) — la página actual del catálogo
          </span>
          <button className="ghost" onClick={onCerrar}>Cerrar</button>
          <button disabled={!codigos} onClick={() => window.print()}>Imprimir</button>
        </div>
        {!codigos ? (
          <p className="muted">Generando códigos…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {refacciones.map((r) => (
              <div key={r.id} style={{
                border: '1px solid #ccc', borderRadius: 6, padding: 8,
                display: 'flex', gap: 8, alignItems: 'center', breakInside: 'avoid',
              }}>
                <img src={codigos[r.id]} alt={r.numeroParte} width={72} height={72} />
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600, wordBreak: 'break-all' }}>{r.numeroParte}</div>
                  <div style={{ fontSize: 10, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
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

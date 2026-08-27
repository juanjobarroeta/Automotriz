import { useEffect, useRef, useState } from 'react'

// El NIV entra como en toda la casa: un lector (pistola o cámara-teclado) que
// TECLEA en un input enfocado y remata con Enter. La cámara del navegador es
// mejora progresiva: si BarcodeDetector existe y decodifica code_39 (el código
// de la calcomanía del NIV), aparece el botón «Escanear»; donde no, no existe.
const VIN_INVALIDOS = /[IOQ]/

export default function EscanerVin({ value, onChange, onCommit }) {
  const [camara, setCamara] = useState(false)
  const [soporta, setSoporta] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const vivoRef = useRef(false)

  useEffect(() => {
    let activo = true
    if ('BarcodeDetector' in window) {
      window.BarcodeDetector.getSupportedFormats?.()
        .then((fs) => { if (activo && (fs.includes('code_39') || fs.includes('code_128'))) setSoporta(true) })
        .catch(() => {})
    }
    return () => { activo = false }
  }, [])

  const cerrarCamara = () => {
    vivoRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamara(false)
  }
  useEffect(() => () => cerrarCamara(), [])

  const abrirCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCamara(true)
      vivoRef.current = true
      // El video se monta con el estado; el loop arranca al siguiente frame.
      requestAnimationFrame(async function tick() {
        if (!vivoRef.current) return
        const video = videoRef.current
        if (video && video.readyState >= 2) {
          try {
            const det = new window.BarcodeDetector({ formats: ['code_39', 'code_128'] })
            const codigos = await det.detect(video)
            const hit = codigos.map((c) => c.rawValue?.trim().toUpperCase()).find((v) => v && v.length === 17)
            if (hit) { onChange(hit); onCommit?.(hit); cerrarCamara(); return }
          } catch { /* frame malo: seguir */ }
        }
        requestAnimationFrame(tick)
      })
    } catch { setSoporta(false); setCamara(false) }
  }

  useEffect(() => {
    if (camara && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camara])

  const limpio = (v) => v.toUpperCase().replace(/\s+/g, '').slice(0, 17)
  const conAdvertencia = value && VIN_INVALIDOS.test(value)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="mono"
          style={{ fontSize: 13, flex: 1 }}
          placeholder="NIV (17 caracteres) — escanéalo o tecléalo"
          value={value}
          autoFocus
          maxLength={17}
          onChange={(e) => onChange(limpio(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit?.(limpio(e.currentTarget.value)) } }}
        />
        {soporta && !camara && <button type="button" className="ghost" onClick={abrirCamara}>Escanear</button>}
      </div>
      {conAdvertencia && (
        <span className="muted" style={{ fontSize: 12, color: 'var(--mal, #c0392b)' }}>
          Un NIV no lleva I, O ni Q — revisa el caracter
        </span>
      )}
      {camara && (
        <div className="hoja-fondo" onClick={cerrarCamara} role="presentation">
          <div className="hoja" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Escanear NIV">
            <div className="hoja-asa" />
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 10 }} />
            <p className="muted" style={{ margin: '8px 18px' }}>Apunta a la calcomanía del NIV (marco de la puerta o parabrisas)</p>
            <button type="button" className="ghost" style={{ margin: '0 18px 14px' }} onClick={cerrarCamara}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

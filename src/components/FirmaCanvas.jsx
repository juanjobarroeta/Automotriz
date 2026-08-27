import { useEffect, useRef, useState } from 'react'

// Firma en pantalla (dedo/stylus/mouse). El canvas pinta SU PROPIO fondo
// blanco: el PNG que se estampa al contrato no puede depender del tema de la
// app. Pointer Events con captura — un trazo que sale del recuadro no se
// corta — y touch-action:none para que el teléfono no haga scroll al firmar.
export default function FirmaCanvas({ onChange, alto = 160 }) {
  const ref = useRef(null)
  const trazos = useRef(0)
  const dibujando = useRef(false)
  const [vacia, setVacia] = useState(true)

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    const ancho = canvas.parentElement?.clientWidth || 320
    canvas.width = ancho * dpr
    canvas.height = alto * dpr
    canvas.style.width = `${ancho}px`
    canvas.style.height = `${alto}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [alto])

  const punto = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const empezar = (e) => {
    e.preventDefault()
    ref.current.setPointerCapture(e.pointerId)
    dibujando.current = true
    const ctx = ref.current.getContext('2d')
    const p = punto(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const mover = (e) => {
    if (!dibujando.current) return
    const ctx = ref.current.getContext('2d')
    const p = punto(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    trazos.current += 1
    // ~8 puntos = una firma real empezó, no un roce accidental.
    if (trazos.current === 8) { setVacia(false); onChange?.(ref.current.toDataURL('image/png')) }
    else if (trazos.current > 8) onChange?.(ref.current.toDataURL('image/png'))
  }
  const soltar = () => { dibujando.current = false }

  const limpiar = () => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    trazos.current = 0
    setVacia(true)
    onChange?.(null)
  }

  return (
    <div>
      <canvas
        ref={ref}
        className="firma-canvas"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>{vacia ? 'Firma del cliente aquí' : 'Firma capturada'}</span>
        <button type="button" className="ghost" onClick={limpiar}>Limpiar</button>
      </div>
    </div>
  )
}

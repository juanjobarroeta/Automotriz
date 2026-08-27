import { useEffect, useRef, useState } from 'react'
import { comprimirImagen } from '../lib/imagen'

const MAX_FOTOS = 10

// Fotos del checkup: cámara del teléfono (capture=environment) o galería,
// comprimidas en el navegador (~400KB JPEG) ANTES de viajar — el hub guarda
// bytea y una ráfaga de fotos de 4MB no cabe en ese patrón.
export default function CapturaFotos({ fotos, onChange }) {
  const inputRef = useRef(null)
  const [error, setError] = useState(null)
  const [procesando, setProcesando] = useState(false)

  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = async (e) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setProcesando(true)
    const nuevas = []
    for (const file of files) {
      if (fotos.length + nuevas.length >= MAX_FOTOS) break
      try { nuevas.push(await comprimirImagen(file)) }
      catch { setError(`No se pudo leer ${file.name} (¿formato HEIC?) — el resto sí entró`) }
    }
    setProcesando(false)
    if (nuevas.length) onChange([...fotos, ...nuevas])
  }

  const quitar = (i) => {
    URL.revokeObjectURL(fotos[i].previewUrl)
    onChange(fotos.filter((_, j) => j !== i))
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={agregar} />
      <div className="fotos-grid">
        {fotos.map((f, i) => (
          <div key={f.previewUrl} className="foto-mini">
            <img src={f.previewUrl} alt={`Foto ${i + 1}`} />
            <button type="button" onClick={() => quitar(i)} aria-label="Quitar foto">×</button>
            <span>{Math.round(f.bytes / 1024)} KB</span>
          </div>
        ))}
        {fotos.length < MAX_FOTOS && (
          <button type="button" className="foto-agregar" onClick={() => inputRef.current?.click()} disabled={procesando}>
            {procesando ? 'Procesando…' : '+ Agregar foto'}
          </button>
        )}
      </div>
      {error && <div className="error" style={{ marginTop: 6 }}>{error}</div>}
      <span className="muted" style={{ fontSize: 12 }}>{fotos.length}/{MAX_FOTOS} · daños existentes, interiores, tablero con el km</span>
    </div>
  )
}

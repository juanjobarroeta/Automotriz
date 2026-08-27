// Compresión de fotos EN el navegador, antes de subirlas al expediente de la
// orden. El hub guarda bytea y su tope razonable es ~400KB por foto: una foto
// de cámara (~3-5MB) se decodifica respetando la orientación EXIF, se escala
// y se recomprime bajando calidad hasta caber. HEIC u otro formato que el
// navegador no decodifica falla SOLO (el resto del lote sigue).

const MAX_LADO = 1600
const OBJETIVO_BYTES = 400 * 1024
const CALIDAD_INICIAL = 0.8
const CALIDAD_PISO = 0.4

async function decodificar(file) {
  // createImageBitmap respeta la orientación EXIF; el fallback <img> cubre
  // navegadores viejos (y también falla limpio con HEIC).
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fallback */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

const aBlob = (canvas, calidad) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir'))), 'image/jpeg', calidad))

const aBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(blob)
  })

/** → { base64, bytes, nombre, previewUrl } · lanza si la imagen no se decodifica. */
export async function comprimirImagen(file) {
  const img = await decodificar(file)
  const w = img.width ?? img.naturalWidth
  const h = img.height ?? img.naturalHeight
  const factor = Math.min(1, MAX_LADO / Math.max(w, h))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * factor)
  canvas.height = Math.round(h * factor)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  if (img.close) img.close()

  let blob = await aBlob(canvas, CALIDAD_INICIAL)
  for (let q = CALIDAD_INICIAL - 0.1; blob.size > OBJETIVO_BYTES && q >= CALIDAD_PISO; q -= 0.1) {
    blob = await aBlob(canvas, q)
  }

  const base = (file.name || 'foto').replace(/\.[^.]+$/, '')
  return {
    base64: await aBase64(blob),
    bytes: blob.size,
    nombre: `${base}.jpg`,
    previewUrl: URL.createObjectURL(blob),
  }
}

import { useEffect, useState } from 'react'
import { apiFetch } from '../config/api'
import { construirPdfCfdi } from '../lib/cfdiPdf'

// Visor de CFDI: el comprobante como PDF, en una ventana sobre la pantalla.
//
// El SAT sólo distribuye el XML —el PDF lo genera quien emite y no viaja en la
// descarga masiva— así que aquí se arma uno con lo que el XML sí trae, y se
// enseña tal cual va a quedar. El mismo archivo que se ve es el que se baja;
// junto a él baja el XML, que es el comprobante de verdad.
//
// Se abre a petición y no incrustado en la tabla: un PDF de página completa
// dentro de un renglón ensucia la lectura de todo lo demás.
export default function CfdiVista({ invoiceId, uuid, onCerrar }) {
  const [rep, setRep] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [error, setError] = useState(null)

  // Escape cierra: es una ventana modal y se comporta como tal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCerrar?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  useEffect(() => {
    let vivo = true
    setRep(null); setPdfUrl(null); setError(null)
    apiFetch(`/api/facturas/${invoiceId}/representacion`)
      .then((r) => { if (vivo) setRep(r) })
      .catch((err) => { if (vivo) setError(err.message) })
    return () => { vivo = false }
  }, [invoiceId])

  useEffect(() => {
    let vivo = true
    let creada = null
    if (rep?.representacion) {
      construirPdfCfdi(rep, { uuid })
        .then((blob) => {
          if (!vivo) return
          creada = URL.createObjectURL(blob)
          setPdfUrl(creada)
        })
        .catch((err) => { if (vivo) setError(err.message) })
    }
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [rep, uuid])

  const base = uuid ?? rep?.representacion?.tfd?.uuid ?? invoiceId

  const bajar = (url, nombre) => {
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const bajarXml = async () => {
    try {
      const xml = await apiFetch(`/api/facturas/${invoiceId}/download?format=xml`)
      const url = URL.createObjectURL(new Blob([String(xml)], { type: 'application/xml' }))
      bajar(url, `${base}.xml`)
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.message) }
  }

  const c = rep?.representacion
  const folio = c ? [c.serie, c.folio].filter(Boolean).join('-') : ''

  return (
    <div className="cfdi-overlay" onClick={onCerrar}>
      <div className="cfdi-modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="cfdi-acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <strong>{folio || 'Comprobante'}</strong>
            {rep?.cancelada && <span className="muted">cancelado</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ghost" disabled={!pdfUrl} onClick={() => bajar(pdfUrl, `${base}.pdf`)}>
              Descargar PDF
            </button>
            <button type="button" className="ghost" onClick={bajarXml}>Descargar XML</button>
            <button type="button" onClick={onCerrar}>Cerrar</button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {!error && !pdfUrl && <p className="muted">Armando el comprobante…</p>}
        {pdfUrl && (
          <iframe
            title={`Comprobante ${base}`}
            src={pdfUrl}
            style={{ width: '100%', height: '72vh', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#FFFFFF' }}
          />
        )}
      </div>
    </div>
  )
}

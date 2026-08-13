import { apiDownload } from '../config/api'

// Acciones sobre un CFDI en cualquier tabla: ver la representación impresa,
// bajar el XML (el timbrado, lo que vale ante el SAT) y el PDF cuando el CFDI
// lo emitió el PAC desde aquí. Los importados por descarga masiva NO tienen PDF
// del PAC — para esos, «Ver» imprime la representación generada del XML.
export default function CfdiAcciones({ invoice, onVer }) {
  if (!invoice?.id) return <span className="muted">—</span>

  const nombre = (formato) =>
    `${[invoice.serie, invoice.folio].filter(Boolean).join('-') || invoice.uuid?.slice(0, 8) || 'cfdi'}.${formato}`

  const bajar = async (formato) => {
    try {
      await apiDownload(`/api/facturas/${invoice.id}/download?format=${formato}`, nombre(formato))
    } catch (err) {
      window.alert(err.message)
    }
  }

  // Acciones de celda como texto («Ver · XML · PDF» del mockup), no como
  // botones sólidos: en una tabla densa el borde pelea con la fila.
  const btn = {
    background: 'none', border: 0, padding: 0, cursor: 'pointer',
    color: 'var(--ink)', fontSize: 12, fontWeight: 400, fontFamily: 'var(--font-ui)',
  }
  const sep = <span style={{ color: 'var(--faint-2)' }}>·</span>
  const acciones = [
    onVer && <button key="ver" type="button" style={btn} onClick={() => onVer(invoice.id)}>Ver</button>,
    <button key="xml" type="button" style={btn} onClick={() => bajar('xml')}>XML</button>,
    invoice.facturapiId && <button key="pdf" type="button" style={btn} onClick={() => bajar('pdf')}>PDF</button>,
  ].filter(Boolean)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {acciones.map((a, i) => (
        <span key={a.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && sep}{a}
        </span>
      ))}
    </span>
  )
}

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

  const btn = { padding: '2px 8px', fontSize: 11 }
  return (
    <span className="head-actions" style={{ gap: 4, display: 'inline-flex' }}>
      {onVer && <button className="ghost" style={btn} onClick={() => onVer(invoice.id)}>Ver</button>}
      <button className="ghost" style={btn} onClick={() => bajar('xml')}>XML</button>
      {invoice.facturapiId && <button className="ghost" style={btn} onClick={() => bajar('pdf')}>PDF</button>}
    </span>
  )
}

import { useEffect, useState } from 'react'
import { api, tokenStorage } from '../config/api'

const mxn = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))

// Visor de CFDI (representación impresa): el SAT sólo distribuye el XML — el
// PDF lo genera el sistema emisor y no viaja en la descarga masiva. Este visor
// parsea el XML auténtico en el navegador y lo muestra como factura, con
// impresión/guardar-como-PDF vía window.print().
export default function CfdiVista({ invoiceId, onCerrar }) {
  const [cfdi, setCfdi] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(api(`/api/facturas/${invoiceId}/download?format=xml`), {
          headers: { Authorization: `Bearer ${tokenStorage.get()}` },
        })
        if (!res.ok) throw new Error(`No se pudo leer el XML (${res.status})`)
        const xml = await res.text()
        const doc = new DOMParser().parseFromString(xml, 'application/xml')
        const q = (sel) => doc.getElementsByTagName(sel)[0]
        const attr = (el, name) => el?.getAttribute(name) ?? null

        const comprobante = q('cfdi:Comprobante') ?? doc.documentElement
        const emisor = q('cfdi:Emisor')
        const receptor = q('cfdi:Receptor')
        const timbre = q('tfd:TimbreFiscalDigital')
        const conceptos = [...doc.getElementsByTagName('cfdi:Concepto')].map((c) => ({
          cantidad: attr(c, 'Cantidad'),
          clave: attr(c, 'ClaveProdServ'),
          descripcion: attr(c, 'Descripcion'),
          valorUnitario: attr(c, 'ValorUnitario'),
          importe: attr(c, 'Importe'),
        }))
        if (!vivo) return
        setCfdi({
          serie: attr(comprobante, 'Serie'),
          folio: attr(comprobante, 'Folio'),
          fecha: attr(comprobante, 'Fecha'),
          tipo: attr(comprobante, 'TipoDeComprobante'),
          metodoPago: attr(comprobante, 'MetodoPago'),
          formaPago: attr(comprobante, 'FormaPago'),
          condiciones: attr(comprobante, 'CondicionesDePago'),
          subtotal: attr(comprobante, 'SubTotal'),
          total: attr(comprobante, 'Total'),
          moneda: attr(comprobante, 'Moneda'),
          emisor: { rfc: attr(emisor, 'Rfc'), nombre: attr(emisor, 'Nombre'), regimen: attr(emisor, 'RegimenFiscal') },
          receptor: { rfc: attr(receptor, 'Rfc'), nombre: attr(receptor, 'Nombre'), uso: attr(receptor, 'UsoCFDI') },
          uuid: attr(timbre, 'UUID'),
          fechaTimbrado: attr(timbre, 'FechaTimbrado'),
          conceptos,
        })
      } catch (err) { if (vivo) setError(err.message) }
    })()
    return () => { vivo = false }
  }, [invoiceId])

  return (
    <div className="cfdi-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="cfdi-modal">
        <div className="cfdi-acciones no-print">
          <button className="ghost" onClick={onCerrar}>Cerrar</button>
          <button onClick={() => window.print()} disabled={!cfdi}>Imprimir / Guardar PDF</button>
        </div>
        {error && <div className="error">{error}</div>}
        {!cfdi && !error && <p className="muted">Leyendo el CFDI…</p>}
        {cfdi && (
          <div className="cfdi-doc">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <h2 style={{ margin: 0 }}>{cfdi.emisor.nombre}</h2>
                <p className="muted" style={{ margin: '2px 0' }}>RFC {cfdi.emisor.rfc} · Régimen {cfdi.emisor.regimen}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                  {cfdi.tipo === 'E' ? 'NOTA DE CRÉDITO' : 'FACTURA'} {[cfdi.serie, cfdi.folio].filter(Boolean).join('-')}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{cfdi.fecha?.replace('T', ' ')}</div>
              </div>
            </header>

            <div style={{ margin: '14px 0' }}>
              <strong>Receptor:</strong> {cfdi.receptor.nombre} · RFC {cfdi.receptor.rfc} · Uso {cfdi.receptor.uso}
              <div className="muted" style={{ fontSize: 12 }}>
                {cfdi.metodoPago} · Forma {cfdi.formaPago}{cfdi.condiciones ? ` · ${cfdi.condiciones}` : ''} · {cfdi.moneda}
              </div>
            </div>

            <table>
              <thead><tr><th>Cant.</th><th>Clave</th><th>Descripción</th><th className="num">P. unitario</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {cfdi.conceptos.map((c, i) => (
                  <tr key={i}>
                    <td>{c.cantidad}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{c.clave}</td>
                    <td>{c.descripcion}</td>
                    <td className="num">{mxn(c.valorUnitario)}</td>
                    <td className="num">{mxn(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <div>Subtotal: <strong>{mxn(cfdi.subtotal)}</strong></div>
              <div style={{ fontSize: 18 }}>Total: <strong>{mxn(cfdi.total)}</strong></div>
            </div>

            <footer style={{ marginTop: 16, borderTop: '1px solid var(--border, #ddd)', paddingTop: 8 }}>
              <div className="mono" style={{ fontSize: 10 }}>Folio fiscal (UUID): {cfdi.uuid}</div>
              <div className="muted" style={{ fontSize: 10 }}>Timbrado: {cfdi.fechaTimbrado?.replace('T', ' ')} · Representación impresa generada por AutomotrizPRO a partir del XML auténtico del SAT.</div>
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}

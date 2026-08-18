import { useEffect, useState } from 'react'
import { api, tokenVigente } from '../config/api'

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
          headers: { Authorization: `Bearer ${await tokenVigente()}` },
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
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15 }}>{cfdi.emisor.nombre}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  RFC <span className="mono">{cfdi.emisor.rfc}</span> · Régimen <span className="mono">{cfdi.emisor.regimen}</span>
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {cfdi.tipo === 'E' ? 'Nota de crédito' : 'Factura'}{' '}
                  <span className="mono">{[cfdi.serie, cfdi.folio].filter(Boolean).join('-')}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{cfdi.fecha?.replace('T', ' ')}</div>
              </div>
            </header>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px 28px', margin: '18px 0',
            }}>
              <Dato k="Receptor" v={cfdi.receptor.nombre} />
              <Dato k="RFC" v={cfdi.receptor.rfc} mono />
              <Dato k="Uso del CFDI" v={cfdi.receptor.uso} mono />
              <Dato k="Método de pago" v={cfdi.metodoPago} mono />
              <Dato k="Forma de pago" v={cfdi.formaPago} mono />
              <Dato k="Moneda" v={[cfdi.moneda, cfdi.condiciones].filter(Boolean).join(' · ')} />
            </div>

            <table>
              <thead><tr><th className="num">Cant.</th><th>Clave</th><th>Descripción</th><th className="num">P. unitario</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {cfdi.conceptos.map((c, i) => (
                  <tr key={i}>
                    <td className="num">{c.cantidad}</td>
                    <td className="mono">{c.clave}</td>
                    <td style={{ fontSize: 13 }}>{c.descripcion}</td>
                    <td className="num">{mxn(c.valorUnitario)}</td>
                    <td className="num">{mxn(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, marginTop: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Subtotal {mxn(cfdi.subtotal)}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total</span>
              <span className="kpi" style={{ margin: 0 }}>{mxn(cfdi.total)}</span>
            </div>

            <footer style={{ marginTop: 16, borderTop: '1px solid var(--border-inner)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Folio fiscal (UUID)</div>
              <div className="mono" style={{ marginTop: 2 }}>{cfdi.uuid}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginTop: 6, lineHeight: 1.5 }}>
                Timbrado: {cfdi.fechaTimbrado?.replace('T', ' ')} · Representación impresa generada por
                Automotriz PRO a partir del XML auténtico del SAT.
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}

// Par etiqueta/valor de la carátula del CFDI: 12px `--muted` sobre el dato en
// 13px (mono cuando es clave del SAT). Tinta sobre blanco — es un documento
// fiscal, no lleva acentos de color.
function Dato({ k, v, mono = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-hairline)', paddingTop: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{k}</span>
      {mono
        ? <span className="mono">{v || '—'}</span>
        : <span style={{ fontSize: 13 }}>{v || '—'}</span>}
    </div>
  )
}

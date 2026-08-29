// Representación impresa del CFDI, armada en el navegador.
//
// Por qué aquí y no en el hub: los CFDIs de descarga masiva nunca pasaron por
// el PAC, así que no existe un PDF que pedir — el único PDF del hub sale de
// Facturapi y sólo para lo que se timbró desde la app. Lo que sí tenemos es el
// XML, y de ahí sale todo: emisor, receptor, conceptos, impuestos, timbre y el
// QR de verificación que el propio endpoint ya calcula.
//
// jsPDF se carga bajo demanda (import dinámico) para no cobrarle 150 KB de
// arranque a quien nunca abre un comprobante.
import { cargarModulos } from './cargarModulos'

const mxn = (n) =>
  n == null ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const TIPO = { I: 'Ingreso', E: 'Egreso', T: 'Traslado', N: 'Nómina', P: 'Pago' }

export async function construirPdfCfdi({ representacion: c, qrDataUrl, cancelada }, invoice) {
  const [{ jsPDF }, autoTableMod] = await cargarModulos(
    () => import('jspdf'),
    () => import('jspdf-autotable'),
  )
  const autoTable = autoTableMod.default ?? autoTableMod.autoTable
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 40                       // margen
  const ancho = doc.internal.pageSize.getWidth()
  let y = M

  const linea = (txt, { size = 9, bold = false, gris = false, dx = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(gris ? 110 : 20)
    doc.text(String(txt ?? ''), M + dx, y)
    y += size + 4
  }

  // ── Encabezado: quién emite y qué comprobante es ──────────────────────────
  linea(c.emisor?.nombre ?? '', { size: 13, bold: true })
  linea(`RFC ${c.emisor?.rfc ?? '—'}${c.emisor?.regimenFiscal ? ` · Régimen ${c.emisor.regimenFiscal}` : ''}`, { gris: true })
  if (c.lugarExpedicion) linea(`Lugar de expedición ${c.lugarExpedicion}`, { gris: true })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20)
  const titulo = `CFDI de ${TIPO[c.tipoComprobante] ?? c.tipoComprobante ?? ''}`
  doc.text(titulo, ancho - M, M, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  const folio = [c.serie, c.folio].filter(Boolean).join('-')
  if (folio) doc.text(`Folio ${folio}`, ancho - M, M + 14, { align: 'right' })
  if (c.fecha) doc.text(String(c.fecha).replace('T', ' '), ancho - M, M + 26, { align: 'right' })
  if (cancelada) {
    doc.setTextColor(150, 40, 40)
    doc.setFont('helvetica', 'bold')
    doc.text('CANCELADO', ancho - M, M + 40, { align: 'right' })
  }

  y = Math.max(y, M + 54)
  doc.setDrawColor(220)
  doc.line(M, y, ancho - M, y)
  y += 16

  // ── Receptor ──────────────────────────────────────────────────────────────
  linea('RECEPTOR', { size: 8, bold: true, gris: true })
  linea(c.receptor?.nombre ?? '—', { size: 10, bold: true })
  const datosReceptor = [
    c.receptor?.rfc && `RFC ${c.receptor.rfc}`,
    c.receptor?.domicilioFiscal && `CP ${c.receptor.domicilioFiscal}`,
    c.receptor?.regimenFiscal && `Régimen ${c.receptor.regimenFiscal}`,
    c.receptor?.usoCfdi && `Uso ${c.receptor.usoCfdi}`,
  ].filter(Boolean).join(' · ')
  if (datosReceptor) linea(datosReceptor, { gris: true })
  const pago = [
    c.formaPago && `Forma de pago ${c.formaPago}`,
    c.metodoPago && `Método ${c.metodoPago}`,
    c.moneda && `Moneda ${c.moneda}`,
  ].filter(Boolean).join(' · ')
  if (pago) linea(pago, { gris: true })
  y += 8

  // ── Conceptos ─────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Clave', 'Descripción', 'Cant.', 'Unitario', 'Importe']],
    body: (c.conceptos ?? []).map((x) => [
      x.claveProdServ ?? '',
      x.descripcion ?? '',
      x.cantidad ?? '',
      mxn(x.valorUnitario),
      mxn(x.importe),
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: 30 },
    headStyles: { fillColor: [245, 245, 245], textColor: 90, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 58 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'right', cellWidth: 70 },
      4: { halign: 'right', cellWidth: 78 },
    },
  })
  y = (doc.lastAutoTable?.finalY ?? y) + 16

  // ── Totales ───────────────────────────────────────────────────────────────
  const totales = [
    ['Subtotal', mxn(c.subtotal)],
    c.descuento ? ['Descuento', mxn(c.descuento)] : null,
    c.totalImpuestosTrasladados ? ['Impuestos trasladados', mxn(c.totalImpuestosTrasladados)] : null,
    c.totalImpuestosRetenidos ? ['Impuestos retenidos', mxn(c.totalImpuestosRetenidos)] : null,
    ['Total', mxn(c.total)],
  ].filter(Boolean)
  doc.setFontSize(9)
  for (const [etq, val] of totales) {
    const ultimo = etq === 'Total'
    doc.setFont('helvetica', ultimo ? 'bold' : 'normal')
    doc.setTextColor(ultimo ? 20 : 110)
    doc.text(etq, ancho - M - 140, y, { align: 'right' })
    doc.setTextColor(20)
    doc.text(val, ancho - M, y, { align: 'right' })
    y += ultimo ? 18 : 14
  }

  // ── Timbre: el folio fiscal y el QR son lo que hace verificable al papel ──
  y += 6
  doc.setDrawColor(220)
  doc.line(M, y, ancho - M, y)
  y += 16
  const yTimbre = y
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', M, y - 10, 86, 86) } catch { /* QR opcional */ }
  }
  const dx = qrDataUrl ? 100 : 0
  linea('Folio fiscal (UUID)', { size: 7, bold: true, gris: true, dx })
  linea(invoice?.uuid ?? c.tfd?.uuid ?? '—', { size: 8, dx })
  if (c.tfd?.fechaTimbrado) {
    linea('Fecha de timbrado', { size: 7, bold: true, gris: true, dx })
    linea(String(c.tfd.fechaTimbrado).replace('T', ' '), { size: 8, dx })
  }
  if (c.tfd?.rfcProvCertif) {
    linea('RFC del proveedor de certificación', { size: 7, bold: true, gris: true, dx })
    linea(c.tfd.rfcProvCertif, { size: 8, dx })
  }
  y = Math.max(y, yTimbre + 86)

  if (c.cadenaOriginalTFD) {
    y += 10
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(110)
    doc.text('Cadena original del complemento de certificación digital del SAT', M, y)
    y += 10
    doc.setFont('courier', 'normal'); doc.setFontSize(6); doc.setTextColor(90)
    for (const l of doc.splitTextToSize(c.cadenaOriginalTFD, ancho - M * 2).slice(0, 6)) {
      doc.text(l, M, y); y += 7
    }
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140)
  doc.text(
    'Representación impresa de un CFDI. El comprobante fiscal es el archivo XML.',
    M, doc.internal.pageSize.getHeight() - 24,
  )

  return doc.output('blob')
}

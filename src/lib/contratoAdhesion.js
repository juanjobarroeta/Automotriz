// Contrato de adhesión de servicios de reparación/mantenimiento — el papel que
// el cliente firma al dejar la unidad. Se arma en el navegador (mismo patrón
// que cfdiPdf.js: jsPDF bajo demanda) con la firma del canvas ESTAMPADA — el
// PDF resultante se sube al expediente de la orden como CONTRATO_FIRMADO y el
// hub lo vuelve inmutable.
//
// ⚠️ PLANTILLA: cada taller REGISTRA su contrato de adhesión ante PROFECO.
// MARGOM sustituirá REGISTRO_PROFECO y CONTRATO_CLAUSULAS con su texto
// registrado — cambiar SOLO estas constantes, no la estructura.

export const REGISTRO_PROFECO = '{{PENDIENTE — NÚMERO DE REGISTRO PROFECO}}'

// Elementos que la NOM de talleres exige en el contrato; redacción plantilla.
export const CONTRATO_CLAUSULAS = [
  'PRIMERA — PRESUPUESTO. El prestador entregará al consumidor un presupuesto previo por escrito de las reparaciones o mantenimiento a efectuar. Ningún trabajo se ejecutará sin la autorización previa y expresa del consumidor; los trabajos adicionales detectados durante el servicio se cotizarán y autorizarán por separado antes de realizarse.',
  'SEGUNDA — REFACCIONES. Las refacciones empleadas serán nuevas y apropiadas para la unidad, salvo acuerdo distinto por escrito. Las piezas y refacciones sustituidas serán entregadas al consumidor al recoger la unidad, salvo renuncia expresa o que deban retenerse por disposición legal o de garantía del fabricante.',
  'TERCERA — GARANTÍA. El prestador garantiza los trabajos realizados por el plazo indicado en la carátula de este contrato, contado a partir de la entrega de la unidad, sobre mano de obra y refacciones instaladas, en condiciones normales de uso. La garantía se hará efectiva en las instalaciones del prestador sin cargo adicional.',
  'CUARTA — ENTREGA. La fecha estimada de entrega es la indicada en la carátula. Si el prestador previera no cumplirla, lo comunicará al consumidor indicando la nueva fecha y la causa. La unidad permanecerá bajo resguardo y responsabilidad del prestador desde su recepción y hasta su entrega.',
  'QUINTA — PRECIOS. Los precios de mano de obra y refacciones estarán a la vista del consumidor o le serán informados antes de la autorización. El pago se realizará contra la entrega de la unidad, salvo pacto distinto.',
  'SEXTA — QUEJAS. Para cualquier aclaración o queja, el consumidor puede acudir a la Procuraduría Federal del Consumidor (PROFECO). Este contrato fue registrado ante PROFECO con el número indicado en la carátula.',
]

const mxn = (n) =>
  n == null ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fh = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * construirContratoAdhesion({ empresa, orden, checklist, firmaDataUrl, qrDataUrl })
 * → Blob (PDF carta). `orden` es la respuesta del hub (folio, cliente, vin…).
 */
export async function construirContratoAdhesion({ empresa, orden, checklist, firmaDataUrl, qrDataUrl }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableMod.default ?? autoTableMod.autoTable
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 40
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  let y = M

  const salto = (necesita = 60) => { if (y > alto - necesita) { doc.addPage(); y = M } }
  const linea = (txt, { size = 9, bold = false, gris = false, dx = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(gris ? 110 : 20)
    doc.text(String(txt ?? ''), M + dx, y)
    y += size + 4
  }
  const parrafo = (txt, { size = 8 } = {}) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(40)
    for (const l of doc.splitTextToSize(txt, ancho - M * 2)) { salto(40); doc.text(l, M, y); y += size + 3 }
    y += 4
  }
  const seccion = (titulo) => { salto(); y += 6; linea(titulo, { size: 9.5, bold: true }); doc.setDrawColor(220); doc.line(M, y - 8, ancho - M, y - 8); y += 2 }

  // ── Carátula: prestador / título / registro / folio / QR ──────────────────
  linea(empresa?.razonSocial ?? '', { size: 13, bold: true })
  linea(`RFC ${empresa?.rfc ?? '—'}${empresa?.telefono ? ` · Tel ${empresa.telefono}` : ''}`, { gris: true })
  if (empresa?.domicilioFiscal) linea(`${empresa.domicilioFiscal}${empresa?.codigoPostal ? ` CP ${empresa.codigoPostal}` : ''}`, { gris: true })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20)
  const tituloLineas = doc.splitTextToSize('CONTRATO DE ADHESIÓN DE PRESTACIÓN DE SERVICIOS DE REPARACIÓN Y/O MANTENIMIENTO DE VEHÍCULOS', 230)
  tituloLineas.forEach((l, i) => doc.text(l, ancho - M, M + i * 12, { align: 'right' }))
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
  doc.text(`Registro PROFECO: ${REGISTRO_PROFECO}`, ancho - M, M + tituloLineas.length * 12 + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20)
  doc.text(`Orden OS-${orden.folio}`, ancho - M, M + tituloLineas.length * 12 + 22, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
  doc.text(fh(orden.recibidaAt ?? Date.now()), ancho - M, M + tituloLineas.length * 12 + 34, { align: 'right' })
  if (qrDataUrl) { try { doc.addImage(qrDataUrl, 'PNG', ancho - M - 54, M + tituloLineas.length * 12 + 42, 54, 54) } catch { /* sin QR */ } }

  y = Math.max(y, M + 66)
  doc.setDrawColor(200); doc.line(M, y, ancho - M, y); y += 14

  // ── Consumidor / Unidad (dos columnas) ────────────────────────────────────
  const col2 = ancho / 2 + 10
  const yCols = y
  linea('CONSUMIDOR', { size: 8.5, bold: true })
  linea(orden.cliente?.razonSocial ?? 'Mostrador', { size: 9.5 })
  if (orden.cliente?.rfc) linea(`RFC ${orden.cliente.rfc}`, { gris: true })
  if (orden.cliente?.phone) linea(`Tel ${orden.cliente.phone}`, { gris: true })
  const yFinCol1 = y
  y = yCols
  const lineaDx = (txt, opts = {}) => linea(txt, { ...opts, dx: col2 - M })
  lineaDx('UNIDAD', { size: 8.5, bold: true })
  lineaDx(orden.descripcionUnidad || [orden.vehiculo?.marca, orden.vehiculo?.modelo, orden.vehiculo?.anio].filter(Boolean).join(' ') || '—', { size: 9.5 })
  if (orden.vin) lineaDx(`NIV ${orden.vin}`, { gris: true })
  lineaDx([orden.placas ? `Placas ${orden.placas}` : null, orden.kilometraje != null ? `${orden.kilometraje.toLocaleString('es-MX')} km` : null].filter(Boolean).join(' · ') || ' ', { gris: true })
  lineaDx([orden.torre ? `Torre ${orden.torre}` : null, orden.gasolinaOctavos != null ? `Gasolina ${orden.gasolinaOctavos}/8` : null].filter(Boolean).join(' · ') || ' ', { gris: true })
  y = Math.max(y, yFinCol1) + 4

  seccion('FALLA REPORTADA / SERVICIO SOLICITADO')
  parrafo(orden.fallaReportada ?? '', { size: 9 })

  // ── Presupuesto ───────────────────────────────────────────────────────────
  seccion('PRESUPUESTO')
  const lineas = orden.lineas ?? []
  if (lineas.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 40] },
      head: [['Tipo', 'Descripción', 'Cant.', 'P. unitario', 'Importe']],
      body: lineas.map((l) => [
        l.tipo === 'MANO_OBRA' ? 'Mano de obra' : 'Refacción',
        l.descripcion,
        String(l.cantidad),
        mxn(l.precioUnitario),
        mxn(l.cantidad * l.precioUnitario),
      ]),
    })
    y = doc.lastAutoTable.finalY + 10
    const total = lineas.reduce((a, l) => a + l.cantidad * l.precioUnitario, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20)
    doc.text(`Total estimado (sin IVA): ${mxn(total)}`, ancho - M, y, { align: 'right' })
    y += 16
  } else {
    parrafo('El presupuesto se comunicará al consumidor para su autorización una vez realizado el diagnóstico; ningún trabajo se ejecuta sin autorización previa.', { size: 9 })
  }

  // ── Inventario de recepción ───────────────────────────────────────────────
  if (checklist?.items?.length) {
    seccion('INVENTARIO DE RECEPCIÓN')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40)
    const mitad = Math.ceil(checklist.items.length / 2)
    for (let i = 0; i < mitad; i++) {
      salto(40)
      const izq = checklist.items[i]
      const der = checklist.items[i + mitad]
      doc.text(`${izq.ok ? '✓' : '✗'} ${izq.etiqueta}`, M, y)
      if (der) doc.text(`${der.ok ? '✓' : '✗'} ${der.etiqueta}`, col2, y)
      y += 11
    }
    y += 4
    if (checklist.pertenencias) parrafo(`Pertenencias: ${checklist.pertenencias}`)
    if (checklist.comentarios) parrafo(`Observaciones: ${checklist.comentarios}`)
  }

  // ── Cláusulas ─────────────────────────────────────────────────────────────
  seccion('CLÁUSULAS')
  const clausulas = CONTRATO_CLAUSULAS.map((c) =>
    c.replace('el plazo indicado en la carátula', `${orden.garantiaDias ?? 30} días naturales`))
  for (const c of clausulas) parrafo(c)

  salto(80)
  linea(
    `Fecha estimada de entrega: ${orden.prometidaAt ? fh(orden.prometidaAt) : 'por confirmar tras diagnóstico'} · Garantía del servicio: ${orden.garantiaDias ?? 30} días`,
    { size: 9, bold: true }
  )

  // ── Firmas ────────────────────────────────────────────────────────────────
  salto(130)
  y += 10
  const firmaY = y
  if (firmaDataUrl) { try { doc.addImage(firmaDataUrl, 'PNG', M, firmaY, 180, 60) } catch { /* sin firma */ } }
  doc.setDrawColor(120)
  doc.line(M, firmaY + 66, M + 200, firmaY + 66)
  doc.line(col2, firmaY + 66, col2 + 200, firmaY + 66)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60)
  doc.text(`Firma del consumidor — ${orden.cliente?.razonSocial ?? 'Mostrador'}`, M, firmaY + 78)
  doc.text(`Firmado el ${fh(Date.now())} en las instalaciones del prestador`, M, firmaY + 89)
  const asesor = orden.asesor ? `${orden.asesor.nombre} ${orden.asesor.apellidoPaterno ?? ''}`.trim() : ''
  doc.text('Recibe por la agencia', col2, firmaY + 78)
  if (asesor) doc.text(asesor, col2, firmaY + 89)

  return doc.output('blob')
}

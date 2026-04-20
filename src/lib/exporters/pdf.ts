/**
 * RT-SC · PDF exporter (tabular).
 *
 * jsPDF + jspdf-autotable, both lazy-loaded.
 * Designed for list / table exports (élèves, paiements, présences…).
 *
 * For richer documents like full bulletins or certificates, write a
 * dedicated builder per document type — this exporter is for the
 * generic "print this list" case.
 */

import type { ExportColumn, PdfMetadata } from './types'

interface PdfOptions<T> {
  filename: string
  columns: ExportColumn<T>[]
  rows: T[]
  meta?: PdfMetadata
  /** "portrait" | "landscape" — default portrait */
  orientation?: 'portrait' | 'landscape'
}

const NAVY: [number, number, number] = [11, 37, 69]
const GOLD: [number, number, number] = [201, 168, 76]

export async function exportToPdf<T>({
  filename,
  columns,
  rows,
  meta,
  orientation = 'portrait',
}: PdfOptions<T>) {
  // Lazy imports
  const { jsPDF } = await import('jspdf')
  // Side-effect import that augments jsPDF prototype with `.autoTable`
  await import('jspdf-autotable')

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header band
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageWidth, 60, 'F')

  if (meta?.schoolName) {
    doc.setTextColor(...GOLD)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(meta.schoolName.toUpperCase(), 40, 24)
  }

  if (meta?.title) {
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(meta.title, 40, 44)
  }

  if (meta?.subtitle) {
    doc.setTextColor(220, 220, 220)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(meta.subtitle, pageWidth - 40, 44, { align: 'right' })
  }

  // Body table
  const head = [columns.map((c) => c.header)]
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = c.accessor(r)
      return v === null || v === undefined ? '' : String(v)
    })
  )

  // @ts-expect-error - autoTable is added by side-effect import
  doc.autoTable({
    head,
    body,
    startY: 80,
    margin: { left: 40, right: 40 },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6, font: 'helvetica' },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [247, 248, 250] },
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  const generatedAt = (meta?.generatedAt ?? new Date()).toLocaleString('fr-FR')
  const footerText =
    meta?.footer ?? `SchoolConnect · Généré le ${generatedAt}`
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(footerText, 40, doc.internal.pageSize.getHeight() - 20)
    doc.text(
      `Page ${i} / ${pageCount}`,
      pageWidth - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' }
    )
  }

  const cleanName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  doc.save(cleanName)
}

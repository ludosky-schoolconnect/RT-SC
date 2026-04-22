/**
 * RT-SC · Palmarès PDF.
 *
 * Generates a printable A4 PDF of the full palmarès with all blocks:
 *   - Header (school + period + generation date)
 *   - Top 10 général
 *   - Top 5 premier cycle
 *   - Top 5 second cycle
 *   - Top 3 par série (grid)
 *   - Top classes block (NEW in v2)
 *
 * Pure jsPDF + jspdf-autotable — no html2canvas. Renders fast and
 * looks crisp on print.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PalmaresResult } from '@/hooks/usePalmares'
import { rankClasses } from '@/hooks/usePalmares'

const NAVY: [number, number, number] = [11, 37, 69]
const GOLD: [number, number, number] = [201, 168, 76]
const INK_700: [number, number, number] = [60, 70, 90]
const INK_400: [number, number, number] = [140, 150, 165]
const SUCCESS: [number, number, number] = [21, 128, 61]
const WARNING: [number, number, number] = [180, 110, 20]
const DANGER: [number, number, number] = [185, 28, 28]

const PAGE_W = 210
const MARGIN_X = 14

export interface PalmaresPdfInput {
  result: PalmaresResult
  periode: string
  schoolName?: string
  anneeScolaire?: string
}

export function downloadPalmaresPdf(input: PalmaresPdfInput): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  draw(doc, input)
  const safePeriode = input.periode.replace(/\s+/g, '_')
  doc.save(`Palmares_${safePeriode}.pdf`)
}

export function generatePalmaresPdf(input: PalmaresPdfInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  draw(doc, input)
  return doc.output('blob')
}

// ─── Drawing ────────────────────────────────────────────────

function draw(doc: jsPDF, input: PalmaresPdfInput): void {
  const { result, periode, schoolName, anneeScolaire } = input

  drawHeader(doc, periode, schoolName, anneeScolaire)
  let y = 42

  // General Top 10
  y = drawRankingTable(doc, y, 'Classement général', 'Top 10 — toutes classes', result.all.slice(0, 10))

  // Premier cycle
  if (result.premierCycle.length > 0) {
    y = drawRankingTable(
      doc,
      y + 4,
      'Premier cycle',
      'Top 5 — 6ème, 5ème, 4ème, 3ème',
      result.premierCycle.slice(0, 5)
    )
  }

  // Second cycle
  if (result.secondCycle.length > 0) {
    y = drawRankingTable(
      doc,
      y + 4,
      'Second cycle',
      'Top 5 — 2nde, 1ère, Terminale',
      result.secondCycle.slice(0, 5)
    )
  }

  // Per-série mini-tables
  const series = Object.keys(result.parSerie)
  if (series.length > 0) {
    y = drawSeriesGrid(doc, y + 4, result.parSerie)
  }

  // Top classes block
  const classRanking = rankClasses(result.all)
  if (classRanking.length > 0) {
    y = drawClassesTable(doc, y + 4, classRanking.slice(0, 5))
  }

  // Footer on every page
  drawFooterAllPages(doc)
}

function drawHeader(
  doc: jsPDF,
  periode: string,
  schoolName?: string,
  anneeScolaire?: string
): void {
  // Gold band
  doc.setFillColor(...GOLD)
  doc.rect(0, 0, PAGE_W, 4, 'F')

  // School name
  if (schoolName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK_400)
    doc.text(schoolName.toUpperCase(), MARGIN_X, 12)
  }

  // Title
  doc.setFont('times', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...NAVY)
  doc.text('PALMARÈS GÉNÉRAL', MARGIN_X, 22)

  // Period subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK_700)
  doc.text(periode, MARGIN_X, 29)

  // Year + generation date — right aligned
  doc.setFontSize(8)
  doc.setTextColor(...INK_400)
  const right: string[] = []
  if (anneeScolaire) right.push(`Année ${anneeScolaire}`)
  right.push(
    `Édité le ${new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`
  )
  doc.text(right.join('  ·  '), PAGE_W - MARGIN_X, 12, { align: 'right' })

  // Thin underline
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_X, 35, PAGE_W - MARGIN_X, 35)
}

function drawRankingTable(
  doc: jsPDF,
  startY: number,
  title: string,
  subtitle: string,
  entries: { nom: string; classeNom: string; moyenneGenerale: number }[]
): number {
  // Section header
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text(title, MARGIN_X, startY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK_400)
  doc.text(subtitle, MARGIN_X, startY + 4)

  const rows = entries.map((e, i) => [
    String(i + 1),
    e.nom,
    e.classeNom,
    e.moyenneGenerale.toFixed(2),
  ])

  autoTable(doc, {
    startY: startY + 7,
    head: [['#', 'Élève', 'Classe', 'Moyenne']],
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: INK_700,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 50 },
      3: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: MARGIN_X, right: MARGIN_X },
    didParseCell: (hook) => {
      // Color top 3 rank cells
      if (hook.column.index === 0 && hook.section === 'body') {
        const rank = hook.row.index + 1
        if (rank === 1) hook.cell.styles.fillColor = GOLD as unknown as number[]
        else if (rank === 2) hook.cell.styles.fillColor = [200, 200, 200]
        else if (rank === 3)
          hook.cell.styles.fillColor = [217, 152, 86] as unknown as number[]
      }
      // Color the moyenne cell
      if (hook.column.index === 3 && hook.section === 'body') {
        const m = parseFloat(String(hook.cell.raw))
        if (m >= 14) hook.cell.styles.textColor = SUCCESS as unknown as number[]
        else if (m >= 10) hook.cell.styles.textColor = NAVY as unknown as number[]
        else hook.cell.styles.textColor = WARNING as unknown as number[]
      }
    },
  })

  // jspdf-autotable updates this side-channel after drawing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY
}

function drawSeriesGrid(
  doc: jsPDF,
  startY: number,
  parSerie: Record<string, { nom: string; classeNom: string; moyenneGenerale: number }[]>
): number {
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('Par série (Second cycle)', MARGIN_X, startY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK_400)
  doc.text('Top 3 par série', MARGIN_X, startY + 4)

  const order = ['A', 'B', 'C', 'D', 'G1', 'G2', 'G3']
  const knownFirst = order.filter((s) => parSerie[s])
  const others = Object.keys(parSerie).filter((s) => !order.includes(s))
  const series = [...knownFirst, ...others]

  let y = startY + 8
  for (const serie of series) {
    const top = parSerie[serie].slice(0, 3)
    const rows = top.map((e, i) => [
      String(i + 1),
      e.nom,
      e.classeNom,
      e.moyenneGenerale.toFixed(2),
    ])

    // Section sub-title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    doc.text(`Série ${serie === 'Sans série' ? 'non spécifiée' : serie}`, MARGIN_X, y)

    autoTable(doc, {
      startY: y + 2,
      head: [['#', 'Élève', 'Classe', 'Moyenne']],
      body: rows,
      theme: 'plain',
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: INK_700,
        fontSize: 8,
      },
      bodyStyles: { fontSize: 9, textColor: INK_700 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 50 },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: MARGIN_X, right: MARGIN_X },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4
  }

  return y
}

function drawClassesTable(
  doc: jsPDF,
  startY: number,
  classes: { classeNom: string; moyenneClasse: number; nbEleves: number; topMoyenne: number }[]
): number {
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('Top des classes', MARGIN_X, startY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK_400)
  doc.text('Classes les mieux classées par moyenne d\'élèves', MARGIN_X, startY + 4)

  const rows = classes.map((c, i) => [
    String(i + 1),
    c.classeNom,
    String(c.nbEleves),
    c.moyenneClasse.toFixed(2),
    c.topMoyenne.toFixed(2),
  ])

  autoTable(doc, {
    startY: startY + 7,
    head: [['#', 'Classe', 'Élèves', 'Moy. classe', 'Meilleure']],
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: GOLD,
      textColor: NAVY,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: INK_700 },
    alternateRowStyles: { fillColor: [253, 246, 227] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 25, halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
    },
    margin: { left: MARGIN_X, right: MARGIN_X },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY
}

function drawFooterAllPages(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...INK_400)
    doc.text(
      `Page ${i} / ${pageCount}  ·  SchoolConnect`,
      PAGE_W / 2,
      290,
      { align: 'center' }
    )
  }
}

// Re-export for callers that want the danger color
export { DANGER }

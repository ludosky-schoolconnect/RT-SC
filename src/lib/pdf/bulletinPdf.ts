/**
 * RT-SC · Bulletin PDF generator.
 *
 * Produces an A4 PDF from a BulletinPeriodView or BulletinAnnualView.
 * Uses jsPDF + jspdf-autotable for clean tabular layout. Output mirrors
 * the on-screen BulletinView visually (header, identity, matières table,
 * totals, conduite, verdict, signatures).
 *
 * Usage:
 *   import { generateBulletinPdf } from '@/lib/pdf/bulletinPdf'
 *   const blob = generateBulletinPdf(view, 'periode')
 *   // or save directly:
 *   savePdf(view, 'periode')
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  BulletinAnnualView,
  BulletinPeriodView,
} from '@/lib/bulletinView'
import { statutLabel } from '@/lib/statutLabel'

// jspdf-autotable's RowInput type isn't reliably exported across versions,
// so we use a structural alias loose enough to cover all cases we use.
// Each row is an array of cells; each cell is either a string or a config
// object with `content` plus styling.
type Row = (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[]

// ─── Color tokens (match the on-screen palette, but PDF-safe) ───
const COLOR_NAVY: [number, number, number] = [17, 34, 64]      // RT-SC navy
const COLOR_GOLD: [number, number, number] = [201, 168, 76]    // RT-SC gold
const COLOR_INK_700: [number, number, number] = [60, 70, 90]
const COLOR_INK_400: [number, number, number] = [140, 150, 165]
const COLOR_SUCCESS: [number, number, number] = [21, 128, 61]
const COLOR_DANGER: [number, number, number] = [185, 28, 28]
const COLOR_GOLD_BG: [number, number, number] = [253, 245, 220]

// A4 dimensions in mm
const PAGE_WIDTH = 210
const MARGIN_X = 14

// ─── Public API ─────────────────────────────────────────────

/**
 * Generates the PDF and returns it as a Blob (caller decides what to do).
 * Useful for "preview in new tab" or future ZIP batching.
 */
export function generateBulletinPdf(
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  drawBulletinOnDoc(doc, view, mode)
  return doc.output('blob')
}

/**
 * Generates the PDF and triggers a browser download with a sensible
 * filename like "Bulletin-Caled-Semestre1.pdf".
 */
export function savePdf(
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): void {
  const blob = generateBulletinPdf(view, mode)
  const filename = makeFilename(view, mode)
  triggerDownload(blob, filename)
}

/**
 * Generates a SINGLE multi-page PDF containing every view passed in,
 * one bulletin per page (or per-page-group for annual). Used by the PP
 * to print an entire class's bulletins in one operation.
 *
 * Views should be pre-sorted (typically by élève nom alphabetical).
 * Empty input returns a blob with one blank page (caller should guard).
 */
export function generateBulletinsBatchPdf(
  views: (BulletinPeriodView | BulletinAnnualView)[],
  mode: 'periode' | 'annuelle'
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  views.forEach((view, idx) => {
    if (idx > 0) doc.addPage()
    drawBulletinOnDoc(doc, view, mode)
  })
  return doc.output('blob')
}

/**
 * Save a batch PDF with a class+period oriented filename.
 *   "Bulletins-3eme-M1-Semestre1.pdf"
 *   "Bulletins-Tle-D2-Annuel.pdf"
 */
export function saveBatchPdf(
  views: (BulletinPeriodView | BulletinAnnualView)[],
  mode: 'periode' | 'annuelle',
  classeName: string
): void {
  const blob = generateBulletinsBatchPdf(views, mode)
  const filename = makeBatchFilename(classeName, mode, views[0])
  triggerDownload(blob, filename)
}

// ─── Internal: draw a single bulletin onto the current page ─

function drawBulletinOnDoc(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): void {
  let cursorY = 14
  cursorY = drawHeader(doc, view, mode, cursorY)
  cursorY = drawIdentity(doc, view, cursorY)
  cursorY =
    mode === 'periode'
      ? drawPeriodBody(doc, view as BulletinPeriodView, cursorY)
      : drawAnnualBody(doc, view as BulletinAnnualView, cursorY)
  drawFooter(doc, view, mode)
}

// ─── Header ─────────────────────────────────────────────────

function drawHeader(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle',
  yStart: number
): number {
  let y = yStart

  // School name (left)
  doc.setTextColor(...COLOR_NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(view.ecole.nom?.toUpperCase() ?? 'ÉTABLISSEMENT', MARGIN_X, y)

  // République du Bénin (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_INK_400)
  doc.text('RÉPUBLIQUE DU BÉNIN', PAGE_WIDTH - MARGIN_X, y, { align: 'right' })

  y += 5

  // Subline left: ville
  if (view.ecole.ville) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_INK_700)
    doc.text(view.ecole.ville, MARGIN_X, y)
  }

  // Subline right: année scolaire
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_INK_400)
  doc.text(
    `Année scolaire ${view.anneeScolaire}`,
    PAGE_WIDTH - MARGIN_X,
    y,
    { align: 'right' }
  )

  y += 5

  // Devise (italic gold, left)
  if (view.ecole.devise) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR_GOLD)
    doc.text(`« ${view.ecole.devise} »`, MARGIN_X, y)
  }

  y += 4

  // Horizontal rule
  doc.setDrawColor(...COLOR_NAVY)
  doc.setLineWidth(0.4)
  doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y)
  y += 5

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_NAVY)
  const title =
    mode === 'annuelle'
      ? 'BULLETIN ANNUEL'
      : `BULLETIN DE NOTES — ${(view as BulletinPeriodView).periode.toUpperCase()}`
  doc.text(title, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 6
  return y
}

// ─── Identity ───────────────────────────────────────────────

function drawIdentity(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  yStart: number
): number {
  const rows: Row[] = [
    [
      { content: 'Nom et prénoms', styles: identityLabel },
      { content: view.eleve.nom, styles: identityValueBold },
      { content: 'Classe', styles: identityLabel },
      { content: view.classe.nomComplet, styles: identityValueBold },
    ],
    [
      { content: 'Date de naissance', styles: identityLabel },
      { content: view.eleve.dateNaissance || '—', styles: identityValue },
      { content: 'Sexe', styles: identityLabel },
      {
        content: view.eleve.genre === 'F' ? 'Féminin' : 'Masculin',
        styles: identityValue,
      },
    ],
  ]
  autoTable(doc, {
    startY: yStart,
    body: rows,
    theme: 'plain',
    margin: { left: MARGIN_X, right: MARGIN_X },
    styles: { fontSize: 9, cellPadding: 1.5, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { cellWidth: 22 },
      3: { cellWidth: 'auto' },
    },
  })
  // @ts-expect-error — autoTable mutates the doc with this property
  return doc.lastAutoTable.finalY + 4
}

const identityLabel = {
  fontStyle: 'bold' as const,
  fontSize: 7,
  textColor: COLOR_INK_400,
}
const identityValue = {
  fontSize: 9,
  textColor: COLOR_INK_700,
}
const identityValueBold = {
  fontStyle: 'bold' as const,
  fontSize: 9,
  textColor: COLOR_NAVY,
}

// ─── Period body (matières table) ───────────────────────────

function drawPeriodBody(
  doc: jsPDF,
  view: BulletinPeriodView,
  yStart: number
): number {
  // Build the table body row by row. Each row is the matière line plus
  // (if present) a continuation line for raw interros in italic gray.
  const body: Row[] = []

  for (const row of view.matieres) {
    if (row.abandonne) {
      body.push([
        { content: row.matiere, styles: { fontStyle: 'bold', textColor: COLOR_INK_700 } },
        {
          content: 'Élève absent (matière non comptabilisée)',
          colSpan: 6,
          styles: {
            fontStyle: 'italic',
            textColor: [180, 130, 30] as [number, number, number],
            halign: 'center',
          },
        },
      ])
      continue
    }

    body.push([
      { content: row.matiere, styles: { fontStyle: 'bold', textColor: COLOR_INK_700 } },
      {
        content: formatMI(row.moyenneInterros, row.interros ?? []),
        styles: { halign: 'center' },
      },
      { content: fmt(row.devoir1), styles: { halign: 'center' } },
      { content: fmt(row.devoir2), styles: { halign: 'center' } },
      {
        content: fmt(row.moyenneMatiere),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          textColor:
            row.moyenneMatiere === null
              ? COLOR_INK_400
              : row.moyenneMatiere >= 10
                ? COLOR_SUCCESS
                : COLOR_DANGER,
        },
      },
      { content: String(row.coefficient), styles: { halign: 'center' } },
      {
        content: row.totalPoints !== null ? row.totalPoints.toFixed(1) : '—',
        styles: { halign: 'center', textColor: COLOR_NAVY },
      },
    ])
  }

  // Conduite line
  body.push([
    {
      content:
        view.totalHeuresColle > 0
          ? `Conduite (−${view.totalHeuresColle}h colle)`
          : 'Conduite',
      styles: { fontStyle: 'bold', textColor: COLOR_NAVY },
    },
    { content: String(view.baseConduite), styles: { halign: 'center', textColor: COLOR_INK_400 } },
    { content: 'Base', colSpan: 2, styles: { halign: 'center', textColor: COLOR_INK_400, fontSize: 7 } },
    {
      content: view.noteConduite.toFixed(2),
      styles: {
        halign: 'center',
        fontStyle: 'bold',
        textColor: view.noteConduite >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
      },
    },
    { content: String(view.coeffConduite), styles: { halign: 'center' } },
    {
      content: (view.noteConduite * view.coeffConduite).toFixed(1),
      styles: { halign: 'center', textColor: COLOR_NAVY },
    },
  ])

  autoTable(doc, {
    startY: yStart,
    head: [['Matière', 'M.I.', 'Dev1', 'Dev2', 'Moy', 'Coef', 'Total']],
    body,
    foot: [[
      { content: 'TOTAUX', styles: { fontStyle: 'bold', textColor: COLOR_NAVY } },
      { content: 'Moyenne générale', colSpan: 3, styles: { halign: 'right', textColor: COLOR_INK_700, fontSize: 8 } },
      {
        content: view.moyenneGenerale.toFixed(2),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          textColor: view.moyenneGenerale >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
        },
      },
      { content: String(view.totalCoeffs), styles: { halign: 'center', textColor: COLOR_INK_700 } },
      { content: view.totalPoints.toFixed(1), styles: { halign: 'center', textColor: COLOR_NAVY } },
    ]],
    theme: 'grid',
    margin: { left: MARGIN_X, right: MARGIN_X },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 1.5, textColor: COLOR_INK_700 },
    footStyles: {
      fillColor: COLOR_GOLD_BG,
      textColor: COLOR_NAVY,
      fontSize: 9,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 20 },
      5: { cellWidth: 16 },
      6: { cellWidth: 22 },
    },
  })

  // @ts-expect-error
  let y = doc.lastAutoTable.finalY + 5

  // Verdict tiles row (Moyenne / Rang / Mention)
  y = drawVerdictTiles(
    doc,
    [
      { label: 'MOYENNE', value: `${view.moyenneGenerale.toFixed(2)} / 20`, tone: view.moyenneGenerale >= 10 ? 'success' : 'danger' },
      { label: 'RANG', value: view.rang ?? '—', tone: 'navy' },
      { label: 'MENTION', value: view.mention, tone: mentionTone(view.mention) },
    ],
    y
  )

  return y
}

// ─── Annual body ─────────────────────────────────────────────

function drawAnnualBody(
  doc: jsPDF,
  view: BulletinAnnualView,
  yStart: number
): number {
  const body: Row[] = view.periodRows.map((r) => [
    { content: r.periode, styles: { fontStyle: 'bold', textColor: COLOR_INK_700 } },
    {
      content: r.moyenneGenerale.toFixed(2),
      styles: {
        halign: 'center',
        fontStyle: 'bold',
        textColor: r.moyenneGenerale >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
      },
    },
    { content: r.rang ?? '—', styles: { halign: 'center', textColor: COLOR_INK_700 } },
    {
      content: r.mention,
      styles: { halign: 'center', textColor: mentionRGB(r.mention), fontStyle: 'bold' },
    },
  ])

  autoTable(doc, {
    startY: yStart,
    head: [['Période', 'Moy. générale', 'Rang', 'Mention']],
    body,
    foot: [[
      {
        content: `ANNÉE\nFormule ${view.formuleUsed} : ${view.formuleLabel}`,
        styles: { fontStyle: 'bold', textColor: COLOR_NAVY, fontSize: 8 },
      },
      {
        content: view.moyenneAnnuelle.toFixed(2),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          fontSize: 11,
          textColor: view.moyenneAnnuelle >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
        },
      },
      { content: view.rangAnnuel ?? '—', styles: { halign: 'center', textColor: COLOR_NAVY, fontStyle: 'bold' } },
      {
        content: view.mention,
        styles: { halign: 'center', textColor: mentionRGB(view.mention), fontStyle: 'bold' },
      },
    ]],
    theme: 'grid',
    margin: { left: MARGIN_X, right: MARGIN_X },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: { fontSize: 9, cellPadding: 2, textColor: COLOR_INK_700 },
    footStyles: { fillColor: COLOR_GOLD_BG, fontSize: 9 },
  })

  // @ts-expect-error
  let y = doc.lastAutoTable.finalY + 8

  // Statut badge centered — respect feminine agreement for girls
  const statutGendered = statutLabel(
    view.statutAnnuel,
    view.eleve.genre === 'M' || view.eleve.genre === 'F'
      ? view.eleve.genre
      : null
  )
  const statutText = `${statutGendered.toUpperCase()} EN CLASSE SUPÉRIEURE`
  const statutColor = view.statutAnnuel === 'Admis' ? COLOR_SUCCESS : COLOR_DANGER
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...statutColor)
  doc.setDrawColor(...statutColor)
  doc.setLineWidth(0.6)
  const textWidth = doc.getTextWidth(statutText)
  const padding = 6
  const boxX = (PAGE_WIDTH - textWidth - padding * 2) / 2
  const boxY = y
  doc.rect(boxX, boxY, textWidth + padding * 2, 9, 'S')
  doc.text(statutText, PAGE_WIDTH / 2, boxY + 6, { align: 'center' })
  y += 14

  return y
}

// ─── Verdict tiles ──────────────────────────────────────────

interface VerdictTile {
  label: string
  value: string
  tone: 'success' | 'danger' | 'navy' | 'gold'
}

function drawVerdictTiles(doc: jsPDF, tiles: VerdictTile[], yStart: number): number {
  const totalWidth = PAGE_WIDTH - MARGIN_X * 2
  const tileWidth = (totalWidth - 4) / tiles.length
  const tileHeight = 14
  let y = yStart

  tiles.forEach((tile, i) => {
    const x = MARGIN_X + i * (tileWidth + 2)
    const color = toneRGB(tile.tone)
    // Border
    doc.setDrawColor(...color)
    doc.setFillColor(255, 255, 255)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, tileWidth, tileHeight, 1.5, 1.5, 'S')
    // Label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...color)
    doc.text(tile.label, x + tileWidth / 2, y + 4, { align: 'center' })
    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(tile.value, x + tileWidth / 2, y + 10, { align: 'center' })
  })

  return y + tileHeight + 5
}

function toneRGB(tone: VerdictTile['tone']): [number, number, number] {
  switch (tone) {
    case 'success': return COLOR_SUCCESS
    case 'danger':  return COLOR_DANGER
    case 'navy':    return COLOR_NAVY
    case 'gold':    return COLOR_GOLD
  }
}

function mentionTone(m: string): VerdictTile['tone'] {
  if (m === 'Excellent' || m === 'Très bien') return 'gold'
  if (m === 'Bien' || m === 'Passable') return 'navy'
  return 'danger'
}
function mentionRGB(m: string): [number, number, number] {
  return toneRGB(mentionTone(m))
}

// ─── Footer ─────────────────────────────────────────────────

function drawFooter(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): void {
  const pageH = doc.internal.pageSize.getHeight()
  const y = pageH - 30  // 30mm from bottom

  // Three signature blocks
  const labels = ['Le/La Prof. Principal', 'Le Censeur', 'Les parents']
  const blockW = (PAGE_WIDTH - MARGIN_X * 2) / 3
  labels.forEach((label, i) => {
    const x = MARGIN_X + i * blockW
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...COLOR_INK_400)
    doc.text(label, x + blockW / 2, y, { align: 'center' })
    // Signature line
    doc.setDrawColor(...COLOR_INK_400)
    doc.setLineWidth(0.2)
    doc.line(x + 4, y + 12, x + blockW - 4, y + 12)
  })

  // Issued line
  const date = new Date(view.dateCalcul)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(...COLOR_INK_400)
  const issuedText =
    mode === 'annuelle' && view.estVerrouille
      ? `Bulletin émis le ${dateStr} · Document officiel`
      : `Bulletin émis le ${dateStr}`
  doc.text(issuedText, PAGE_WIDTH / 2, y + 18, { align: 'center' })
}

// ─── Helpers ─────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toFixed(2)
}

/**
 * Format M.I. with the raw interros below it on a second line in
 * parentheses. Like "12.50\n(15 · 10)". jsPDF's autoTable handles `\n`.
 */
function formatMI(mi: number | null, interros: number[]): string {
  const main = fmt(mi)
  if (interros.length === 0) return main
  const list = interros
    .map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)))
    .join(' · ')
  return `${main}\n(${list})`
}

function makeFilename(
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): string {
  const safeName = view.eleve.nom
    .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const tag =
    mode === 'annuelle'
      ? 'Annuel'
      : ((view as BulletinPeriodView).periode || '').replace(/\s+/g, '')
  return `Bulletin-${safeName}-${tag}.pdf`
}

function makeBatchFilename(
  classeName: string,
  mode: 'periode' | 'annuelle',
  sample: BulletinPeriodView | BulletinAnnualView | undefined
): string {
  const safeClasse = classeName
    .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const tag =
    mode === 'annuelle'
      ? 'Annuel'
      : ((sample as BulletinPeriodView | undefined)?.periode || 'Periode').replace(/\s+/g, '')
  return `Bulletins-${safeClasse}-${tag}.pdf`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * RT-SC · Bulletin PDF generator (Bulletin v2, Session 3 rewrite).
 *
 * Produces an A4 PDF from a BulletinPeriodView (or its enriched variant)
 * or a BulletinAnnualView. The visual target is the official Béninois
 * CEG bulletin layout — compact, stark, gridded — NOT the prettier
 * on-screen palette. Reference: the CEG Houèto bulletins from
 * ludoskyazon's own school days (2020–2023).
 *
 * Layout sections, in order:
 *   1. Title band — "République du Bénin" + school identity + BP/Tél
 *   2. "BULLETIN DE NOTES" / "BULLETIN ANNUEL" centered band with
 *      année scolaire + période
 *   3. Identity line — inline "Nom & Prénoms … Classe … Effectif …"
 *   4. Matières table — Discipline / Coef / Int / Dev1 / Dev2 / Moy /
 *      Moy×Coef / Rang / Appréciation. Conduite + TOTAUX rows.
 *   5. Moyenne en lettres (left) + Rang (right) strip
 *   6. Discipline + Class stats — two compact side-by-side tables.
 *      Discipline block is hidden when every value is zero.
 *   7. Observations du chef d'établissement — free text, quoted,
 *      italic. Hidden when empty.
 *   8. Décision du conseil de professeurs — gold-highlighted pill.
 *      Hidden when unset.
 *   9. Annual verdict — "Admis/Autorisé à redoubler/Exclu en…" line,
 *      annual mode only.
 *  10. Signatures — PP left with their PNG + printed nom, Parents
 *      center (blank line), Directrice right with her PNG + printed
 *      nom. All three fall back to a bare signature line when their
 *      source data is missing.
 *  11. "Bulletin émis le …" footer line.
 *
 * Public API is unchanged so every call site (ModalBulletinDetail,
 * BulletinsMode, AnnualMode) continues to work:
 *   - generateBulletinPdf(view, mode): Blob
 *   - savePdf(view, mode): void
 *   - generateBulletinsBatchPdf(views, mode): Blob
 *   - saveBatchPdf(views, mode, classeName): void
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  BulletinAnnualView,
  BulletinPeriodView,
} from '@/lib/bulletinView'
import type { EnrichedBulletinPeriodView } from '@/lib/bulletinEnrichment'
import { statutLabel } from '@/lib/statutLabel'

// jspdf-autotable's RowInput type isn't reliably exported across versions,
// so we use a structural alias loose enough to cover all cases we use.
type Row = (string | { content: string; colSpan?: number; rowSpan?: number; styles?: Record<string, unknown> })[]

// ─── Color tokens ─────────────────────────────────────────────
// Official-bulletin palette: mostly black on white, with NAVY used
// sparingly for the title band and GOLD only for the décision highlight.
const COLOR_BLACK: [number, number, number] = [0, 0, 0]
const COLOR_NAVY: [number, number, number] = [17, 34, 64]
const COLOR_GOLD: [number, number, number] = [201, 168, 76]
const COLOR_GOLD_BG: [number, number, number] = [253, 245, 220]
const COLOR_INK_700: [number, number, number] = [60, 70, 90]
const COLOR_INK_500: [number, number, number] = [100, 110, 125]
const COLOR_INK_400: [number, number, number] = [140, 150, 165]
const COLOR_SUCCESS: [number, number, number] = [21, 128, 61]
const COLOR_DANGER: [number, number, number] = [185, 28, 28]
/** Faint navy tint used as the Conduite row background + the stats
 *  card headers, matching the on-screen info-bg tone. */
const COLOR_CONDUITE_BG: [number, number, number] = [245, 247, 252]

// A4 dimensions in mm
const PAGE_WIDTH = 210
const MARGIN_X = 12

// Signature image target size (mm). Fits inside a signature block with
// room for the printed name underneath. 40×15 closely matches the aspect
// ratio of the SignatureDrawCanvas (400×150 logical → 8:3).
const SIG_IMG_W = 40
const SIG_IMG_H = 15

// ─── Public API ─────────────────────────────────────────────

/**
 * Generates the PDF and returns it as a Blob. Caller decides how to
 * deliver it (download, new tab, future ZIP batch).
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
 * filename like "Bulletin-Azon-Ludosky-Semestre1.pdf".
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
 * Generates a single multi-page PDF with one bulletin per page.
 * Views should be pre-sorted (typically by élève nom alphabetical).
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
 * Save a batch PDF with a class + period oriented filename.
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

// ─── Internal: draw one bulletin onto the current page ──────

function drawBulletinOnDoc(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): void {
  let y = 10
  y = drawOfficialHeader(doc, view, mode, y)
  y = drawIdentityLine(doc, view, y)
  y =
    mode === 'periode'
      ? drawPeriodBody(doc, view as BulletinPeriodView, y)
      : drawAnnualBody(doc, view as BulletinAnnualView, y)
  y = drawObservationsAndDecision(doc, view, y)
  if (mode === 'annuelle') {
    y = drawAnnualVerdictLine(doc, view as BulletinAnnualView, y)
  }
  drawSignatures(doc, view)
  drawIssuedLine(doc, view, mode)
}

// ─── 1 + 2. Official header band ────────────────────────────

function drawOfficialHeader(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle',
  yStart: number
): number {
  let y = yStart

  // Line 1 — République du Bénin, centered and uppercase.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_BLACK)
  doc.text('RÉPUBLIQUE DU BÉNIN', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 5

  // Line 2 — School name, larger and bolder. Fall back to a generic
  // label when the school's identity isn't configured.
  const schoolName = (view.ecole.nom ?? 'ÉTABLISSEMENT SCOLAIRE').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...COLOR_NAVY)
  doc.text(schoolName, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 5

  // Line 3 — City + devise in italic, if set. Matches reference style
  // ("B.P. 1855 AB-CALAVI - TEL: 21 15 43 57" though we don't capture
  // BP/Tel — just ville and devise).
  const subParts: string[] = []
  if (view.ecole.ville) subParts.push(view.ecole.ville)
  if (view.ecole.devise) subParts.push(`« ${view.ecole.devise} »`)
  if (subParts.length > 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_INK_500)
    doc.text(subParts.join('   ·   '), PAGE_WIDTH / 2, y, { align: 'center' })
    y += 4
  }

  // Horizontal rule under the school identity block.
  y += 1
  doc.setDrawColor(...COLOR_NAVY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y)
  y += 6

  // Title band — "BULLETIN DE NOTES" / "BULLETIN ANNUEL" centered,
  // with année + période on either side underneath.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLOR_NAVY)
  const title = mode === 'annuelle' ? 'BULLETIN ANNUEL' : 'BULLETIN DE NOTES'
  doc.text(title, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 5

  // Subtitle line: année scolaire on left, période on right (or
  // "ANNÉE" placeholder for annual mode).
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLOR_BLACK)
  doc.text(`ANNÉE SCOLAIRE ${view.anneeScolaire}`, MARGIN_X, y)
  const periodeLabel =
    mode === 'annuelle'
      ? 'ANNÉE COMPLÈTE'
      : (view as BulletinPeriodView).periode.toUpperCase()
  doc.text(periodeLabel, PAGE_WIDTH - MARGIN_X, y, { align: 'right' })
  y += 5

  return y
}

// ─── 3. Identity line ───────────────────────────────────────

function drawIdentityLine(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  yStart: number
): number {
  // Compact 2-row identity block. Row 1: Nom + Classe. Row 2: Date de
  // naissance + Sexe + Effectif. Same idea as on-screen BulletinIdentity.
  const effectif = (view as EnrichedBulletinPeriodView).effectif
  const sexe = view.eleve.genre === 'F' ? 'Féminin' : 'Masculin'

  const rows: Row[] = [
    [
      { content: 'Nom & Prénoms', styles: idLabel },
      { content: view.eleve.nom || '—', styles: idValueBold },
      { content: 'Classe', styles: idLabel },
      { content: view.classe.nomComplet || '—', styles: idValueBold },
    ],
    [
      { content: 'Date de naissance', styles: idLabel },
      { content: view.eleve.dateNaissance || '—', styles: idValue },
      { content: 'Sexe', styles: idLabel },
      { content: sexe, styles: idValue },
    ],
  ]
  if (typeof effectif === 'number') {
    rows[1].push(
      { content: 'Effectif', styles: idLabel },
      { content: String(effectif), styles: idValue }
    )
  }

  autoTable(doc, {
    startY: yStart,
    body: rows,
    theme: 'plain',
    margin: { left: MARGIN_X, right: MARGIN_X },
    styles: { fontSize: 9, cellPadding: 1.3, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 58 },
      2: { cellWidth: 26 },
      3: { cellWidth: 38 },
      4: { cellWidth: 18 },
      5: { cellWidth: 'auto' },
    },
  })
  return getLastY(doc) + 2
}

const idLabel = {
  fontStyle: 'bold' as const,
  fontSize: 7,
  textColor: COLOR_INK_400,
}
const idValue = {
  fontSize: 9,
  textColor: COLOR_INK_700,
}
const idValueBold = {
  fontStyle: 'bold' as const,
  fontSize: 9.5,
  textColor: COLOR_BLACK,
}

// ─── 4. Matières table (periode mode) ───────────────────────

function drawPeriodBody(
  doc: jsPDF,
  view: BulletinPeriodView,
  yStart: number
): number {
  const enriched = view as EnrichedBulletinPeriodView
  const body: Row[] = []

  for (const row of view.matieres) {
    if (row.abandonne) {
      body.push([
        { content: row.matiere, styles: matiereCellBold },
        {
          content: 'Élève absent — matière non comptabilisée',
          colSpan: 8,
          styles: {
            fontStyle: 'italic',
            textColor: COLOR_INK_400,
            halign: 'center',
            fontSize: 7.5,
          },
        },
      ])
      continue
    }

    body.push([
      { content: row.matiere, styles: matiereCellBold },
      { content: String(row.coefficient), styles: centerCell },
      {
        content: formatMI(row.moyenneInterros, row.interros ?? []),
        styles: centerCell,
      },
      { content: fmt(row.devoir1), styles: centerCell },
      { content: fmt(row.devoir2), styles: centerCell },
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
      {
        content: row.totalPoints !== null ? row.totalPoints.toFixed(1) : '—',
        styles: { halign: 'center', textColor: COLOR_NAVY, fontSize: 8 },
      },
      { content: row.rang ?? '—', styles: { ...centerCell, fontSize: 7 } },
      {
        content: row.appreciation ?? '—',
        styles: { halign: 'left', fontStyle: 'italic', textColor: COLOR_INK_700, fontSize: 7.5 },
      },
    ])
  }

  // Conduite row — sits inside the table just above TOTAUX.
  body.push([
    {
      content:
        view.totalHeuresColle > 0
          ? `Conduite (−${view.totalHeuresColle}h colle)`
          : 'Conduite',
      styles: { fontStyle: 'bold', textColor: COLOR_NAVY, fillColor: COLOR_CONDUITE_BG },
    },
    { content: String(view.coeffConduite), styles: { ...centerCell, fillColor: COLOR_CONDUITE_BG } },
    {
      content: `Base ${view.baseConduite}`,
      colSpan: 3,
      styles: { halign: 'center', textColor: COLOR_INK_500, fontSize: 7, fillColor: COLOR_CONDUITE_BG },
    },
    {
      content: view.noteConduite.toFixed(2),
      styles: {
        halign: 'center',
        fontStyle: 'bold',
        textColor: view.noteConduite >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
        fillColor: COLOR_CONDUITE_BG,
      },
    },
    {
      content: (view.noteConduite * view.coeffConduite).toFixed(1),
      styles: { halign: 'center', textColor: COLOR_NAVY, fontSize: 8, fillColor: COLOR_CONDUITE_BG },
    },
    { content: '', colSpan: 2, styles: { fillColor: COLOR_CONDUITE_BG } },
  ])

  autoTable(doc, {
    startY: yStart,
    head: [
      [
        { content: 'DISCIPLINES', styles: { halign: 'left' } },
        { content: 'Coef', styles: {} },
        { content: 'M.I.', styles: {} },
        { content: 'Dev 1', styles: {} },
        { content: 'Dev 2', styles: {} },
        { content: 'Moy /20', styles: {} },
        { content: 'Moy×Coef', styles: {} },
        { content: 'Rang', styles: {} },
        { content: 'Appréciation', styles: { halign: 'left' } },
      ],
    ],
    body,
    foot: [[
      { content: 'TOTAUX', styles: { fontStyle: 'bold', textColor: COLOR_NAVY } },
      { content: String(view.totalCoeffs), styles: centerCell },
      {
        content: 'Moyenne générale',
        colSpan: 3,
        styles: { halign: 'right', textColor: COLOR_INK_700, fontSize: 8 },
      },
      {
        content: view.moyenneGenerale.toFixed(2),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          textColor: view.moyenneGenerale >= 10 ? COLOR_SUCCESS : COLOR_DANGER,
        },
      },
      {
        content: view.totalPoints.toFixed(1),
        styles: { halign: 'center', textColor: COLOR_NAVY, fontStyle: 'bold' },
      },
      {
        content: view.rang ?? '—',
        colSpan: 2,
        styles: { halign: 'center', fontStyle: 'bold', textColor: COLOR_NAVY, fontSize: 8 },
      },
    ]],
    theme: 'grid',
    margin: { left: MARGIN_X, right: MARGIN_X },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 1.5,
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 1.3, textColor: COLOR_INK_700, lineColor: COLOR_INK_400, lineWidth: 0.1 },
    footStyles: {
      fillColor: COLOR_GOLD_BG,
      textColor: COLOR_NAVY,
      fontSize: 9,
      fontStyle: 'bold',
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { cellWidth: 34, halign: 'left' },
      1: { cellWidth: 10 },
      2: { cellWidth: 14 },
      3: { cellWidth: 12 },
      4: { cellWidth: 12 },
      5: { cellWidth: 16 },
      6: { cellWidth: 16 },
      7: { cellWidth: 14 },
      8: { cellWidth: 'auto', halign: 'left' },
    },
  })

  let y = getLastY(doc) + 3

  // Moyenne en lettres (left) + Rang label already inside TOTAUX — here
  // we show the "en toutes lettres" string that reference bulletins have
  // underneath the moyenne.
  if (enriched.moyenneGeneraleEnLettres) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...COLOR_INK_700)
    doc.text(
      `Moyenne en toutes lettres : « ${enriched.moyenneGeneraleEnLettres} »`,
      MARGIN_X,
      y
    )
    y += 5
  }

  // Discipline + Class stats, two compact side-by-side tables. Only
  // render when enrichment data is present (on-screen hook always
  // provides it; legacy view would skip).
  y = drawStatsStrip(doc, enriched, y)

  return y
}

const matiereCellBold = {
  fontStyle: 'bold' as const,
  textColor: COLOR_INK_700,
  fontSize: 8.5,
}
const centerCell = {
  halign: 'center' as const,
  fontSize: 8,
  textColor: COLOR_INK_700,
}

// ─── Stats strip (discipline + class stats) ─────────────────

function drawStatsStrip(
  doc: jsPDF,
  view: EnrichedBulletinPeriodView,
  yStart: number
): number {
  const hasClassStats = Boolean(view.classStats)
  const hasDiscipline = Boolean(
    view.disciplineStats &&
      (view.disciplineStats.retards > 0 ||
        view.disciplineStats.absences > 0 ||
        view.disciplineStats.heuresColle > 0 ||
        view.disciplineStats.avertissements > 0 ||
        view.disciplineStats.exclusions > 0)
  )
  if (!hasClassStats && !hasDiscipline) return yStart

  // We build TWO autoTables side by side by rendering one on the left
  // half and one on the right half. jsPDF-autotable lays them out
  // vertically, so we render the left, capture its finalY, and render
  // the right using the SAME startY to force parallel layout. We then
  // return the max of the two finalY values.
  const halfWidth = (PAGE_WIDTH - MARGIN_X * 2 - 4) / 2
  const leftMargin = { left: MARGIN_X, right: MARGIN_X + halfWidth + 4 }
  const rightMargin = { left: MARGIN_X + halfWidth + 4, right: MARGIN_X }

  let leftEnd = yStart
  let rightEnd = yStart

  if (hasDiscipline && view.disciplineStats) {
    const d = view.disciplineStats
    const rows: Row[] = []
    if (d.retards > 0) rows.push(['Retards', String(d.retards)])
    if (d.absences > 0) rows.push(['Absences', String(d.absences)])
    if (d.heuresColle > 0) rows.push(['Consignes (heures)', `${d.heuresColle} h`])
    if (d.avertissements > 0) rows.push(['Avertissements', String(d.avertissements)])
    if (d.exclusions > 0) rows.push(['Exclusions (jours)', String(d.exclusions)])

    autoTable(doc, {
      startY: yStart,
      head: [[{ content: 'DISCIPLINE', colSpan: 2, styles: { halign: 'left' } }]],
      body: rows as Row[],
      theme: 'grid',
      margin: leftMargin,
      headStyles: {
        fillColor: COLOR_CONDUITE_BG,
        textColor: COLOR_NAVY,
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 1.2,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 1.2,
        textColor: COLOR_INK_700,
        lineColor: COLOR_INK_400,
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      },
    })
    leftEnd = getLastY(doc)
  }

  if (hasClassStats && view.classStats) {
    const s = view.classStats
    autoTable(doc, {
      startY: yStart,
      head: [[{ content: 'STATISTIQUES DE LA CLASSE', colSpan: 2, styles: { halign: 'left' } }]],
      body: [
        ['Moyenne la plus élevée', s.moyenneMax.toFixed(2)],
        ['Moyenne la plus faible', s.moyenneMin.toFixed(2)],
        ['Moyenne de la classe', s.moyenneClasse.toFixed(2)],
      ] as Row[],
      theme: 'grid',
      margin: rightMargin,
      headStyles: {
        fillColor: COLOR_CONDUITE_BG,
        textColor: COLOR_NAVY,
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 1.2,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 1.2,
        textColor: COLOR_INK_700,
        lineColor: COLOR_INK_400,
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      },
    })
    rightEnd = getLastY(doc)
  }

  return Math.max(leftEnd, rightEnd) + 4
}

// ─── 4 (annual). Per-period summary table ───────────────────

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
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 1.8,
      textColor: COLOR_INK_700,
      lineColor: COLOR_INK_400,
      lineWidth: 0.1,
    },
    footStyles: { fillColor: COLOR_GOLD_BG, fontSize: 9, textColor: COLOR_NAVY },
  })
  return getLastY(doc) + 4
}

// ─── 7 + 8. Observations + Décision ─────────────────────────

function drawObservationsAndDecision(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  yStart: number
): number {
  const obs = view.observationsChef
  const decision = view.decisionConseil
  if (!obs && !decision) return yStart

  let y = yStart

  // Header band for the observations block — thin gold bar with label.
  doc.setFillColor(...COLOR_GOLD_BG)
  doc.setDrawColor(...COLOR_GOLD)
  doc.setLineWidth(0.4)
  const bandH = 6
  doc.rect(MARGIN_X, y, PAGE_WIDTH - MARGIN_X * 2, bandH, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_NAVY)
  doc.text('OBSERVATIONS & DÉCISION DU CONSEIL', MARGIN_X + 2, y + bandH - 1.8)
  y += bandH + 2

  // Décision pill — right-aligned, framed in gold. Rendered only when set.
  if (decision) {
    const pillText = decision.toUpperCase()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    const pillW = doc.getTextWidth(pillText) + 8
    const pillH = 6
    const pillX = PAGE_WIDTH - MARGIN_X - pillW
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...COLOR_GOLD)
    doc.setLineWidth(0.5)
    doc.roundedRect(pillX, y, pillW, pillH, 1.5, 1.5, 'FD')
    doc.setTextColor(...COLOR_NAVY)
    doc.text(pillText, pillX + pillW / 2, y + pillH - 1.7, { align: 'center' })

    // "Décision :" label next to the pill, left side.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_INK_500)
    doc.text('DÉCISION DU CONSEIL', MARGIN_X, y + pillH - 1.7)
    y += pillH + 2
  }

  // Observations text — italic, quoted, wrapped.
  if (obs) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_INK_500)
    doc.text("OBSERVATIONS DU CHEF D'ÉTABLISSEMENT", MARGIN_X, y + 2)
    y += 4

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_INK_700)
    const wrapped = doc.splitTextToSize(
      `« ${obs.trim()} »`,
      PAGE_WIDTH - MARGIN_X * 2
    ) as string[]
    doc.text(wrapped, MARGIN_X, y + 3)
    // Line height at fontSize 9 ≈ 4mm
    y += wrapped.length * 4 + 2
  }

  return y + 2
}

// ─── 9. Annual verdict line (annual mode only) ──────────────

function drawAnnualVerdictLine(
  doc: jsPDF,
  view: BulletinAnnualView,
  yStart: number
): number {
  // Mirrors the reference bulletins' three-option line:
  //   "Admis(e) en …    Autorisé(e) à redoubler …    Exclu(e) pour …"
  // We emphasize the one that matches view.statutAnnuel. The "next
  // class" field is blank (we don't track it in the model); admin
  // fills it by hand on the printed copy if needed.
  const y = yStart + 2
  const genderSuffix = view.eleve.genre === 'F' ? '(e)' : ''
  const statutGendered = statutLabel(
    view.statutAnnuel,
    view.eleve.genre === 'M' || view.eleve.genre === 'F' ? view.eleve.genre : null
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_NAVY)
  doc.text(
    `${statutGendered.toUpperCase()} — Décision finale`,
    MARGIN_X,
    y
  )

  // Sub-line with the three canonical options, the matching one in
  // solid black, the others dimmed.
  const optAdmis = `Admis${genderSuffix} en`
  const optRedouble = `Autorisé${genderSuffix} à redoubler`
  const optExclu = `Exclu${genderSuffix} pour`
  const options = [optAdmis, optRedouble, optExclu]
  const highlighted =
    view.statutAnnuel === 'Admis' ? 0 : view.statutAnnuel === 'Échoué' ? 1 : -1

  let cursorX = MARGIN_X
  const subY = y + 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  options.forEach((label, i) => {
    const isActive = i === highlighted
    doc.setTextColor(...(isActive ? COLOR_BLACK : COLOR_INK_400))
    doc.setFont('helvetica', isActive ? 'bold' : 'normal')
    const text = `☐ ${label} …………………………`
    doc.text(text, cursorX, subY)
    cursorX += doc.getTextWidth(text) + 2
  })

  return subY + 5
}

// ─── 10. Signatures (PP left, parents center, directrice right) ─

function drawSignatures(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView
): void {
  const pageH = doc.internal.pageSize.getHeight()
  // Reserve ~35mm from bottom: signatures sit above the "Bulletin émis"
  // footer line. If the content body overflowed into this space, we'd
  // want a second page — but A4 bulletins rarely overflow in practice.
  const y = pageH - 40
  const blockW = (PAGE_WIDTH - MARGIN_X * 2) / 3

  // Labels matching the reference bulletins' terminology.
  const blocks: Array<{
    label: string
    imageDataUrl?: string
    printedName?: string
  }> = [
    {
      label: 'Le / La Professeur Principal',
      imageDataUrl: view.signaturePP,
      printedName: view.ppNom,
    },
    {
      label: 'Les parents',
      // No PNG for parents — always a blank signature line.
    },
    {
      label: 'La Directrice / Le Directeur',
      imageDataUrl: view.signatureDirectrice,
    },
  ]

  blocks.forEach((block, i) => {
    const x = MARGIN_X + i * blockW
    const centerX = x + blockW / 2

    // Top label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...COLOR_INK_500)
    doc.text(block.label, centerX, y, { align: 'center' })

    // Signature image (if present). Rendered above the signature line.
    // jsPDF accepts "data:image/png;base64,..." strings directly. We
    // try/catch because a corrupted PNG could otherwise bubble up and
    // abort the whole PDF generation.
    if (block.imageDataUrl) {
      try {
        doc.addImage(
          block.imageDataUrl,
          'PNG',
          centerX - SIG_IMG_W / 2,
          y + 2,
          SIG_IMG_W,
          SIG_IMG_H
        )
      } catch (err) {
        // Log and continue — the signature line below still renders.
        console.warn('[bulletinPdf] signature image failed:', (err as Error).message)
      }
    }

    // Signature line — always drawn, giving a place for a handwritten
    // signature even when no PNG was captured.
    const lineY = y + SIG_IMG_H + 4
    doc.setDrawColor(...COLOR_INK_400)
    doc.setLineWidth(0.3)
    doc.line(x + 3, lineY, x + blockW - 3, lineY)

    // Printed name underneath (only for PP where we have it).
    if (block.printedName) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...COLOR_INK_700)
      doc.text(block.printedName, centerX, lineY + 3.5, { align: 'center' })
    }
  })
}

// ─── 11. Bulletin émis le … ─────────────────────────────────

function drawIssuedLine(
  doc: jsPDF,
  view: BulletinPeriodView | BulletinAnnualView,
  mode: 'periode' | 'annuelle'
): void {
  const pageH = doc.internal.pageSize.getHeight()
  const y = pageH - 8

  const date = new Date(view.dateCalcul)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const loc = view.ecole.ville ? `${view.ecole.ville}, ` : ''
  const officialSuffix =
    mode === 'annuelle' && view.estVerrouille ? ' · Document officiel' : ''
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(...COLOR_INK_400)
  doc.text(
    `Bulletin émis le ${loc}${dateStr}${officialSuffix}`,
    PAGE_WIDTH / 2,
    y,
    { align: 'center' }
  )
}

// ─── Small helpers ──────────────────────────────────────────

function mentionRGB(m: string): [number, number, number] {
  if (m === 'Excellent' || m === 'Très bien') return COLOR_GOLD
  if (m === 'Bien') return COLOR_SUCCESS
  if (m === 'Passable') return COLOR_NAVY
  return COLOR_DANGER
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(2)
}

/**
 * Format M.I. with the raw interros below it on a second line in
 * parentheses. Like "12.50\n(15 · 10)".
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

/**
 * Typed accessor for autoTable's `doc.lastAutoTable.finalY`. autoTable
 * mutates the doc without updating jsPDF's types; isolating the cast
 * here keeps the rest of the file free of @ts-expect-error comments.
 */
function getLastY(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lat = (doc as any).lastAutoTable
  return typeof lat?.finalY === 'number' ? lat.finalY : 0
}

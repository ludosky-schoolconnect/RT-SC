/**
 * RT-SC · Quest Ticket PDF.
 *
 * Generates an A6 landscape ticket — small enough to be paper-
 * efficient when printed, large enough to hold the essential info
 * for an admin to verify a claim. Designed to print 4-up on an A4
 * sheet (A4 = 4 × A6).
 *
 * Layout:
 *   - Gold header band
 *   - "TICKET DE QUÊTE" title + ticket code
 *   - Eleve + classe + quest title
 *   - Reward (+X pts) badge
 *   - Date + claimed-by line
 *   - Footer: school name + small instruction
 */

import jsPDF from 'jspdf'

// A6 landscape in mm
const PAGE_W = 148
const PAGE_H = 105

const NAVY: [number, number, number] = [11, 37, 69]
const GOLD: [number, number, number] = [201, 168, 76]
const GOLD_PALE: [number, number, number] = [253, 246, 227]
const INK_700: [number, number, number] = [60, 70, 90]
const INK_400: [number, number, number] = [140, 150, 165]
const SUCCESS: [number, number, number] = [21, 128, 61]

export interface TicketPdfInput {
  ticketCode: string
  queteTitre: string
  eleveNom: string
  classeNom: string
  pointsRecompense: number
  claimedAt: Date
  /** Display name of who registered the claim (student themselves
   *  shows as "Élève", prof/admin show their name) */
  claimedByLabel: string
  schoolName?: string
  /** Optional kind tag — defaults to 'quete' (Phase 2). Phase 3 will
   *  add 'redemption' for reward-claim tickets. */
  kind?: 'quete' | 'redemption'
  /** For redemption tickets — what was claimed */
  redemptionLabel?: string
}

export function downloadTicketPdf(input: TicketPdfInput): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a6' })
  drawTicket(doc, input)
  const safeCode = input.ticketCode.replace(/[^A-Z0-9-]/gi, '')
  doc.save(`Ticket_${safeCode}.pdf`)
}

export function generateTicketPdfBlob(input: TicketPdfInput): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a6' })
  drawTicket(doc, input)
  return doc.output('blob')
}

// ─── Drawing ────────────────────────────────────────────────

function drawTicket(doc: jsPDF, input: TicketPdfInput): void {
  const isRedemption = input.kind === 'redemption'
  const titleText = isRedemption ? "TICKET DE RÉCOMPENSE" : "TICKET DE QUÊTE"

  // Outer rounded frame
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.6)
  doc.roundedRect(3, 3, PAGE_W - 6, PAGE_H - 6, 2, 2, 'FD')

  // Gold header band
  doc.setFillColor(...GOLD)
  doc.rect(3, 3, PAGE_W - 6, 12, 'F')

  // Title in band
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(titleText, 8, 11)

  // Ticket code in band (right-aligned)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(input.ticketCode, PAGE_W - 8, 11, { align: 'right' })

  // School name (small, under the band)
  if (input.schoolName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...INK_400)
    doc.text(input.schoolName.toUpperCase(), 8, 20)
  }

  // Main content — left column = labels, right = values
  const leftX = 8
  let y = 30

  drawField(doc, leftX, y, 'Élève', input.eleveNom, NAVY, 'helvetica', 'bold', 11)
  y += 9

  drawField(doc, leftX, y, 'Classe', input.classeNom, INK_700, 'helvetica', 'normal', 9)
  y += 8

  if (isRedemption && input.redemptionLabel) {
    drawField(doc, leftX, y, 'Récompense', input.redemptionLabel, INK_700, 'helvetica', 'bold', 10)
  } else {
    drawField(doc, leftX, y, 'Quête', input.queteTitre, INK_700, 'helvetica', 'bold', 10)
  }
  y += 9

  // Points badge (gold for quest = earning, navy for redemption = spending)
  const badgeColor = isRedemption ? NAVY : SUCCESS
  const badgeLabel = isRedemption
    ? `-${input.pointsRecompense} pts`
    : `+${input.pointsRecompense} pts`
  const badgeWidth = 26
  doc.setFillColor(...badgeColor)
  doc.roundedRect(leftX, y, badgeWidth, 7, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(badgeLabel, leftX + badgeWidth / 2, y + 4.8, { align: 'center' })

  // Footer area — date + claimed-by
  const footerY = PAGE_H - 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...INK_400)
  const dateStr = input.claimedAt.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(dateStr, leftX, footerY)
  doc.text(`Émis par : ${input.claimedByLabel}`, leftX, footerY + 4)

  // Tiny instruction at bottom
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(...INK_400)
  const note = isRedemption
    ? "Présentez ce ticket à l'administration pour récupérer votre récompense."
    : "Présentez ce ticket après accomplissement pour validation."
  doc.text(note, PAGE_W / 2, PAGE_H - 6, { align: 'center' })

  // Subtle gold corner accents (cosmetic)
  doc.setFillColor(...GOLD_PALE)
  doc.rect(PAGE_W - 8, 18, 4, 4, 'F')
  doc.rect(PAGE_W - 8, PAGE_H - 22, 4, 4, 'F')
}

function drawField(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  valueColor: [number, number, number],
  font: string,
  fontStyle: 'bold' | 'normal',
  fontSize: number
): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(140, 150, 165)
  doc.text(label.toUpperCase(), x, y - 3.5)

  doc.setFont(font, fontStyle)
  doc.setFontSize(fontSize)
  doc.setTextColor(...valueColor)
  // Truncate long values to roughly 80mm width (A6 landscape internal area)
  const truncated = truncateForWidth(doc, value, PAGE_W - x - 12)
  doc.text(truncated, x, y)
}

function truncateForWidth(doc: jsPDF, text: string, maxMm: number): string {
  if (doc.getTextWidth(text) <= maxMm) return text
  let cut = text.length - 1
  while (cut > 4 && doc.getTextWidth(text.slice(0, cut) + '…') > maxMm) {
    cut--
  }
  return text.slice(0, cut) + '…'
}

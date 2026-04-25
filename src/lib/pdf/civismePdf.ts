/**
 * RT-SC · Civisme certificate PDF.
 *
 * Landscape A4 "Certificat d'Honneur" produced via jsPDF (no
 * html2canvas dependency — all drawing is vector + text). Matches
 * the RT-SC palette (navy + gold) rather than legacy's amber.
 *
 * Usage:
 *   import { downloadCivismeCertificate } from '@/lib/pdf/civismePdf'
 *   downloadCivismeCertificate({
 *     nomEleve: 'Caled AKOTEGNON',
 *     classeNom: '3ème M1',
 *     points: 19,
 *     anneeScolaire: '2026-2027',
 *     schoolName: 'CEG HOUETO',
 *   })
 */

import jsPDF from 'jspdf'
import { serverNow } from '@/lib/serverTime'

// A4 landscape in mm
const PAGE_W = 297
const PAGE_H = 210

// RT-SC palette, PDF-safe
const NAVY: [number, number, number] = [11, 37, 69]
const GOLD: [number, number, number] = [201, 168, 76]
const GOLD_LIGHT: [number, number, number] = [232, 201, 122]
const GOLD_PALE: [number, number, number] = [253, 246, 227]
const INK_600: [number, number, number] = [74, 85, 104]
const INK_400: [number, number, number] = [138, 150, 168]
const SUCCESS: [number, number, number] = [26, 127, 75]

export interface CivismeCertInput {
  nomEleve: string
  classeNom?: string
  points: number
  anneeScolaire?: string
  schoolName?: string
}

/**
 * Build the certificate and return a Blob. The caller decides whether
 * to download it, open it in a new tab, etc.
 */
export function generateCivismeCertificate(input: CivismeCertInput): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  drawCertificate(doc, input)
  return doc.output('blob')
}

/**
 * Build and trigger a browser download in one call. Filename is
 * derived from the student's name.
 */
export function downloadCivismeCertificate(input: CivismeCertInput): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  drawCertificate(doc, input)
  const safeName = input.nomEleve.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  doc.save(`Certificat_Civisme_${safeName || 'eleve'}.pdf`)
}

// ─── Drawing ────────────────────────────────────────────────────

function drawCertificate(doc: jsPDF, input: CivismeCertInput): void {
  // 1. Outer decorative frame
  doc.setFillColor(...GOLD_PALE)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  // Gold border
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.rect(8, 8, PAGE_W - 16, PAGE_H - 16, 'S')

  // Inner navy rule
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.3)
  doc.rect(11, 11, PAGE_W - 22, PAGE_H - 22, 'S')

  // Corner ornaments (small gold squares)
  drawCornerOrnament(doc, 14, 14)
  drawCornerOrnament(doc, PAGE_W - 14 - 6, 14)
  drawCornerOrnament(doc, 14, PAGE_H - 14 - 6)
  drawCornerOrnament(doc, PAGE_W - 14 - 6, PAGE_H - 14 - 6)

  // 2. Top marque — school + "SchoolConnect"
  if (input.schoolName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK_400)
    doc.text(input.schoolName.toUpperCase(), PAGE_W / 2, 22, { align: 'center' })
  }

  // Crown glyph substitute — a gold diamond row since jsPDF's
  // default font may not have proper crown emoji support
  doc.setDrawColor(...GOLD)
  doc.setFillColor(...GOLD)
  drawDiamondRow(doc, PAGE_W / 2, 30, 5)

  // 3. Title: "CERTIFICAT D'HONNEUR"
  doc.setFont('times', 'bold')
  doc.setFontSize(36)
  doc.setTextColor(...NAVY)
  doc.text("CERTIFICAT D'HONNEUR", PAGE_W / 2, 50, { align: 'center' })

  // Subtitle
  doc.setFont('times', 'italic')
  doc.setFontSize(14)
  doc.setTextColor(...INK_600)
  doc.text('& de Mérite Civique', PAGE_W / 2, 60, { align: 'center' })

  // 4. "Décerné avec fierté à"
  doc.setFont('times', 'italic')
  doc.setFontSize(12)
  doc.setTextColor(...INK_400)
  doc.text('Décerné avec fierté à', PAGE_W / 2, 78, { align: 'center' })

  // 5. Student name — large, bold, underlined
  doc.setFont('times', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...NAVY)
  doc.text(input.nomEleve, PAGE_W / 2, 95, { align: 'center' })

  // Underline under the name
  const nameWidth = doc.getTextWidth(input.nomEleve)
  const underlineW = Math.max(nameWidth + 20, 120)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.8)
  doc.line(
    (PAGE_W - underlineW) / 2,
    99,
    (PAGE_W + underlineW) / 2,
    99
  )

  // Classe line (small, below name)
  if (input.classeNom) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK_400)
    doc.text(`Classe de ${input.classeNom}`, PAGE_W / 2, 106, { align: 'center' })
  }

  // 6. Citation paragraph
  doc.setFont('times', 'normal')
  doc.setFontSize(11.5)
  doc.setTextColor(...INK_600)
  const citation =
    "Pour avoir démontré un comportement exemplaire, une intégrité remarquable et un engagement exceptionnel envers les valeurs de notre établissement durant l'année scolaire."
  const wrapped = doc.splitTextToSize(citation, 180)
  doc.text(wrapped, PAGE_W / 2, 120, { align: 'center' })

  // 7. Score badge
  const badgeW = 90
  const badgeH = 14
  const badgeX = (PAGE_W - badgeW) / 2
  const badgeY = 148
  doc.setFillColor(...SUCCESS)
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(
    `Note de Civisme : ${input.points} / 20`,
    PAGE_W / 2,
    badgeY + 9.5,
    { align: 'center' }
  )

  // 8. Signatures row at the bottom
  const sigY = 180

  // Left — L'Administration
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(40, sigY, 100, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text("L'Administration", 70, sigY + 5, { align: 'center' })

  // Right — Signature officielle (SchoolConnect)
  doc.setFont('times', 'italic')
  doc.setFontSize(16)
  doc.setTextColor(...GOLD)
  doc.text('SchoolConnect', PAGE_W - 70, sigY - 3, { align: 'center' })
  doc.setDrawColor(...NAVY)
  doc.line(PAGE_W - 100, sigY, PAGE_W - 40, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Signature Officielle', PAGE_W - 70, sigY + 5, { align: 'center' })

  // Footer — year + generation date
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK_400)
  const footerParts: string[] = []
  if (input.anneeScolaire) footerParts.push(`Année scolaire ${input.anneeScolaire}`)
  footerParts.push(
    `Délivré le ${serverNow().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`
  )
  doc.text(footerParts.join('  ·  '), PAGE_W / 2, PAGE_H - 14, { align: 'center' })
}

// ─── Decorative helpers ────────────────────────────────────────

function drawCornerOrnament(doc: jsPDF, x: number, y: number): void {
  doc.setFillColor(...GOLD_LIGHT)
  doc.rect(x, y, 6, 6, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(x + 1.5, y + 1.5, 3, 3, 'F')
}

function drawDiamondRow(
  doc: jsPDF,
  cx: number,
  cy: number,
  count: number
): void {
  const size = 2.5
  const spacing = 6
  const totalW = (count - 1) * spacing
  const startX = cx - totalW / 2
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing
    // Middle diamond slightly bigger
    const s = i === Math.floor(count / 2) ? size * 1.4 : size
    doc.triangle(x - s, cy, x, cy - s, x + s, cy, 'F')
    doc.triangle(x - s, cy, x, cy + s, x + s, cy, 'F')
  }
}

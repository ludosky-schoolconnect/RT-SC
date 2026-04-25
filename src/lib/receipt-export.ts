/**
 * RT-SC · Receipt PDF — per-paiement.
 *
 * Generates an A4 receipt with school header, student identity, and
 * payment details. Designed to print on standard paper or save as PDF.
 *
 * Two versions side-by-side (duplicate sur la même feuille) so admin
 * keeps one copy, parent keeps the other. Cut line between them.
 *
 * This does NOT handle money; it's a printable acknowledgment of a
 * cash payment that admin already accepted. Useful for:
 *   - Parent records
 *   - Audit trail (signed + dated)
 *   - Dispute resolution if parent claims they paid more than recorded
 */

import { jsPDF } from 'jspdf'
import { formatFCFA } from '@/hooks/usePaiements'
import { serverNow } from '@/lib/serverTime'

interface ReceiptInput {
  ecoleNom?: string
  ecoleAdresse?: string
  ecoleTelephone?: string
  eleveNom: string
  matricule?: string
  classeNom: string
  anneeScolaire: string
  montant: number
  montantEnLettres?: string
  methode?: string
  note?: string
  date: Date
  caissier: string
  receiptNumber?: string  // e.g. last 6 chars of paiement doc id
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

function safeSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
}

function formatDateFR(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return d.toLocaleDateString('fr-FR')
  }
}

/**
 * Best-effort French words for a number. Rough and not comprehensive
 * — covers 0 to 999,999,999 which is more than enough for school fees
 * (the largest plausible single paiement is a few hundred thousand
 * FCFA). Falls back to empty string on overflow.
 */
function numberToFrenchWords(n: number): string {
  const num = Math.round(Math.abs(n))
  if (num === 0) return 'zéro'
  if (num >= 1_000_000_000) return ''

  const units = [
    '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
    'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  ]
  const tens = [
    '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
    'soixante', 'quatre-vingt', 'quatre-vingt',
  ]

  function below100(n: number): string {
    if (n < 17) return units[n]
    if (n < 20) return 'dix-' + units[n - 10]
    const t = Math.floor(n / 10)
    const u = n % 10
    if (t === 7 || t === 9) {
      const base = tens[t]
      const second = n - t * 10 + 10
      return base + (second === 11 && t === 7 ? ' et onze' : '-' + below100(second).replace(/^-/, ''))
    }
    if (u === 0) return tens[t] + (t === 8 ? 's' : '')
    if (u === 1 && t !== 8) return tens[t] + ' et un'
    return tens[t] + '-' + units[u]
  }

  function below1000(n: number): string {
    if (n < 100) return below100(n)
    const h = Math.floor(n / 100)
    const rest = n % 100
    const prefix = h === 1 ? 'cent' : units[h] + ' cent' + (rest === 0 ? 's' : '')
    return rest === 0 ? prefix : prefix + ' ' + below100(rest)
  }

  const millions = Math.floor(num / 1_000_000)
  const thousands = Math.floor((num % 1_000_000) / 1000)
  const rest = num % 1000

  const parts: string[] = []
  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : below1000(millions) + ' millions')
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : below1000(thousands) + ' mille')
  }
  if (rest > 0) {
    parts.push(below1000(rest))
  }
  return parts.join(' ')
}

export function exportReceiptPDF(input: ReceiptInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const halfH = pageH / 2
  const navy: [number, number, number] = [11, 37, 69]
  const ink600: [number, number, number] = [90, 102, 122]
  const ink400: [number, number, number] = [150, 160, 176]

  const d = serverNow()
  const dateLine = formatDateFR(input.date)
  const amountStr = formatFCFA(input.montant)
  const amountWords = input.montantEnLettres || (
    numberToFrenchWords(input.montant)
      ? numberToFrenchWords(input.montant) + ' francs CFA'
      : ''
  )
  const receiptNum =
    input.receiptNumber ??
    `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-${pad(
      Math.floor(Math.random() * 9999),
      4
    )}`

  function drawReceipt(yOffset: number, copyLabel: 'Souche' | 'Reçu parent') {
    // Header bar
    doc.setFillColor(...navy)
    doc.rect(0, yOffset, pageW, 42, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text(input.ecoleNom || 'Établissement scolaire', 40, yOffset + 20)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (input.ecoleAdresse || input.ecoleTelephone) {
      const line = [input.ecoleAdresse, input.ecoleTelephone]
        .filter(Boolean)
        .join(' · ')
      doc.text(line, 40, yOffset + 34)
    }

    // Copy label (top-right)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(copyLabel.toUpperCase(), pageW - 40, yOffset + 24, { align: 'right' })

    let y = yOffset + 64

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...navy)
    doc.text('Reçu de paiement', 40, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ink400)
    doc.text(`N° ${receiptNum}`, pageW - 40, y, { align: 'right' })

    y += 22

    // Identity block
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...navy)
    doc.text(input.eleveNom, 40, y)

    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ink600)
    const idBits = [
      input.matricule ? `Matricule : ${input.matricule}` : null,
      `Classe : ${input.classeNom}`,
      `Année : ${input.anneeScolaire}`,
    ].filter(Boolean) as string[]
    doc.text(idBits.join('   ·   '), 40, y)

    y += 20

    // Amount — boxed, prominent
    doc.setDrawColor(...navy)
    doc.setLineWidth(1)
    doc.rect(40, y, pageW - 80, 42)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...navy)
    doc.text(amountStr, pageW / 2, y + 22, { align: 'center' })

    if (amountWords) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...ink600)
      doc.text(`soit ${amountWords}`, pageW / 2, y + 36, { align: 'center' })
    }

    y += 54

    // Meta lines
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ink600)

    const metaLines: Array<[string, string]> = [
      ['Date', dateLine],
      ['Caissier', input.caissier],
    ]
    if (input.methode) metaLines.push(['Mode', input.methode])
    if (input.note) metaLines.push(['Note', input.note])

    for (const [label, value] of metaLines) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...navy)
      doc.text(label, 40, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...ink600)
      doc.text(value, 100, y)
      y += 14
    }

    // Signature line
    y = yOffset + halfH - 40
    doc.setDrawColor(...ink400)
    doc.setLineWidth(0.5)
    doc.line(pageW - 220, y, pageW - 40, y)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...ink400)
    doc.text('Signature & cachet', pageW - 130, y + 10, { align: 'center' })
  }

  // Top half: Souche (school keeps)
  drawReceipt(0, 'Souche')

  // Cut line
  doc.setDrawColor(...ink400)
  doc.setLineDashPattern([4, 3], 0)
  doc.setLineWidth(0.5)
  doc.line(20, halfH, pageW - 20, halfH)
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(...ink400)
  doc.text('✂  —  découpez ici', pageW / 2, halfH - 3, { align: 'center' })

  // Bottom half: Reçu parent
  drawReceipt(halfH, 'Reçu parent')

  const fname = `recu-${safeSlug(input.eleveNom)}-${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}.pdf`
  doc.save(fname)
}

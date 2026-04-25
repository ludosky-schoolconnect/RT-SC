/**
 * RT-SC · Absence export utilities (CSV + PDF).
 *
 * Used by the admin Archive view and the Appels du jour view. The
 * shape of an exported row is abstracted so both surfaces can call
 * the same helpers — Archive has `dateISO` as the grouping key while
 * Appels du jour is always "today", but the per-row data is identical.
 *
 * CSV uses UTF-8 BOM so Excel on Windows opens the accented French
 * characters correctly (without it, "Mathématiques" renders as
 * "MathÃ©matiques").
 *
 * PDF uses jspdf + jspdf-autotable. Portrait A4, repeating header,
 * summary line at the top ("Archive des absences — 45 lignes — du ...
 * au ..."). Intentionally minimal; if users need richer reports we
 * can add per-class grouping with autotable's `didDrawPage` later.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { serverNow } from '@/lib/serverTime'

export interface AbsenceExportRow {
  dateISO: string
  classeNom: string
  eleveNom: string
  matiere: string
  heure: string
  prof: string
  raison: string
}

// ─── Date formatters ──────────────────────────────────────────

function formatDateFR(dateISO: string): string {
  if (!dateISO) return ''
  try {
    const d = new Date(dateISO + 'T12:00:00')
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch {
    return dateISO
  }
}

function formatDateLongFR(dateISO: string): string {
  if (!dateISO) return ''
  try {
    const d = new Date(dateISO + 'T12:00:00')
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return dateISO
  }
}

function nowTimestampCompact(): string {
  const d = serverNow()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

// ─── File download helper ─────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay — some browsers cancel the download
  // if we revoke synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ─── CSV ──────────────────────────────────────────────────────

/** Escapes a CSV field per RFC 4180 (quote if contains quote/comma/CR/LF). */
function csvField(s: string): string {
  if (s == null) return ''
  const str = String(s)
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

const CSV_HEADERS = ['Date', 'Classe', 'Élève', 'Matière', 'Heure', 'Prof', 'Raison']

export function exportAbsencesCSV(
  rows: AbsenceExportRow[],
  filenamePrefix: string
) {
  const lines: string[] = [CSV_HEADERS.map(csvField).join(',')]
  for (const r of rows) {
    lines.push(
      [
        formatDateFR(r.dateISO),
        r.classeNom,
        r.eleveNom,
        r.matiere,
        r.heure,
        r.prof,
        r.raison || '(raison inconnue)',
      ]
        .map(csvField)
        .join(',')
    )
  }
  // UTF-8 BOM for Excel compat
  const content = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const filename = `${filenamePrefix}-${nowTimestampCompact()}.csv`
  triggerDownload(blob, filename)
}

// ─── PDF ──────────────────────────────────────────────────────

export function exportAbsencesPDF(
  rows: AbsenceExportRow[],
  options: {
    title: string
    subtitle?: string
    filenamePrefix: string
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(11, 37, 69) // navy
  doc.text(options.title, 40, 50)

  // Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 102, 122)
  const subtitle =
    options.subtitle ??
    `${rows.length} ligne${rows.length > 1 ? 's' : ''} · généré le ${formatDateFR(
      new Date().toISOString().slice(0, 10)
    )}`
  doc.text(subtitle, 40, 68)

  // Table
  autoTable(doc, {
    startY: 90,
    head: [CSV_HEADERS],
    body: rows.map((r) => [
      formatDateFR(r.dateISO),
      r.classeNom,
      r.eleveNom,
      r.matiere,
      r.heure,
      r.prof,
      r.raison || '—',
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [11, 37, 69], // navy
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 249, 252],
    },
    columnStyles: {
      0: { cellWidth: 55 },  // Date
      1: { cellWidth: 60 },  // Classe
      2: { cellWidth: 90 },  // Élève
      3: { cellWidth: 75 },  // Matière
      4: { cellWidth: 40 },  // Heure
      5: { cellWidth: 70 },  // Prof
      6: { cellWidth: 'auto' }, // Raison
    },
    margin: { left: 40, right: 40 },
  })

  doc.save(`${options.filenamePrefix}-${nowTimestampCompact()}.pdf`)
}

// ─── Helpers for UI labels ────────────────────────────────────

/** Build a human subtitle for a date range. */
export function rangeSubtitle(fromISO: string, toISO: string, count: number): string {
  return `${count} absence${count > 1 ? 's' : ''} · du ${formatDateLongFR(fromISO)} au ${formatDateLongFR(toISO)}`
}

/** Build a human subtitle for a single day. */
export function todaySubtitle(count: number): string {
  return `${count} absence${count > 1 ? 's' : ''} · ${formatDateLongFR(new Date().toISOString().slice(0, 10))}`
}

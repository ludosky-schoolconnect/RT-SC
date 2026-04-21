/**
 * RT-SC · Transcript export — per-élève archived records.
 *
 * Used by the year archive's EleveDetail view to download an élève's
 * full transcript for a given school year. Two formats:
 *
 *   - CSV — one combined file with two sections (bulletins, notes)
 *   - PDF — a proper formal transcript with identity header,
 *     bulletins table, and notes table grouped by matière
 *
 * Keeps per-surface formatting (UTF-8 BOM for Excel, jspdf autotable
 * for PDF) consistent with absence-export.ts.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Bulletin, Eleve, Note } from '@/types/models'

interface ExtractMoyObj {
  moyenneInterros?: number | null
  devoir1?: number | null
  devoir2?: number | null
}

function extractNoteMoy(n: Note): number | null {
  const mm = n.moyenneMatiere as unknown
  if (typeof mm === 'number') return mm
  if (mm && typeof mm === 'object') {
    const obj = mm as ExtractMoyObj
    const vals = [obj.moyenneInterros, obj.devoir1, obj.devoir2].filter(
      (v): v is number => typeof v === 'number'
    )
    if (!vals.length) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }
  return null
}

function sortBulletins(bs: (Bulletin & { id: string })[]): (Bulletin & { id: string })[] {
  return [...bs].sort((a, b) => {
    const aA = a.periode === 'Année'
    const bA = b.periode === 'Année'
    if (aA !== bA) return aA ? 1 : -1
    return String(a.periode).localeCompare(String(b.periode))
  })
}

function nowTimestampCompact(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function csvField(s: string | number | null | undefined): string {
  if (s == null) return ''
  const str = String(s)
  if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
  return str
}

// ─── CSV ──────────────────────────────────────────────────────

export function exportTranscriptCSV(input: {
  eleveNom: string
  matricule?: string
  classeNom: string
  annee: string
  bulletins: (Bulletin & { id: string })[]
  notes: (Note & { id: string })[]
}) {
  const bulletins = sortBulletins(input.bulletins)

  const lines: string[] = []

  // Header block (non-tabular, just labelled pairs at the top)
  lines.push(csvField('Relevé de scolarité'))
  lines.push(`${csvField('Élève')},${csvField(input.eleveNom)}`)
  if (input.matricule) lines.push(`${csvField('Matricule')},${csvField(input.matricule)}`)
  lines.push(`${csvField('Classe')},${csvField(input.classeNom)}`)
  lines.push(`${csvField('Année')},${csvField(input.annee)}`)
  lines.push('')

  // Bulletins section
  lines.push(csvField('BULLETINS'))
  lines.push(['Période', 'Moyenne', 'Conduite', 'Colles (h)', 'Rang', 'Verrouillé'].map(csvField).join(','))
  for (const b of bulletins) {
    lines.push(
      [
        b.periode as string,
        typeof b.moyenneGenerale === 'number' ? b.moyenneGenerale.toFixed(2) : '',
        typeof b.noteConduite === 'number' ? b.noteConduite.toFixed(2) : '',
        typeof b.totalHeuresColle === 'number' ? String(b.totalHeuresColle) : '',
        b.rang ?? '',
        b.estVerrouille ? 'oui' : 'non',
      ]
        .map(csvField)
        .join(',')
    )
  }
  lines.push('')

  // Notes section — group by matière then period
  lines.push(csvField('NOTES'))
  lines.push(['Matière', 'Période', 'Moyenne', 'Abandon'].map(csvField).join(','))
  const byMat = new Map<string, Note[]>()
  for (const n of input.notes) {
    const m = (n.matiere ?? 'Matière inconnue') as string
    if (!byMat.has(m)) byMat.set(m, [])
    byMat.get(m)!.push(n)
  }
  const mats = Array.from(byMat.keys()).sort((a, b) => a.localeCompare(b))
  for (const mat of mats) {
    for (const n of byMat.get(mat)!) {
      const moy = extractNoteMoy(n)
      lines.push(
        [
          mat,
          (n.periode ?? '—') as string,
          moy !== null ? moy.toFixed(2) : '',
          n.abandon ? 'oui' : 'non',
        ]
          .map(csvField)
          .join(',')
      )
    }
  }

  const content = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const fn = `releve-${safeSlug(input.eleveNom)}-${input.annee}-${nowTimestampCompact()}.csv`
  triggerDownload(blob, fn)
}

// ─── PDF ──────────────────────────────────────────────────────

export function exportTranscriptPDF(input: {
  eleveNom: string
  matricule?: string
  classeNom: string
  annee: string
  bulletins: (Bulletin & { id: string })[]
  notes: (Note & { id: string })[]
  ecoleNom?: string
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const navy: [number, number, number] = [11, 37, 69]
  const ink600: [number, number, number] = [90, 102, 122]
  const zebra: [number, number, number] = [248, 249, 252]

  const bulletins = sortBulletins(input.bulletins)

  // Header bar
  doc.setFillColor(...navy)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, 'F')

  if (input.ecoleNom) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(input.ecoleNom, 40, 26)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text('Relevé de scolarité', 40, 50)

  // Identity block
  let y = 95
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...navy)
  doc.text(input.eleveNom, 40, y)

  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...ink600)
  const idLine: string[] = [
    `Classe : ${input.classeNom}`,
    `Année : ${input.annee}`,
  ]
  if (input.matricule) idLine.unshift(`Matricule : ${input.matricule}`)
  doc.text(idLine.join('   ·   '), 40, y)

  y += 22

  // Bulletins table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...navy)
  doc.text('Bulletins', 40, y)
  y += 6

  autoTable(doc, {
    startY: y,
    head: [['Période', 'Moyenne', 'Conduite', 'Colles (h)', 'Rang', 'Verrouillé']],
    body: bulletins.map((b) => [
      b.periode as string,
      typeof b.moyenneGenerale === 'number' ? b.moyenneGenerale.toFixed(2) : '—',
      typeof b.noteConduite === 'number' ? b.noteConduite.toFixed(2) : '—',
      typeof b.totalHeuresColle === 'number' ? String(b.totalHeuresColle) : '—',
      b.rang ?? '—',
      b.estVerrouille ? 'oui' : 'non',
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: zebra },
    margin: { left: 40, right: 40 },
  })

  // Notes table — grouped by matière
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  y = finalY + 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...navy)
  doc.text('Notes par matière', 40, y)
  y += 6

  const byMat = new Map<string, Note[]>()
  for (const n of input.notes) {
    const m = (n.matiere ?? 'Matière inconnue') as string
    if (!byMat.has(m)) byMat.set(m, [])
    byMat.get(m)!.push(n)
  }
  const mats = Array.from(byMat.keys()).sort((a, b) => a.localeCompare(b))

  const rows: (string | number)[][] = []
  for (const mat of mats) {
    for (const n of byMat.get(mat)!) {
      const moy = extractNoteMoy(n)
      rows.push([
        mat,
        (n.periode ?? '—') as string,
        moy !== null ? moy.toFixed(2) : '—',
        n.abandon ? 'oui' : '',
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Matière', 'Période', 'Moyenne', 'Abandon']],
    body: rows.length ? rows : [['—', '—', '—', '—']],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: zebra },
    margin: { left: 40, right: 40 },
  })

  doc.save(`releve-${safeSlug(input.eleveNom)}-${input.annee}-${nowTimestampCompact()}.pdf`)
}

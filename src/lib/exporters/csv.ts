/**
 * RT-SC · CSV exporter.
 * Pure JS — no external dependency. Use for small, simple tabular exports
 * where users want to open in any spreadsheet without metadata or styling.
 *
 * UTF-8 BOM included so Excel renders accents (é, à, ç) correctly.
 */

import type { ExportColumn } from './types'

interface CsvOptions<T> {
  filename: string
  columns: ExportColumn<T>[]
  rows: T[]
  delimiter?: ',' | ';'
}

function escapeCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // RFC 4180 — wrap in quotes if it contains delimiter, quote, or newline
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function exportToCsv<T>({
  filename,
  columns,
  rows,
  delimiter = ',',
}: CsvOptions<T>) {
  const header = columns.map((c) => escapeCell(c.header, delimiter)).join(delimiter)
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCell(c.accessor(row), delimiter)).join(delimiter)
    )
    .join('\r\n')
  const csv = '\uFEFF' + header + '\r\n' + body  // BOM + content
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const cleanName = filename.endsWith('.csv') ? filename : `${filename}.csv`
  downloadBlob(blob, cleanName)
}

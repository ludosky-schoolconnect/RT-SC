/**
 * RT-SC · Excel (XLSX) exporter.
 *
 * Uses SheetJS (the `xlsx` package), lazy-loaded inside the function so
 * the heavy library only downloads when someone actually clicks "Export Excel".
 *
 * Supports multi-sheet workbooks: pass `{ sheets: [...] }`.
 */

import type { ExportSheet } from './types'

interface ExcelOptions<T> {
  filename: string
  sheets: ExportSheet<T>[]
}

export async function exportToExcel<T>({ filename, sheets }: ExcelOptions<T>) {
  // Lazy import — keeps initial bundle small
  const XLSX = await import('xlsx')

  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    // Convert rows to AOA (array of arrays)
    const headerRow = sheet.columns.map((c) => c.header)
    const dataRows = sheet.rows.map((row) =>
      sheet.columns.map((c) => {
        const v = c.accessor(row)
        return v === null || v === undefined ? '' : v
      })
    )
    const aoa = [headerRow, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Apply column widths if provided, else auto-size to max content length
    ws['!cols'] = sheet.columns.map((c, idx) => {
      const explicit = c.width
      if (explicit) return { wch: explicit }
      const maxContent = Math.max(
        c.header.length,
        ...dataRows.map((r) => String(r[idx] ?? '').length)
      )
      return { wch: Math.min(Math.max(maxContent + 2, 8), 50) }
    })

    // Sheet names: max 31 chars, no special chars
    const safeName = sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }

  const cleanName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, cleanName)
}

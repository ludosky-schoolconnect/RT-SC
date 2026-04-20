/**
 * RT-SC · Exporter types.
 * Shared schema for PDF / Excel / CSV exports.
 */

export interface ExportColumn<T = unknown> {
  /** Column header label */
  header: string
  /** Pull a string value out of one row */
  accessor: (row: T) => string | number | null | undefined
  /** Optional column width hint in characters (used by Excel) */
  width?: number
}

export interface ExportSheet<T = unknown> {
  name: string
  columns: ExportColumn<T>[]
  rows: T[]
}

export interface PdfMetadata {
  title?: string
  subtitle?: string
  schoolName?: string
  generatedAt?: Date
  /** Free-form footer line */
  footer?: string
}

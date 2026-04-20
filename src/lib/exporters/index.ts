/**
 * RT-SC · Exporters barrel.
 * Single import surface for any module that needs to export data.
 *
 * Example:
 *   import { exportToCsv, exportToExcel, exportToPdf } from '@/lib/exporters'
 *
 *   exportToCsv({
 *     filename: 'eleves-3eme-M1',
 *     columns: [
 *       { header: 'Nom', accessor: e => e.nom },
 *       { header: 'Genre', accessor: e => e.genre },
 *     ],
 *     rows: eleves,
 *   })
 */

export { exportToCsv } from './csv'
export { exportToExcel } from './excel'
export { exportToPdf } from './pdf'
export type { ExportColumn, ExportSheet, PdfMetadata } from './types'

/**
 * RT-SC · DataTable
 *
 * Generic responsive table.
 * - On md+ screens: real <table> with hover rows
 * - On small screens: stacked card view (each row becomes a card)
 *
 * For very large datasets (>50 rows), wrap the children in <VirtualList>
 * inside a custom rendering — DataTable itself doesn't virtualize.
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  /** Stable id, also used as key */
  id: string
  /** Header label */
  header: ReactNode
  /** Render the cell for one row */
  cell: (row: T) => ReactNode
  /** Optional class for header + cell alignment */
  className?: string
  /** Hide on mobile (still shown in card view via the cell fn) */
  hideOnMobile?: boolean
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode
  /** Mobile card title rendered atop each card */
  mobileTitle?: (row: T) => ReactNode
  className?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'Aucune donnée',
  emptyDescription,
  emptyIcon,
  mobileTitle,
  className,
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        className={className}
      />
    )
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop / tablet table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-ink-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-ink-50/50 text-ink-400 text-[0.7rem] font-bold uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn('px-4 py-3 whitespace-nowrap', col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-t border-ink-100 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-info-bg'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn('px-4 py-3 align-middle text-ink-800', col.className)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              'rounded-lg border border-ink-100 bg-white p-4 shadow-xs',
              onRowClick && 'cursor-pointer hover:border-navy transition-colors'
            )}
          >
            {mobileTitle && (
              <div className="font-display font-semibold text-navy mb-2">
                {mobileTitle(row)}
              </div>
            )}
            <dl className="space-y-1.5">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((col) => (
                  <div key={col.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-ink-400 text-[0.75rem] uppercase tracking-wide font-semibold">
                      {col.header}
                    </dt>
                    <dd className="text-ink-800 text-right">{col.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

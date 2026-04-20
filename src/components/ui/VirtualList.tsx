/**
 * RT-SC · VirtualList
 *
 * Wraps @tanstack/react-virtual to virtualize lists with 50+ items.
 * Only renders the visible rows (+ small overscan), keeps scrolling at 60fps.
 *
 * Usage:
 *   <VirtualList
 *     items={eleves}
 *     rowHeight={64}
 *     getKey={(e) => e.id}
 *     renderRow={(e) => <EleveRow eleve={e} />}
 *   />
 */

import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/cn'

interface VirtualListProps<T> {
  items: T[]
  /** Estimated row height in px — used for scroll math */
  rowHeight: number
  getKey: (item: T) => string
  renderRow: (item: T, index: number) => ReactNode
  /** Number of extra rows above/below the viewport (default 6) */
  overscan?: number
  /** Class on the scrolling container */
  className?: string
  /** Class on each row wrapper */
  rowClassName?: string
}

export function VirtualList<T>({
  items,
  rowHeight,
  getKey,
  renderRow,
  overscan = 6,
  className,
  rowClassName,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => getKey(items[index]),
  })

  return (
    <div
      ref={parentRef}
      className={cn('overflow-y-auto', className)}
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const item = items[vRow.index]
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              className={cn('absolute inset-x-0', rowClassName)}
              style={{ transform: `translateY(${vRow.start}px)` }}
            >
              {renderRow(item, vRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

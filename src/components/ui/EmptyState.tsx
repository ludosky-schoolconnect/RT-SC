/**
 * RT-SC · EmptyState
 *
 * Friendly placeholder for empty lists/sections.
 * Use Lucide icon at 40px, muted gray.
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12',
        'rounded-lg border border-dashed border-ink-100 bg-ink-50/30',
        className
      )}
    >
      {icon && (
        <div className="mb-3 text-ink-400" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-navy mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-ink-600 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionCardProps {
  title: string
  description?: string
  icon?: ReactNode
  tone?: 'default' | 'warning' | 'danger' | 'success'
  children: ReactNode
  className?: string
}

/**
 * A titled card with optional icon + description. Used for each
 * management section in the Command Center (FedaPay config,
 * Subscription config, Support, Actions).
 */
export function SectionCard({
  title,
  description,
  icon,
  tone = 'default',
  children,
  className,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border-[1.5px] bg-white shadow-xs overflow-hidden',
        tone === 'default' && 'border-ink-100',
        tone === 'warning' && 'border-warning/30',
        tone === 'danger' && 'border-danger/30',
        tone === 'success' && 'border-success/30',
        className
      )}
    >
      <div
        className={cn(
          'px-5 py-4 border-b flex items-start gap-3',
          tone === 'default' && 'border-ink-100',
          tone === 'warning' && 'border-warning/20 bg-warning-bg/30',
          tone === 'danger' && 'border-danger/20 bg-danger-bg/30',
          tone === 'success' && 'border-success/20 bg-success-bg/30'
        )}
      >
        {icon && (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md shrink-0 border',
              tone === 'default' && 'bg-info-bg border-navy/15 text-navy',
              tone === 'warning' &&
                'bg-warning-bg border-warning/30 text-warning-dark',
              tone === 'danger' && 'bg-danger-bg border-danger/30 text-danger',
              tone === 'success' && 'bg-success-bg border-success/30 text-success'
            )}
          >
            <span className="h-4 w-4">{icon}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-[1rem] font-bold text-navy leading-tight">
            {title}
          </h2>
          {description && (
            <p className="text-[0.78rem] text-ink-500 mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

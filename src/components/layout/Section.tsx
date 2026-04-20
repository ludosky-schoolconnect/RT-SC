/**
 * RT-SC · Section & SectionHeader
 *
 * Layout primitives for content groupings inside dashboards.
 * Provides consistent vertical rhythm and a header pattern
 * (display title + optional kicker + optional action).
 */

import { type ReactNode, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// ─── Section ────────────────────────────────────────────────

interface SectionProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

export function Section({ className, children, ...rest }: SectionProps) {
  return (
    <section className={cn('mb-8', className)} {...rest}>
      {children}
    </section>
  )
}

// ─── SectionHeader ──────────────────────────────────────────

interface SectionHeaderProps {
  /** Small uppercase kicker above the title (e.g. "ADMINISTRATION") */
  kicker?: string
  /** Main title in Playfair Display */
  title: string
  /** Optional supporting line under title */
  description?: string
  /** Right-aligned actions (button, search, etc.) */
  action?: ReactNode
  className?: string
}

export function SectionHeader({
  kicker,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        'mb-5 flex items-start justify-between gap-3 flex-wrap',
        className
      )}
    >
      <div className="flex-1 min-w-0">
        {kicker && (
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-1">
            {kicker}
          </p>
        )}
        <h2 className="font-display text-2xl font-bold text-navy tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-ink-600 leading-relaxed max-w-prose">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

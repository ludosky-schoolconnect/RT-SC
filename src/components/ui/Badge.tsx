/**
 * RT-SC · Badge
 *
 * Small pill used everywhere: cycle, série, statut, types d'annonce, vigilance level.
 * All variant colors mapped to the design tokens — never raw colors at call sites.
 */

import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeVariant =
  | 'neutral'
  | 'navy'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'gold'
  | 'serie-a'
  | 'serie-b'
  | 'serie-c'
  | 'serie-d'

export type BadgeSize = 'sm' | 'md'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  leadingIcon?: ReactNode
  children?: ReactNode
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-ink-50 text-ink-600 border-ink-100',
  navy: 'bg-info-bg text-navy border-navy/20',
  success: 'bg-success-bg text-success border-success/30',
  warning: 'bg-warning-bg text-warning border-warning/30',
  danger: 'bg-danger-bg text-danger border-danger/30',
  info: 'bg-info-bg text-navy border-navy/20',
  gold: 'bg-gold-pale text-warning border-gold/30',
  'serie-a': 'bg-serie-a-bg text-serie-a border-serie-a/30',
  'serie-b': 'bg-serie-b-bg text-serie-b border-serie-b/30',
  'serie-c': 'bg-serie-c-bg text-serie-c border-serie-c/30',
  'serie-d': 'bg-serie-d-bg text-serie-d border-serie-d/30',
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-6 px-2 text-[0.6875rem] gap-1',
  md: 'h-7 px-3 text-[0.75rem] gap-1.5',
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  leadingIcon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-semibold tracking-wide whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
    </span>
  )
}

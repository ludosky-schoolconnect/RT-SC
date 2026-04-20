/**
 * RT-SC · Spinner
 * Lightweight loading indicator. For inline button states use the Button's `loading` prop.
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div
      role="status"
      className={cn('inline-flex items-center gap-2 text-ink-400', className)}
      aria-live="polite"
    >
      <Loader2 className={cn('animate-spin', SIZE_CLASSES[size])} aria-hidden />
      {label && <span className="text-sm">{label}</span>}
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

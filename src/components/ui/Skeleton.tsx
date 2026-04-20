/**
 * RT-SC · Skeleton
 *
 * Shimmer loading placeholder. Use as a more polished alternative to "Chargement…" text.
 * Composed of a base block with a shimmer animation defined in base.css.
 */

import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Apply rounded-full instead of rounded-md */
  circle?: boolean
}

export function Skeleton({ className, circle, ...rest }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton-shimmer',
        circle ? 'rounded-full' : 'rounded-md',
        'bg-ink-100',
        className
      )}
      aria-hidden
      {...rest}
    />
  )
}

// Common pre-built skeletons

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton circle className="h-10 w-10" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border-[1.5px] border-ink-100 bg-white p-5 space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  )
}

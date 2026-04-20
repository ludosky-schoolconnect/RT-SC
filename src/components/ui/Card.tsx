/**
 * RT-SC · Card
 *
 * Foundation white surface used everywhere lists, forms, and content panels live.
 * Optional gold gradient top accent (matches legacy `.classe-card::before`).
 * Optional hover lift via Framer Motion.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Show a navy→gold gradient strip at the top */
  accent?: boolean
  /** Lift slightly on hover */
  interactive?: boolean
  /** Padded inner area */
  padded?: boolean
  children?: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    className,
    accent = false,
    interactive = false,
    padded = true,
    children,
    ...rest
  },
  ref
) {
  return (
    <motion.div
      ref={ref}
      whileHover={interactive ? { y: -2, boxShadow: '0 4px 20px rgba(11,37,69,0.12)' } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'relative bg-white border-[1.5px] border-ink-100 rounded-lg shadow-xs',
        'transition-colors duration-200 ease-out-soft',
        accent && 'overflow-hidden',
        padded && 'p-5',
        className
      )}
      {...rest}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy to-gold"
        />
      )}
      {children}
    </motion.div>
  )
})

// ─── Sub-parts ──────────────────────────────────────────────

interface SubProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function CardHeader({ className, children, ...rest }: SubProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...rest }: SubProps) {
  return (
    <h3
      className={cn('font-display text-lg font-semibold text-navy tracking-tight', className)}
      {...rest}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...rest }: SubProps) {
  return (
    <p className={cn('text-[0.875rem] text-ink-600 leading-relaxed', className)} {...rest}>
      {children}
    </p>
  )
}

export function CardFooter({ className, children, ...rest }: SubProps) {
  return (
    <div
      className={cn(
        'mt-4 pt-4 border-t border-ink-100 flex items-center justify-end gap-2',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

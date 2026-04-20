/**
 * RT-SC · IconButton
 *
 * Square button (44×44) for icon-only actions: close, edit, delete, more, etc.
 * Always include an `aria-label`.
 */

import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'

export type IconButtonVariant = 'ghost' | 'subtle' | 'danger'

interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: IconButtonVariant
  /** Required for accessibility when no visible label exists */
  'aria-label': string
  children: ReactNode
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost:
    'text-ink-400 hover:text-navy hover:bg-ink-50',
  subtle:
    'text-navy bg-ink-50 hover:bg-ink-100',
  danger:
    'text-danger hover:bg-danger-bg',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { variant = 'ghost', disabled, className, children, ...rest },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        type="button"
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-md',
          'transition-colors duration-150 ease-out-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          VARIANT_CLASSES[variant],
          className
        )}
        {...rest}
      >
        {children}
      </motion.button>
    )
  }
)

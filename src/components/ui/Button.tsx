/**
 * RT-SC · Button
 *
 * Variants: primary (navy), secondary (white outline), danger (red), ghost (transparent)
 * Sizes: sm, md, lg
 * States: loading (shows spinner), disabled
 * Supports leading/trailing icons via Lucide.
 *
 * Press feedback via Framer Motion `whileTap`.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'form'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  children?: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-navy text-white hover:bg-navy-light shadow-sm hover:shadow-md',
  secondary:
    'bg-white text-navy border-[1.5px] border-ink-100 hover:border-navy hover:bg-info-bg',
  danger:
    'bg-danger text-white hover:bg-[#9B1C1C] shadow-sm hover:shadow-md',
  ghost:
    'bg-transparent text-navy hover:bg-ink-50',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-4 text-[0.8125rem] gap-1.5',
  md: 'min-h-[44px] px-5 text-[0.9375rem] gap-2',
  lg: 'min-h-[50px] px-6 text-[1rem] gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold tracking-tight',
        'transition-colors duration-150 ease-out-soft',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gold/70',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </motion.button>
  )
})

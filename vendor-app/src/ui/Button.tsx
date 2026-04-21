import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'success'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    loading = false,
    icon,
    children,
    fullWidth = false,
    className,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[0.875rem] font-semibold tracking-tight transition-all min-h-touch',
        'active:scale-[0.99]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variant === 'primary' &&
          'bg-navy text-white hover:bg-navy-light shadow-xs',
        variant === 'secondary' &&
          'border border-navy/20 text-navy hover:bg-info-bg',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        variant === 'success' && 'bg-success text-white hover:bg-success/90',
        variant === 'ghost' &&
          'text-ink-500 hover:bg-ink-50 hover:text-navy',
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <span className="h-4 w-4 shrink-0" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
})

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

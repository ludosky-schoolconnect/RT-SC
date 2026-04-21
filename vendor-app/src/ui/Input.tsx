import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
  leftIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, className, id, ...rest },
  ref
) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[0.78rem] font-semibold text-ink-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none"
            aria-hidden
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2.5 text-[0.9rem] text-ink-800',
            'placeholder:text-ink-300',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-navy/15 focus:border-navy/30',
            leftIcon && 'pl-9',
            error
              ? 'border-danger/50 focus:border-danger focus:ring-danger/15'
              : 'border-ink-200 hover:border-ink-300',
            className
          )}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-[0.72rem] text-ink-400 leading-snug">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-[0.72rem] text-danger leading-snug">{error}</p>
      )}
    </div>
  )
})

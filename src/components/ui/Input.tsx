/**
 * RT-SC · Input
 *
 * Wraps <input> with optional label, hint, error message, and leading/trailing slots.
 * Designed to work with React Hook Form via `register` spread.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  leading?: ReactNode
  trailing?: ReactNode
  containerClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leading,
    trailing,
    className,
    containerClassName,
    id,
    ...rest
  },
  ref
) {
  const reactId = useId()
  const inputId = id ?? reactId

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-[0.8125rem] font-semibold text-ink-800"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
            {leading}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full min-h-touch rounded-md border-[1.5px] bg-white px-4 py-3 text-[0.9375rem]',
            'placeholder:text-ink-400 text-ink-800',
            'transition-colors duration-150 ease-out-soft',
            'focus:outline-none focus:border-navy focus:ring-2 focus:ring-gold/30',
            'disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-ink-100',
            leading && 'pl-10',
            trailing && 'pr-10',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...rest}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
            {trailing}
          </div>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[0.8125rem] text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

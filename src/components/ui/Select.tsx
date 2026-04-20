/**
 * RT-SC · Select
 *
 * Native <select> with custom styling so it stays accessible and works on mobile
 * (Android Chrome opens its native picker). Includes label / hint / error.
 *
 * For richer combobox behavior (search-as-you-type), build a separate component
 * later — this one covers 95% of cases.
 */

import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    className,
    containerClassName,
    id,
    children,
    ...rest
  },
  ref
) {
  const reactId = useId()
  const selectId = id ?? reactId

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-[0.8125rem] font-semibold text-ink-800"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full min-h-touch rounded-md border-[1.5px] bg-white px-4 pr-10 py-3 text-[0.9375rem]',
            'text-ink-800 appearance-none cursor-pointer',
            'transition-colors duration-150 ease-out-soft',
            'focus:outline-none focus:border-navy focus:ring-2 focus:ring-gold/30',
            'disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-ink-100',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
          }
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none"
          aria-hidden
        />
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="text-[0.8125rem] text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

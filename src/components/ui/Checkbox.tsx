/**
 * RT-SC · Checkbox & Radio
 *
 * Custom-styled native inputs.
 * Use as form controls; the label is part of the clickable area.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

interface BaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
  description?: string
  error?: string
  containerClassName?: string
}

// ─── Checkbox ─────────────────────────────────────────────

export const Checkbox = forwardRef<HTMLInputElement, BaseProps>(function Checkbox(
  { label, description, error, className, containerClassName, id, ...rest },
  ref
) {
  const reactId = useId()
  const inputId = id ?? reactId

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex items-start gap-3 cursor-pointer select-none',
        rest.disabled && 'opacity-50 cursor-not-allowed',
        containerClassName
      )}
    >
      <span className="relative flex h-5 w-5 mt-0.5 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px]',
            'transition-all duration-150 ease-out-soft',
            'border-ink-200 bg-white',
            'peer-checked:border-navy peer-checked:bg-navy',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-gold/40',
            error && 'border-danger',
            className
          )}
        >
          <Check
            className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
            strokeWidth={3}
            aria-hidden
          />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        {label && (
          <span className="text-[0.9375rem] text-ink-800 leading-snug">
            {label}
          </span>
        )}
        {description && (
          <span className="text-[0.8125rem] text-ink-400">{description}</span>
        )}
        {error && <span className="text-[0.8125rem] text-danger">{error}</span>}
      </span>
    </label>
  )
})

// ─── Radio ─────────────────────────────────────────────────

export const Radio = forwardRef<HTMLInputElement, BaseProps>(function Radio(
  { label, description, error, className, containerClassName, id, ...rest },
  ref
) {
  const reactId = useId()
  const inputId = id ?? reactId

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex items-start gap-3 cursor-pointer select-none',
        rest.disabled && 'opacity-50 cursor-not-allowed',
        containerClassName
      )}
    >
      <span className="relative flex h-5 w-5 mt-0.5 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className="peer absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border-[1.5px]',
            'transition-all duration-150 ease-out-soft',
            'border-ink-200 bg-white',
            'peer-checked:border-navy',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-gold/40',
            error && 'border-danger',
            className
          )}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-navy scale-0 transition-transform peer-checked:scale-100" />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        {label && (
          <span className="text-[0.9375rem] text-ink-800 leading-snug">
            {label}
          </span>
        )}
        {description && (
          <span className="text-[0.8125rem] text-ink-400">{description}</span>
        )}
        {error && <span className="text-[0.8125rem] text-danger">{error}</span>}
      </span>
    </label>
  )
})

/**
 * RT-SC · Textarea
 * Same wrapper pattern as Input — label / hint / error.
 */

import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, className, containerClassName, id, ...rest },
    ref
  ) {
    const reactId = useId()
    const textareaId = id ?? reactId

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[0.8125rem] font-semibold text-ink-800"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full min-h-[100px] rounded-md border-[1.5px] bg-white px-4 py-3 text-[0.9375rem] resize-y',
            'placeholder:text-ink-400 text-ink-800',
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
            error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined
          }
          {...rest}
        />
        {error ? (
          <p id={`${textareaId}-error`} className="text-[0.8125rem] text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${textareaId}-hint`} className="text-[0.8125rem] text-ink-400">
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
)

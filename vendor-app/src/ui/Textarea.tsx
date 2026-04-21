import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
  mono?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, mono = false, className, id, ...rest },
    ref
  ) {
    const autoId = useId()
    const textareaId = id ?? autoId

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[0.78rem] font-semibold text-ink-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2.5 text-[0.85rem] text-ink-800',
            'placeholder:text-ink-300',
            'transition-colors duration-150 resize-y',
            'focus:outline-none focus:ring-2 focus:ring-navy/15 focus:border-navy/30',
            mono && 'font-mono text-[0.78rem] leading-relaxed',
            error
              ? 'border-danger/50 focus:border-danger focus:ring-danger/15'
              : 'border-ink-200 hover:border-ink-300',
            className
          )}
          {...rest}
        />
        {hint && !error && (
          <p className="mt-1.5 text-[0.72rem] text-ink-400 leading-snug">
            {hint}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-[0.72rem] text-danger leading-snug">{error}</p>
        )}
      </div>
    )
  }
)

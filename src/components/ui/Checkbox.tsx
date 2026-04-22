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

// ─── RadioCard ─────────────────────────────────────────────
//
// Large-target radio option rendered as a full "card" with a bold
// selected state (gold border + gold-pale fill + corner check icon).
// The entire card is clickable on mobile. Use this for multiple-choice
// settings where the difference between options matters at a glance
// (e.g. Trimestre vs Semestre, Premier vs Second cycle) — the vanilla
// <Radio> primitive is too subtle for these.
//
// Selected state is visually obvious from 3 feet away:
//   - Border: gold, 2px (unselected = ink-200, 1px)
//   - Background: gold-pale/40 tint (unselected = white)
//   - Check icon in top-right corner appears when selected
//
// Accessibility:
//   - Native <input type="radio"> is rendered but visually hidden
//     (still focusable via keyboard, still groups via `name`)
//   - The <label> wraps it so clicking anywhere on the card toggles it
//   - Focus ring on the card surface via peer-focus-visible

interface RadioCardProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: string
  /** Optional lucide-react icon node, rendered on the left of the label */
  icon?: ReactNode
  containerClassName?: string
}

export const RadioCard = forwardRef<HTMLInputElement, RadioCardProps>(function RadioCard(
  { label, description, icon, className, containerClassName, id, checked, ...rest },
  ref
) {
  const reactId = useId()
  const inputId = id ?? reactId
  // We read `checked` in React rather than relying on Tailwind's peer-checked
  // modifier so we can conditionally style DESCENDANTS of the card (icon tint,
  // check badge visibility) without CSS sibling-selector gymnastics.
  // The native <input> still drives a11y/keyboard/focus; we just style
  // imperatively from the same state.

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'relative block cursor-pointer select-none',
        rest.disabled && 'opacity-50 cursor-not-allowed',
        containerClassName
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="radio"
        className="peer sr-only"
        checked={checked}
        {...rest}
      />
      <span
        className={cn(
          // Base card surface — min-h ≥ 44px tap target
          'flex items-start gap-2.5 rounded-lg p-3.5 min-h-[60px]',
          'transition-all duration-150 ease-out-soft',
          // Default vs selected — controlled via React state, not peer CSS
          checked
            ? 'border-[2px] border-gold bg-gold-pale/40'
            : 'border-[1.5px] border-ink-200 bg-white hover:border-ink-300',
          // Focus ring (driven by peer's focus state)
          'peer-focus-visible:ring-2 peer-focus-visible:ring-gold/40 peer-focus-visible:ring-offset-1',
          className
        )}
      >
        {icon && (
          <span
            className={cn(
              'shrink-0 mt-0.5 transition-colors',
              checked ? 'text-gold-dark' : 'text-ink-500'
            )}
          >
            {icon}
          </span>
        )}
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-semibold text-navy text-[0.875rem] leading-tight">
            {label}
          </span>
          {description && (
            <span className="text-[0.75rem] text-ink-500 leading-snug">
              {description}
            </span>
          )}
        </span>
        {/* Check badge — only visible when selected */}
        <span
          className={cn(
            'shrink-0 flex h-5 w-5 items-center justify-center rounded-full',
            'bg-gold text-white',
            'transition-all duration-150 ease-out-soft',
            checked ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          )}
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      </span>
    </label>
  )
})


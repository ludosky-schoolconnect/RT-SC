/**
 * RT-SC · ToggleSwitch — shared on/off switch.
 *
 * Single source of truth for all boolean toggles across the app.
 * Matches the existing pattern used in civisme (RecompenseFormModal,
 * RecompensesSection) — track h-6 w-11, thumb h-5 w-5, translate-x-based
 * positioning so the thumb is always centered inside the track with no
 * left/right math drift.
 *
 * Uses success green for ON, ink-200 for OFF — colors that reliably
 * communicate state. (Avoid gold for state — gold is a brand accent.)
 *
 * Usage:
 *   <ToggleSwitch
 *     checked={isOn}
 *     onChange={setIsOn}
 *     ariaLabel="Enable feature X"
 *   />
 */

import { cn } from '@/lib/cn'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  /** Shown on hover, describes the action if clicked. Optional. */
  title?: string
  disabled?: boolean
  /** Override the ON color if state semantics aren't "success". */
  onColor?: 'success' | 'navy' | 'gold'
  className?: string
}

const ON_COLORS = {
  success: 'bg-success',
  navy: 'bg-navy',
  gold: 'bg-gold',
} as const

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  title,
  disabled,
  onColor = 'success',
  className,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-1',
        checked ? ON_COLORS[onColor] : 'bg-ink-200',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  )
}

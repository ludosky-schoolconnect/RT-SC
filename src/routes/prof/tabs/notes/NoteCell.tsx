/**
 * RT-SC · Single editable note cell with status indicator.
 *
 * - Numeric input, 0–20, decimals allowed
 * - Empty = null (élève absent / not graded)
 * - Visual status overlay (saving spinner / saved checkmark / error)
 * - Disabled when row is locked (estCloture)
 *
 * Validation: warn (don't block) on values outside [0, 20] or with > 2
 * decimal places. Visual hint via red border + tooltip.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { CellStatus } from '@/hooks/useDebouncedSave'

interface NoteCellProps {
  value: number | null
  onChange: (newValue: number | null) => void
  onCommit?: () => void
  status?: CellStatus
  disabled?: boolean
  ariaLabel?: string
}

function isValid(v: number | null): boolean {
  if (v === null) return true
  if (isNaN(v)) return false
  if (v < 0 || v > 20) return false
  return true
}

export function NoteCell({
  value,
  onChange,
  onCommit,
  status = 'idle',
  disabled = false,
  ariaLabel,
}: NoteCellProps) {
  // Local string state so the user can type freely (e.g. "1." while typing 1.5)
  const [draft, setDraft] = useState<string>(value === null ? '' : String(value))
  const lastExternalRef = useRef<number | null>(value)

  // Sync from external when value changes for non-typing reasons
  useEffect(() => {
    if (value !== lastExternalRef.current) {
      setDraft(value === null ? '' : String(value))
      lastExternalRef.current = value
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (raw === '') {
      lastExternalRef.current = null
      onChange(null)
      return
    }
    // Accept partial decimals like "1." mid-typing — don't propagate yet
    if (/^\d+\.$/.test(raw)) return
    const num = parseFloat(raw.replace(',', '.'))
    if (!isNaN(num)) {
      lastExternalRef.current = num
      onChange(num)
    }
  }

  function handleBlur() {
    // Normalize the displayed string to match the committed value
    if (lastExternalRef.current === null) {
      setDraft('')
    } else {
      setDraft(String(lastExternalRef.current))
    }
    onCommit?.()
  }

  const numericValue =
    draft === '' || /^\d+\.$/.test(draft)
      ? null
      : parseFloat(draft.replace(',', '.'))
  const valid = isValid(numericValue)

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={!valid || undefined}
        className={cn(
          'w-full text-center px-2 py-1.5 rounded-md border-[1.5px] tabular-nums font-mono text-[0.875rem]',
          'focus:outline-none focus:border-navy focus:ring-2 focus:ring-gold/40',
          'transition-colors duration-150',
          disabled && 'bg-ink-50 text-ink-400 cursor-not-allowed',
          !disabled && !valid && 'border-danger bg-danger-bg/50 text-danger',
          !disabled && valid && status === 'error' && 'border-danger bg-danger-bg/30',
          !disabled && valid && status === 'saved' && 'border-success bg-success-bg/40',
          !disabled && valid && (status === 'idle' || status === 'pending' || status === 'saving') && 'border-ink-100 bg-white'
        )}
      />

      {/* Status indicator (top-right corner of cell) */}
      {!disabled && status !== 'idle' && (
        <span
          className="pointer-events-none absolute top-0.5 right-0.5"
          aria-hidden
        >
          {status === 'saving' && (
            <Loader2 className="h-3 w-3 text-ink-400 animate-spin" />
          )}
          {status === 'saved' && (
            <Check className="h-3 w-3 text-success" />
          )}
          {status === 'error' && (
            <AlertCircle className="h-3 w-3 text-danger" />
          )}
          {status === 'pending' && (
            <span className="block h-1.5 w-1.5 mt-0.5 mr-0.5 rounded-full bg-warning" />
          )}
        </span>
      )}
    </div>
  )
}

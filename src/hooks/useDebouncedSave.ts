/**
 * RT-SC · Per-cell debounced save with status.
 *
 * Inline editing pattern: user types in a cell, we debounce ~500ms,
 * then call the save fn. Status flips through:
 *   'idle' → 'pending' (typing) → 'saving' → 'saved' / 'error'
 * After 'saved', flips back to 'idle' after a brief moment.
 *
 * Each cell key tracks its own status independently so the UI can
 * show per-cell indicators (a tiny spinner / check / cross).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type CellStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface UseDebouncedSaveOptions<T> {
  /** Called after the debounce window closes, with the latest value. */
  onSave: (key: string, value: T) => Promise<void>
  /** Debounce delay in ms. Default 500. */
  delay?: number
  /** How long to show 'saved' before reverting to 'idle'. Default 1500. */
  savedDuration?: number
}

export function useDebouncedSave<T>({
  onSave,
  delay = 500,
  savedDuration = 1500,
}: UseDebouncedSaveOptions<T>) {
  const [statuses, setStatuses] = useState<Record<string, CellStatus>>({})
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const savedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      savedTimersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      savedTimersRef.current.clear()
    }
  }, [])

  function setStatus(key: string, status: CellStatus) {
    setStatuses((prev) => ({ ...prev, [key]: status }))
  }

  /** Call this on every keystroke. Schedules a save when typing pauses. */
  const schedule = useCallback(
    (key: string, value: T) => {
      // Clear any "saved" timer; user resumed typing
      const savedTimer = savedTimersRef.current.get(key)
      if (savedTimer) {
        clearTimeout(savedTimer)
        savedTimersRef.current.delete(key)
      }

      // Cancel previous pending save
      const existing = timersRef.current.get(key)
      if (existing) clearTimeout(existing)

      setStatus(key, 'pending')

      const t = setTimeout(async () => {
        timersRef.current.delete(key)
        setStatus(key, 'saving')
        try {
          await onSave(key, value)
          setStatus(key, 'saved')
          const savedT = setTimeout(() => {
            setStatus(key, 'idle')
            savedTimersRef.current.delete(key)
          }, savedDuration)
          savedTimersRef.current.set(key, savedT)
        } catch {
          setStatus(key, 'error')
        }
      }, delay)

      timersRef.current.set(key, t)
    },
    [onSave, delay, savedDuration]
  )

  /** Force-flush any pending save for this key (e.g. on blur of last cell). */
  const flush = useCallback(
    async (key: string, value: T) => {
      const existing = timersRef.current.get(key)
      if (existing) {
        clearTimeout(existing)
        timersRef.current.delete(key)
      }
      setStatus(key, 'saving')
      try {
        await onSave(key, value)
        setStatus(key, 'saved')
        const savedT = setTimeout(() => {
          setStatus(key, 'idle')
          savedTimersRef.current.delete(key)
        }, savedDuration)
        savedTimersRef.current.set(key, savedT)
      } catch {
        setStatus(key, 'error')
      }
    },
    [onSave, savedDuration]
  )

  return { statuses, schedule, flush }
}

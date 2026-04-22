/**
 * RT-SC · useOverflowTabs — responsive tab bar overflow measurement.
 *
 * Given a container ref and a list of tab items, returns how many
 * items fit in the container's current width plus which ones overflow
 * into the "Plus" bucket.
 *
 * The measurement works by rendering all tabs in a HIDDEN measurement
 * layer (offscreen), reading their individual widths, then computing
 * how many fit INCLUDING space for the Plus button itself if any
 * need to overflow.
 *
 * Why not CSS-only? We tried. `flex-wrap` doesn't give us "N fit, rest
 * collapse to a menu". `container queries` can't count children. CSS
 * overflow: hidden just clips without telling us what got clipped.
 * ResizeObserver + JS is the robust path.
 *
 * Behavior:
 *   - If ALL tabs fit → visibleCount = tabs.length, overflow = []
 *   - If overflow needed → visibleCount = N, overflow = tabs.slice(N)
 *
 * The Plus button width is reserved from the container's budget
 * whenever at least one tab would overflow. That means if 5 tabs
 * fit but 5+Plus doesn't, we'd pick visibleCount = 4 and put 1 into
 * overflow + show Plus (which might be a wash visually but is correct).
 */

import { useCallback, useEffect, useState } from 'react'

export interface OverflowResult {
  visibleCount: number
  hasOverflow: boolean
}

export function useOverflowTabs<T>(
  tabs: T[],
  containerRef: React.RefObject<HTMLElement | null>,
  measurementRef: React.RefObject<HTMLElement | null>,
  plusButtonRef: React.RefObject<HTMLElement | null>
): OverflowResult {
  const [result, setResult] = useState<OverflowResult>({
    // Start by assuming everything fits — measurement in useEffect
    // will correct immediately. Avoids a flash of "Plus" before
    // measurement runs.
    visibleCount: tabs.length,
    hasOverflow: false,
  })

  const measure = useCallback(() => {
    const container = containerRef.current
    const measurement = measurementRef.current
    if (!container || !measurement) return

    // Total available width = container's content width.
    const available = container.clientWidth
    if (available <= 0) return

    // Each tab's width is the width of the corresponding child in the
    // HIDDEN measurement layer. The measurement layer renders ALL
    // tabs at their natural width, in the same order as the real
    // list, with the same styling. Its children are <button> elements.
    const measured: number[] = []
    for (const child of Array.from(measurement.children) as HTMLElement[]) {
      measured.push(child.offsetWidth)
    }

    if (measured.length === 0) return

    // Reserve space for the Plus button if we end up needing it.
    const plusW = plusButtonRef.current?.offsetWidth ?? 0

    // Pass 1: do all tabs fit without Plus?
    const totalAll = measured.reduce((a, b) => a + b, 0)
    if (totalAll <= available) {
      setResult({ visibleCount: measured.length, hasOverflow: false })
      return
    }

    // Pass 2: find the largest N such that sum(measured[0..N]) + plusW <= available
    let used = 0
    let fit = 0
    const budget = available - plusW
    for (let i = 0; i < measured.length; i++) {
      if (used + measured[i] > budget) break
      used += measured[i]
      fit = i + 1
    }

    // Edge case: nothing fits (super narrow container). Show at least
    // one tab + Plus so the UI isn't empty.
    if (fit === 0) fit = 1

    setResult({
      visibleCount: fit,
      hasOverflow: fit < measured.length,
    })
  }, [containerRef, measurementRef, plusButtonRef])

  useEffect(() => {
    // Initial measurement after mount — wait a tick for fonts to
    // settle; otherwise the first measurement can be narrower than
    // the final one (font swap) and we'd briefly show overflow that
    // goes away.
    const initial = window.setTimeout(measure, 50)

    const container = containerRef.current
    if (!container) return () => window.clearTimeout(initial)

    const ro = new ResizeObserver(() => measure())
    ro.observe(container)

    // Re-measure on font load (the `fonts` API resolves once custom
    // fonts finish loading, which can change label widths).
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => measure()).catch(() => {})
    }

    return () => {
      window.clearTimeout(initial)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, tabs.length])

  return result
}

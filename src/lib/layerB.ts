/**
 * RT-SC · Layer B intelligence — mode-based outlier detection.
 *
 * For a given matière in a given period, we count how many "data points"
 * (interros + devoirs filled) each élève has. The mode of that
 * distribution = the most common count across the class.
 *
 * Élèves whose count is below the mode are flagged as "atypique" — the
 * prof or PP should sanity-check before accepting their bulletin.
 *
 * Decision spec (from the design we agreed on):
 *   - Ties favor the higher count (so if 7 élèves have 4 points and 7 have 3,
 *     the mode is 4, and the 7 with 3 get flagged)
 *   - Élèves marked abandonné are excluded from the count entirely
 *   - Empty/missing notes are counted as 0 data points (so they're flagged)
 *
 * This is informational only — doesn't block bulletin generation. It's a
 * "verify these" hint, not a hard error.
 */

export interface LayerBInput {
  eleveId: string
  /** Total interros + devoirs filled (interros count, devoir1 ? +1, devoir2 ? +1) */
  dataPoints: number
  /** True if marked abandonné (excluded from the mode calculation) */
  abandonne: boolean
}

export interface LayerBResult {
  /** The mode (most common data-point count) for non-abandoned élèves */
  mode: number
  /** Élèves whose dataPoints < mode AND who aren't abandonned */
  outlierEleveIds: string[]
  /** Distribution: count → number of élèves with that count */
  distribution: Record<number, number>
}

/**
 * Compute the mode of a list of integers, with ties broken by favoring
 * the HIGHER value. Returns 0 if the list is empty.
 */
export function modeWithHigherTieBreak(values: number[]): number {
  if (values.length === 0) return 0
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)

  let bestCount = -1
  let bestValue = 0
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count
      bestValue = value
    } else if (count === bestCount && value > bestValue) {
      // Tie-break: higher value wins
      bestValue = value
    }
  }
  return bestValue
}

export function detectOutliers(inputs: LayerBInput[]): LayerBResult {
  const active = inputs.filter((i) => !i.abandonne)
  const dataPointCounts = active.map((i) => i.dataPoints)
  const mode = modeWithHigherTieBreak(dataPointCounts)

  const distribution: Record<number, number> = {}
  for (const c of dataPointCounts) {
    distribution[c] = (distribution[c] ?? 0) + 1
  }

  const outlierEleveIds = active
    .filter((i) => i.dataPoints < mode)
    .map((i) => i.eleveId)

  return { mode, outlierEleveIds, distribution }
}

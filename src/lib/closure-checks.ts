/**
 * RT-SC · Closure checks (pure functions, no React/Firebase).
 *
 * Implements the two intelligence layers used before a prof clicks
 * "Calculer & Clôturer" on a matière:
 *
 *   Layer A — completeness check
 *     A student "has notes" if at least one of {interros, devoir1, devoir2}
 *     is non-null. Students with absolutely no notes are missing.
 *
 *   Layer B — trend / outlier check (mode-based)
 *     Computes the most common count of interros and the most common count
 *     of devoirs across the class. Flags any student whose count is strictly
 *     less than the mode. Reports % majority vs % flagged for the prof.
 *
 * Same architecture is reused for the PP closure flow with different inputs.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface StudentNoteSnapshot {
  eleveId: string
  nom: string
  /** Raw note doc fields. All optional — student may have no doc at all */
  interros?: number[]
  devoir1?: number | null
  devoir2?: number | null
  /** Per-matière abandon flag from the note doc */
  abandonne?: boolean
}

export interface MissingStudent {
  eleveId: string
  nom: string
}

export interface TrendOutlier {
  eleveId: string
  nom: string
  /** Their actual interros count */
  nbInterros: number
  /** Their actual devoir count (0–2) */
  nbDevoirs: number
  /** Which dimension(s) they are outliers on */
  flags: ('interros' | 'devoirs')[]
}

export interface TrendReport {
  totalConsidered: number
  modeInterros: number
  pctMajorityInterros: number
  modeDevoirs: number
  pctMajorityDevoirs: number
  outliers: TrendOutlier[]
}

// ─────────────────────────────────────────────────────────────
// Layer A — completeness check
// ─────────────────────────────────────────────────────────────

/**
 * Returns the list of students who have NO notes at all
 * (and have not been marked as abandonné for this matière).
 *
 * A student counts as "has notes" if:
 *   - interros has length > 0, OR
 *   - devoir1 is a number, OR
 *   - devoir2 is a number
 *
 * Marked-abandoned students are NEVER reported as missing — by definition
 * they're handled.
 */
export function findMissingStudents(
  students: StudentNoteSnapshot[]
): MissingStudent[] {
  const missing: MissingStudent[] = []
  for (const s of students) {
    if (s.abandonne) continue
    const hasInterros = (s.interros?.length ?? 0) > 0
    const hasDev1 = typeof s.devoir1 === 'number'
    const hasDev2 = typeof s.devoir2 === 'number'
    if (!hasInterros && !hasDev1 && !hasDev2) {
      missing.push({ eleveId: s.eleveId, nom: s.nom })
    }
  }
  return missing
}

// ─────────────────────────────────────────────────────────────
// Layer B — trend / outlier check (mode-based, Option 2)
// ─────────────────────────────────────────────────────────────

/**
 * Compute the mode of a set of numbers and the % of the population
 * holding that mode. On ties, the highest value wins (rationale:
 * if equal numbers of students have 2 vs 3 interros, it's safer
 * to assume the prof intended 3 and the 2-students are missing one).
 */
function computeMode(values: number[]): { mode: number; pct: number } {
  if (values.length === 0) return { mode: 0, pct: 0 }
  const counts = new Map<number, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let mode = 0
  let bestCount = -1
  for (const [val, c] of counts.entries()) {
    if (c > bestCount || (c === bestCount && val > mode)) {
      mode = val
      bestCount = c
    }
  }
  const pct = Math.round((bestCount / values.length) * 100)
  return { mode, pct }
}

/**
 * Run the trend check.
 * Only considers students with at least one note (so missing students from
 * Layer A don't contaminate the stats). Marked-abandoned students are
 * always excluded.
 */
export function analyzeTrend(students: StudentNoteSnapshot[]): TrendReport {
  const considered = students.filter((s) => {
    if (s.abandonne) return false
    const hasInterros = (s.interros?.length ?? 0) > 0
    const hasDev1 = typeof s.devoir1 === 'number'
    const hasDev2 = typeof s.devoir2 === 'number'
    return hasInterros || hasDev1 || hasDev2
  })

  const interrosCounts = considered.map((s) => s.interros?.length ?? 0)
  const devoirsCounts = considered.map((s) => {
    let n = 0
    if (typeof s.devoir1 === 'number') n++
    if (typeof s.devoir2 === 'number') n++
    return n
  })

  const { mode: modeInterros, pct: pctMajorityInterros } = computeMode(interrosCounts)
  const { mode: modeDevoirs, pct: pctMajorityDevoirs } = computeMode(devoirsCounts)

  const outliers: TrendOutlier[] = []
  for (const s of considered) {
    const nbI = s.interros?.length ?? 0
    const nbD =
      (typeof s.devoir1 === 'number' ? 1 : 0) +
      (typeof s.devoir2 === 'number' ? 1 : 0)

    const flags: TrendOutlier['flags'] = []
    if (nbI < modeInterros) flags.push('interros')
    if (nbD < modeDevoirs) flags.push('devoirs')

    if (flags.length > 0) {
      outliers.push({
        eleveId: s.eleveId,
        nom: s.nom,
        nbInterros: nbI,
        nbDevoirs: nbD,
        flags,
      })
    }
  }

  return {
    totalConsidered: considered.length,
    modeInterros,
    pctMajorityInterros,
    modeDevoirs,
    pctMajorityDevoirs,
    outliers,
  }
}

// ─────────────────────────────────────────────────────────────
// PP closure pre-flight (cross-matière)
// Used by the Professeur Principal before computing moyenne générale.
// ─────────────────────────────────────────────────────────────

export interface SubjectClosureStatus {
  matiere: string
  estCloture: boolean
}

export interface PPPreflightReport {
  /** Matières not yet marked estCloture for this period */
  unclosedSubjects: string[]
  /** True when no coefficients map exists for the (niveau, série) */
  missingCoefficients: boolean
  /** Matières present in coefficients but not in the matières globales catalog */
  unknownMatieresInCoefficients: string[]
  /** Matières present in matières globales but with no coefficient defined */
  matieresWithoutCoefficient: string[]
  /** Convenience: PP can proceed only when all collections below are empty / false */
  canProceed: boolean
}

export function ppPreflight(args: {
  subjectsClosure: SubjectClosureStatus[]
  matieresGlobales: string[]
  /** Coefficient grid for this (niveau, série) — empty object means "missing" */
  coefficients: Record<string, number> | null
}): PPPreflightReport {
  const unclosedSubjects = args.subjectsClosure
    .filter((s) => !s.estCloture)
    .map((s) => s.matiere)

  const missingCoefficients =
    args.coefficients === null || Object.keys(args.coefficients).length === 0

  const coeffKeys = args.coefficients ? Object.keys(args.coefficients) : []

  const unknownMatieresInCoefficients = coeffKeys.filter(
    (m) => m !== 'Conduite' && !args.matieresGlobales.includes(m)
  )

  const matieresWithoutCoefficient = args.matieresGlobales.filter(
    (m) => !coeffKeys.includes(m)
  )

  const canProceed =
    unclosedSubjects.length === 0 &&
    !missingCoefficients &&
    matieresWithoutCoefficient.length === 0

  return {
    unclosedSubjects,
    missingCoefficients,
    unknownMatieresInCoefficients,
    matieresWithoutCoefficient,
    canProceed,
  }
}

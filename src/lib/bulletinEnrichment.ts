/**
 * RT-SC · Bulletin v2 enrichment.
 *
 * Takes the base `BulletinPeriodView` (computed by `assembleBulletinPeriodView`)
 * and augments it with the extra fields needed for the Béninois-style
 * bulletin layout:
 *
 *   - effectif              : total students in the class
 *   - moyenneGeneraleEnLettres : French long-form of the moyenne
 *   - classStats            : highest / lowest / average moyenne
 *   - disciplineStats       : retards, absences, consignes, avertissements, exclusions
 *   - matieres[].appreciation  : auto-computed threshold label per subject
 *   - matieres[].rang          : rank string per subject within the class
 *
 * Why this is a separate module (not part of assembleBulletinPeriodView):
 *   The base assembler is PURE and operates on one student's already-fetched
 *   data. Enrichment needs class-wide data (all classmates' bulletins + notes,
 *   plus cross-cutting discipline collections). Forcing that into the base
 *   input would double or triple the data bundled into every bulletin view.
 *   Keeping enrichment separate lets callers fetch the extra data once per
 *   (class × period) and apply it to every student's bulletin in that class.
 *
 * Every enriched field is OPTIONAL on the output type so:
 *   - Callers that don't need enrichment (e.g. batch PDF generator, legacy
 *     consumers) keep working without change.
 *   - The PDF renderer in session 3 can check `view.effectif !== undefined`
 *     to know whether to render the new block.
 */

import { computeRanking, type RankInput } from './bulletin'
import { moyenneEnLettres as moyenneToFrench } from './moyenneEnLettres'
import type { Bulletin, Genre, Note, Periode, PeriodeRange } from '@/types/models'
import type { BulletinPeriodView } from './bulletinView'

// ─── Types ──────────────────────────────────────────────────

/**
 * Appreciation label threshold map (French school standard).
 * Same scale used everywhere in the app, kept in one place so it
 * can be adjusted later if Béninois conventions differ.
 */
export type Appreciation =
  | 'Excellent'
  | 'Très bien'
  | 'Bien'
  | 'Assez bien'
  | 'Passable'
  | 'Insuffisant'

export function appreciationFor(moyenne: number): Appreciation {
  if (moyenne >= 18) return 'Excellent'
  if (moyenne >= 16) return 'Très bien'
  if (moyenne >= 14) return 'Bien'
  if (moyenne >= 12) return 'Assez bien'
  if (moyenne >= 10) return 'Passable'
  return 'Insuffisant'
}

export interface ClassStats {
  /** Highest moyenne generale in the class for this period */
  moyenneMax: number
  /** Lowest moyenne generale */
  moyenneMin: number
  /** Class average (arithmetic mean of all students' moyennes) */
  moyenneClasse: number
  /** Number of students whose moyenne contributed (excludes missing bulletins) */
  effectifComptabilise: number
}

export interface DisciplineStats {
  /** Count of retards (late arrivals marked in prof appels) within the period */
  retards: number
  /**
   * Total absences — unions appel-marked (from /presences) with declared
   * (from /eleves/{id}/absences). Deduped by date + matiere to avoid
   * double-counting when both sources record the same slot.
   */
  absences: number
  /** Sum of colle hours logged this period */
  heuresColle: number
  /** Number of discipline incidents from civismeHistory within the period */
  avertissements: number
  /** Number of days excluded (from civismeHistory entries tagged as exclusion) */
  exclusions: number
}

export interface EnrichedBulletinPeriodView extends BulletinPeriodView {
  /** Total students in the class */
  effectif?: number
  /** Class-wide moyenne stats for this period */
  classStats?: ClassStats
  /** Aggregated discipline counts for this student × this period */
  disciplineStats?: DisciplineStats
  /** French long-form of the overall moyenne (e.g. "treize virgule vingt-cinq") */
  moyenneGeneraleEnLettres?: string
}

// ─── Input for the enricher ─────────────────────────────────

/**
 * A single classmate's data needed to compute class-wide stats.
 * The hook fetches these once per (class × period) and feeds into the
 * enricher.
 */
export interface ClassmateBulletinData {
  eleveId: string
  genre: Genre
  bulletin: Bulletin
  notes: Note[]
}

export interface PeriodeDatesLookup {
  /** For each periode key, the ISO date range. Optional entries. */
  [periodeKey: string]: PeriodeRange | undefined
}

export interface DisciplineSourceData {
  /**
   * All absence docs for this student. Each has a `date` Timestamp.
   * Period filter happens inside the enricher.
   */
  absences: Array<{ date: { toDate?: () => Date } | Date | undefined; heureDebut?: string }>
  /**
   * All presence docs for the class during the period, in shape
   * `{ dateISO, matiereSlug, absents: {eleveId: ...}, retards: {eleveId: ...} }`.
   * The enricher scans for this student's entries.
   */
  presences: Array<{
    dateISO: string
    matiereSlug: string
    absentsIds: string[]
    retardsIds: string[]
  }>
  /** All colle docs for this student, already filtered to this period. */
  colles: Array<{ heures: number }>
  /**
   * CivismeHistory entries for this student within the period.
   * We inspect `raison` to determine if it's an avertissement or exclusion.
   */
  civismeHistory: Array<{
    raison?: string
    motif?: string
    date?: { toDate?: () => Date } | Date
  }>
}

export interface EnrichmentInput {
  /** The base view, produced by assembleBulletinPeriodView */
  baseView: BulletinPeriodView
  /** The current student's ID (to find themselves in class-wide data) */
  eleveId: string
  /** The current period (key matching bulletinConfig.periodeDates) */
  periode: Periode
  /** All classmates' bulletin + notes for this period (includes current student) */
  classmates: ClassmateBulletinData[]
  /** Total students in the class (may exceed classmates.length if some have no bulletin yet) */
  effectif: number
  /** Periode date ranges from bulletin config (used to scope discipline queries) */
  periodeDates?: PeriodeDatesLookup
  /** Source data for discipline stats */
  disciplineSource?: DisciplineSourceData
}

// ─── Main enricher ──────────────────────────────────────────

export function enrichBulletinPeriodView(
  input: EnrichmentInput
): EnrichedBulletinPeriodView {
  const { baseView, eleveId, classmates, effectif, periodeDates, periode, disciplineSource } = input

  // 1. Class stats
  const classStats = computeClassStats(classmates)

  // 2. Per-matière rangs for the current student, computed from all classmates
  const matiereRangs = computeMatiereRangs(classmates)

  // 3. Discipline stats (scoped to this period)
  const periodRange = periodeDates?.[periode]
  const disciplineStats = disciplineSource
    ? computeDisciplineStats(eleveId, disciplineSource, periodRange)
    : undefined

  // 4. Moyenne en lettres
  const moyenneGeneraleEnLettres = moyenneToFrench(baseView.moyenneGenerale)

  // 5. Enrich the matières rows with appreciation + rang
  const enrichedMatieres = baseView.matieres.map((row) => {
    if (row.abandonne || row.moyenneMatiere === null || row.moyenneMatiere === undefined) {
      // Abandonné or no note → no appreciation, no rang
      return row
    }
    const appreciation = appreciationFor(row.moyenneMatiere)
    const rang = matiereRangs.get(row.matiere)?.get(eleveId)
    return { ...row, appreciation, rang }
  })

  return {
    ...baseView,
    matieres: enrichedMatieres,
    effectif,
    classStats,
    disciplineStats,
    moyenneGeneraleEnLettres,
  }
}

// ─── Sub-computations ───────────────────────────────────────

function computeClassStats(classmates: ClassmateBulletinData[]): ClassStats {
  const moyennes = classmates
    .map((c) => c.bulletin.moyenneGenerale)
    .filter((m): m is number => typeof m === 'number' && Number.isFinite(m))

  if (moyennes.length === 0) {
    return {
      moyenneMax: 0,
      moyenneMin: 0,
      moyenneClasse: 0,
      effectifComptabilise: 0,
    }
  }

  return {
    moyenneMax: Math.max(...moyennes),
    moyenneMin: Math.min(...moyennes),
    moyenneClasse: moyennes.reduce((a, b) => a + b, 0) / moyennes.length,
    effectifComptabilise: moyennes.length,
  }
}

/**
 * For each matière, returns a map of eleveId → rang string ("1er/34",
 * "3ème ex/34", etc.). Uses the same `computeRanking` helper as the
 * overall moyenne rank so the format is identical.
 *
 * Students with no moyenne for a given matière (abandonné or missing
 * note) are EXCLUDED from that matière's ranking. The total shown in
 * the rang string reflects only ranked students.
 */
function computeMatiereRangs(
  classmates: ClassmateBulletinData[]
): Map<string, Map<string, string>> {
  const byMatiere: Map<string, RankInput[]> = new Map()

  for (const mate of classmates) {
    for (const note of mate.notes) {
      if (note.abandonne === true) continue
      const mm = note.moyenneMatiere
      if (mm === null || mm === undefined || !Number.isFinite(mm)) continue
      if (!byMatiere.has(note.matiere)) byMatiere.set(note.matiere, [])
      byMatiere.get(note.matiere)!.push({
        id: mate.eleveId,
        moyenneGenerale: mm, // reusing the field — engine just sorts by this number
        genre: mate.genre,
      })
    }
  }

  const result = new Map<string, Map<string, string>>()
  for (const [matiere, inputs] of byMatiere.entries()) {
    const ranks = computeRanking(inputs)
    const eleveToRang = new Map<string, string>()
    for (const r of ranks) eleveToRang.set(r.id, r.rang)
    result.set(matiere, eleveToRang)
  }
  return result
}

function computeDisciplineStats(
  eleveId: string,
  source: DisciplineSourceData,
  periodRange: PeriodeRange | undefined
): DisciplineStats {
  const { startMs, endMs } = periodBounds(periodRange)

  // 1. Declared absences (student's own /absences subcollection) within period
  const declaredAbsenceKeys = new Set<string>()
  for (const a of source.absences) {
    const ms = toMillis(a.date)
    if (ms === null || ms < startMs || ms > endMs) continue
    // Dedupe by day — student-level absences can cover a whole day without a matiere
    const dayKey = dayKeyFromMs(ms)
    declaredAbsenceKeys.add(dayKey)
  }

  // 2. Presence-derived absences (prof-marked during appel). Already
  //    pre-filtered by the caller to the period range.
  const appelAbsenceKeys = new Set<string>()
  let retardsCount = 0
  for (const p of source.presences) {
    if (p.absentsIds.includes(eleveId)) {
      // Key by date+matiere to distinguish morning math absence from afternoon French
      appelAbsenceKeys.add(`${p.dateISO}__${p.matiereSlug}`)
    }
    if (p.retardsIds.includes(eleveId)) retardsCount += 1
  }

  // Absences count: appel-marked matiere slots PLUS declared days that
  // weren't also appel-marked. Simple union approximation — slight risk
  // of under-counting if a declaration covers only part of a day's slots.
  const declaredDaysNotInAppel = Array.from(declaredAbsenceKeys).filter((dayKey) => {
    return !Array.from(appelAbsenceKeys).some((k) => k.startsWith(dayKey))
  })
  const absencesCount = appelAbsenceKeys.size + declaredDaysNotInAppel.length

  // 3. Colle hours (sum)
  const heuresColle = source.colles.reduce((acc, c) => acc + (c.heures || 0), 0)

  // 4. Civisme history — count by raison
  let avertissements = 0
  let exclusions = 0
  for (const h of source.civismeHistory) {
    const ms = h.date ? toMillis(h.date) : null
    if (ms !== null && (ms < startMs || ms > endMs)) continue
    const r = (h.raison ?? '').toLowerCase()
    if (r.includes('avert')) avertissements += 1
    if (r.includes('exclu')) exclusions += 1
  }

  return {
    retards: retardsCount,
    absences: absencesCount,
    heuresColle,
    avertissements,
    exclusions,
  }
}

// ─── Small utils ────────────────────────────────────────────

function periodBounds(range: PeriodeRange | undefined): {
  startMs: number
  endMs: number
} {
  if (!range) {
    return { startMs: -Infinity, endMs: Infinity }
  }
  const startMs = new Date(`${range.debut}T00:00:00`).getTime()
  const endMs = new Date(`${range.fin}T23:59:59`).getTime()
  return { startMs, endMs }
}

function toMillis(value: unknown): number | null {
  if (!value) return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object') {
    const v = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number }
    if (typeof v.toMillis === 'function') return v.toMillis()
    if (typeof v.toDate === 'function') return v.toDate().getTime()
    if (typeof v.seconds === 'number') return v.seconds * 1000
  }
  return null
}

function dayKeyFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

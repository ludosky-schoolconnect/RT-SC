/**
 * RT-SC · Séances — pure helpers.
 *
 * Time parsing, overlap detection, sort, current-day logic. All functions
 * are pure; no Firestore or React here.
 *
 * Benin is on WAT (UTC+1) with no DST. We use the browser's local "day of
 * week" — correct because the app runs on devices in Benin. If we ever need
 * server-side logic (scheduled notifications), we switch to a fixed tz lib.
 */

import type { Jour, Seance } from '@/types/models'
import { JOURS_ORDRE } from '@/types/models'

/** "08:00" → 480 (minutes since midnight). Returns NaN on invalid input. */
export function parseHHMM(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return Number.NaN
  const h = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (h > 23 || mm > 59) return Number.NaN
  return h * 60 + mm
}

/** 480 → "08:00". */
export function formatHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Duration of a séance in minutes (fin - debut). */
export function seanceDurationMinutes(s: Pick<Seance, 'heureDebut' | 'heureFin'>): number {
  const a = parseHHMM(s.heureDebut)
  const b = parseHHMM(s.heureFin)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, b - a)
}

/** Formats duration as "1h30" / "45min". */
export function formatDuree(mins: number): string {
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

/**
 * Returns true if two séances overlap in time.
 * Same-day overlap: [a.debut, a.fin) intersects [b.debut, b.fin).
 * Different days → never overlap.
 */
export function seancesOverlap(a: Seance, b: Seance): boolean {
  if (a.jour !== b.jour) return false
  const aStart = parseHHMM(a.heureDebut)
  const aEnd = parseHHMM(a.heureFin)
  const bStart = parseHHMM(b.heureDebut)
  const bEnd = parseHHMM(b.heureFin)
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false
  // Standard interval overlap; note treating as [start, end) (half-open).
  return aStart < bEnd && bStart < aEnd
}

/**
 * Find conflicts in a set of séances against a candidate (incoming new/edited).
 * Returns the list of conflicts — empty if none.
 *
 *   - Prof conflict: same profId, same jour, overlapping times.
 *   - Class conflict: same classeId, same jour, overlapping times.
 *
 * Use `excludeId` when editing to ignore the séance being edited against
 * itself.
 */
export interface SeanceConflict {
  kind: 'prof' | 'classe'
  other: Seance
}

export function findConflicts(
  candidate: Pick<Seance, 'classeId' | 'profId' | 'jour' | 'heureDebut' | 'heureFin'>,
  all: Seance[],
  excludeId?: string
): SeanceConflict[] {
  const conflicts: SeanceConflict[] = []
  for (const s of all) {
    if (excludeId && s.id === excludeId) continue
    if (s.jour !== candidate.jour) continue
    const aStart = parseHHMM(candidate.heureDebut)
    const aEnd = parseHHMM(candidate.heureFin)
    const bStart = parseHHMM(s.heureDebut)
    const bEnd = parseHHMM(s.heureFin)
    if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) continue
    if (!(aStart < bEnd && bStart < aEnd)) continue
    if (s.profId === candidate.profId) conflicts.push({ kind: 'prof', other: s })
    if (s.classeId === candidate.classeId) conflicts.push({ kind: 'classe', other: s })
  }
  return conflicts
}

/** Chronological sort of séances by (jour index, heureDebut). */
export function sortSeances(list: Seance[]): Seance[] {
  const idx: Record<Jour, number> = {
    Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5,
  }
  return [...list].sort((a, b) => {
    const di = idx[a.jour] - idx[b.jour]
    if (di !== 0) return di
    return parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut)
  })
}

/** Group séances by jour, keeping the fixed JOURS_ORDRE order. */
export function groupByJour(list: Seance[]): Record<Jour, Seance[]> {
  const out: Record<Jour, Seance[]> = {
    Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [],
  }
  for (const s of list) {
    if (out[s.jour]) out[s.jour].push(s)
  }
  for (const j of JOURS_ORDRE) {
    out[j].sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
  }
  return out
}

/**
 * Current jour in Benin local time.
 * JS getDay(): Sunday=0, Monday=1 … Saturday=6.
 * We map to our Jour union; Sunday returns null (pas d'école).
 */
export function currentJour(now: Date = new Date()): Jour | null {
  const map: Record<number, Jour | null> = {
    0: null, // Dimanche
    1: 'Lundi',
    2: 'Mardi',
    3: 'Mercredi',
    4: 'Jeudi',
    5: 'Vendredi',
    6: 'Samedi',
  }
  return map[now.getDay()] ?? null
}

/** Current minutes-since-midnight in local time. */
export function currentMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

/** Is this séance currently running? (today's jour + now ∈ [debut, fin)) */
export function isSeanceNow(s: Seance, now: Date = new Date()): boolean {
  if (currentJour(now) !== s.jour) return false
  const t = currentMinutes(now)
  const a = parseHHMM(s.heureDebut)
  const b = parseHHMM(s.heureFin)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  return t >= a && t < b
}

/**
 * Next séance in chronological order starting from `now`.
 * - Looks at today's remaining séances first;
 * - Then subsequent jours in JOURS_ORDRE;
 * - Wraps to next week if all pass.
 * Returns null for empty lists.
 */
export function nextSeance(list: Seance[], now: Date = new Date()): Seance | null {
  if (list.length === 0) return null
  const today = currentJour(now)
  const nowMin = currentMinutes(now)

  // Upcoming today (after now)
  if (today) {
    const todays = list
      .filter((s) => s.jour === today && parseHHMM(s.heureDebut) > nowMin)
      .sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
    if (todays.length > 0) return todays[0]
  }

  // Subsequent jours (same week, then wrap)
  const startIdx = today ? JOURS_ORDRE.indexOf(today) : -1
  for (let off = 1; off <= 7; off++) {
    const jour = JOURS_ORDRE[(startIdx + off) % JOURS_ORDRE.length]
    const forDay = list
      .filter((s) => s.jour === jour)
      .sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
    if (forDay.length > 0) return forDay[0]
  }
  return null
}

/**
 * RT-SC · Exam countdown utilities.
 *
 * Ports the vanilla logic for:
 *   - Detecting if a class is an exam class (3ème or Terminale only)
 *   - Filtering countdowns by target audience (tous / 3eme / terminale)
 *   - Computing days until exam date
 *   - Mapping days → urgency color (red ≤7 · amber ≤30 · green beyond)
 */

import type { ExamCible, ExamCountdown } from '@/types/models'
import { serverNow } from '@/lib/serverTime'

/**
 * True if the given class name or niveau string represents one of the
 * national-exam levels (3ème, Terminale). Case-insensitive, tolerant
 * to variations ('3eme', '3ème', 'Tle', 'Terminale D', etc.).
 */
export function isExamClass(nomOuNiveau: string | undefined | null): boolean {
  if (!nomOuNiveau) return false
  const s = nomOuNiveau.toLowerCase()
  return (
    s.includes('3ème') ||
    s.includes('3eme') ||
    s.includes('terminale') ||
    /\btle\b/.test(s)
  )
}

/**
 * Narrow the input to which of the two national-exam levels it belongs
 * to, if any. Returns null for non-exam classes.
 */
export function getExamLevel(
  nomOuNiveau: string | undefined | null
): '3eme' | 'terminale' | null {
  if (!nomOuNiveau) return null
  const s = nomOuNiveau.toLowerCase()
  if (s.includes('3ème') || s.includes('3eme')) return '3eme'
  if (s.includes('terminale') || /\btle\b/.test(s)) return 'terminale'
  return null
}

/**
 * Does this countdown apply to the given student's class/level?
 * 'tous' → yes (applies to both 3eme and Terminale).
 * '3eme' → only if the student is in 3ème.
 * 'terminale' → only if the student is in Terminale.
 */
export function countdownAppliesTo(
  cible: ExamCible,
  studentLevel: '3eme' | 'terminale' | null
): boolean {
  if (!studentLevel) return false
  if (cible === 'tous') return true
  return cible === studentLevel
}

/**
 * Does this countdown apply to ANY of the classes a prof teaches?
 * Returns true if at least one class is exam-eligible and matches the
 * countdown target.
 */
export function countdownAppliesToAnyClass(
  cible: ExamCible,
  classLevels: string[]
): boolean {
  const examLevels = classLevels
    .map(getExamLevel)
    .filter((l): l is '3eme' | 'terminale' => l !== null)
  if (examLevels.length === 0) return false
  if (cible === 'tous') return true
  return examLevels.includes(cible)
}

/**
 * Integer days from today to the target date. Uses local midnight so
 * the count rolls over at midnight, not based on current time of day.
 * Returns negative numbers for past dates.
 */
export function daysUntil(dateISO: string): number {
  const now = serverNow()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateISO + 'T00:00:00')
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Filter + sort a countdown list for a given audience.
 * - Keeps only countdowns whose target matches
 * - Drops past countdowns (days < 0)
 * - Sorts by soonest first
 */
export function upcomingRelevantCountdowns(
  examens: ExamCountdown[],
  studentLevel: '3eme' | 'terminale' | null
): Array<ExamCountdown & { joursRestants: number }> {
  return examens
    .filter((e) => countdownAppliesTo(e.cible, studentLevel))
    .map((e) => ({ ...e, joursRestants: daysUntil(e.date) }))
    .filter((e) => e.joursRestants >= 0)
    .sort((a, b) => a.joursRestants - b.joursRestants)
}

/**
 * Same but for a prof — takes a list of their class niveaux.
 */
export function upcomingRelevantCountdownsForProf(
  examens: ExamCountdown[],
  classLevels: string[]
): Array<ExamCountdown & { joursRestants: number }> {
  return examens
    .filter((e) => countdownAppliesToAnyClass(e.cible, classLevels))
    .map((e) => ({ ...e, joursRestants: daysUntil(e.date) }))
    .filter((e) => e.joursRestants >= 0)
    .sort((a, b) => a.joursRestants - b.joursRestants)
}

/**
 * Human-readable "in X days" / "tomorrow" / "today" label.
 */
export function daysRemainingLabel(j: number): string {
  if (j === 0) return "C'est aujourd'hui !"
  if (j === 1) return 'Demain !'
  return `dans ${j} jours`
}

/**
 * Map days remaining → semantic urgency tier.
 */
export function urgencyTier(j: number): 'critical' | 'warning' | 'calm' {
  if (j <= 7) return 'critical'
  if (j <= 30) return 'warning'
  return 'calm'
}

/**
 * Human-readable display of the target audience.
 */
export function cibleLabel(cible: ExamCible): string {
  if (cible === 'tous') return '3ème & Terminale'
  if (cible === '3eme') return '3ème'
  return 'Terminale'
}

/**
 * RT-SC · Absences — write hook (self-declaration).
 *
 * The élève or parent declares an absence in advance. Saved with
 * statut='en attente' for PP/admin to review later.
 *
 * ANTI-SPAM + INTEGRITY RULES (all client-side; rules only gate identity
 * for self-declarations now that the 06h-18h time window was dropped):
 *
 *   1. Daily quota — 1 self-declaration per calendar day (by `createdAt`,
 *      NOT by the target date). Checking by click-time prevents abuse:
 *      parent can't declare 10 absences for 10 different days by clicking
 *      10 times right now.
 *
 *   2. Weekly quota — 3 self-declarations max per Monday-Friday week
 *      (by `createdAt`). Rolling; counts reset each Monday.
 *
 *   3. verrouToday — if a prof marked the élève absent TODAY via appel,
 *      self-declaration is blocked. Prevents racing against the official
 *      record. Checked against today's presence doc.
 *
 *   4. Emploi du temps — if the élève has a scheduled class RIGHT NOW,
 *      the form is disabled until class ends. "Right now" means
 *      `seance.jour === current weekday && heureDebut <= now < heureFin`.
 *      Live-updated via a 60s interval. (Separate helper, consumed by
 *      `ModalDeclareAbsence` to disable the submit button, but also
 *      re-checked here at submit time as a belt-and-braces guard.)
 *
 * Only `source !== 'appel_prof'` counts toward quotas — prof-marked
 * absences don't consume the self-declaration budget. This matches legacy.
 */

import { useMutation } from '@tanstack/react-query'
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  absencesCol,
  emploiDuTempsSeancesCol,
  presenceDoc,
} from '@/lib/firestore-keys'
import type { Absence, PresenceDoc, SourceAbsence } from '@/types/models'

export interface DeclareAbsenceInput {
  classeId: string
  classeNom: string
  eleveId: string
  eleveNom: string
  /** Date of the absence — JS Date in local Bénin time. */
  date: Date
  heureDebut: string
  heureFin: string
  raison: string
  source: SourceAbsence
  /** UID of the declarant (élève session UID or parent session UID). */
  declaredByUid: string
}

export function useDeclareAbsence() {
  return useMutation({
    mutationFn: async (input: DeclareAbsenceInput) => {
      const payload: Record<string, unknown> = {
        date: Timestamp.fromDate(input.date),
        heureDebut: input.heureDebut,
        heureFin: input.heureFin,
        raison: input.raison.trim(),
        statut: 'en attente',
        source: input.source,
        eleveNom: input.eleveNom,
        classeNom: input.classeNom,
        declaredByUid: input.declaredByUid,
        createdAt: serverTimestamp(),
      }
      await addDoc(
        collection(db, absencesCol(input.classeId, input.eleveId)),
        payload
      )
    },
  })
}

// ─────────────────────────────────────────────────────────────
// Quota + verrou check
// ─────────────────────────────────────────────────────────────

/**
 * Returns a French error message if the declaration is blocked, or null
 * if allowed. Callers should surface the message inline + disable submit.
 *
 * This is pure given the inputs — no side effects, no network.
 *
 * @param existing  all absences for this élève (from useEleveAbsences)
 * @param _forDate  kept for compatibility; not used for quota math
 *                  (legacy implementations keyed on this; we don't)
 * @param now       current time — defaults to new Date(); overridable
 *                  for tests.
 */
export function checkQuota(
  existing: Absence[],
  _forDate: Date,
  now: Date = new Date()
): string | null {
  // Today's boundaries
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  // This week's Mon-Fri boundaries
  const dayOfWeek = now.getDay()  // Sun=0..Sat=6
  const diffMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + diffMon)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 5)
  weekEnd.setHours(0, 0, 0, 0)  // exclusive upper bound: Saturday 00:00

  let dayCount = 0
  let weekCount = 0

  for (const a of existing) {
    // Only self-declarations count (prof-marked absences don't consume quota)
    if (a.source === 'appel_prof') continue

    // Prefer createdAt (when the action happened); fall back to date.
    // Legacy data may have only `date` set — treat it as the action time.
    let t: Date | null = null
    const created = (a as { createdAt?: unknown }).createdAt as
      | { toDate?: () => Date }
      | undefined
    if (created?.toDate) {
      t = created.toDate()
    } else if (a.date?.toDate) {
      t = a.date.toDate()
    }
    if (!t) continue

    if (t >= todayStart && t < todayEnd) dayCount++
    if (t >= weekStart && t < weekEnd) weekCount++
  }

  if (dayCount >= 1) {
    return "Vous avez déjà déclaré une absence aujourd'hui. Réessayez demain."
  }
  if (weekCount >= 3) {
    return 'Limite hebdomadaire atteinte : 3 déclarations par semaine (lundi-vendredi).'
  }

  return null
}

/**
 * Async check: has a prof marked this élève absent TODAY via appel?
 * Returns true (block) / false (allow).
 *
 * Reads the élève's class presence doc for today's date. If the doc
 * exists and any matière slot's `absents` map contains this eleveId,
 * self-declaration is locked.
 *
 * Cost: one `getDoc` per call. Cheap.
 */
export async function hasVerrouToday(
  classeId: string,
  eleveId: string,
  now: Date = new Date()
): Promise<boolean> {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dateISO = `${y}-${m}-${d}`

  try {
    const snap = await getDoc(doc(db, presenceDoc(classeId, dateISO)))
    if (!snap.exists()) return false
    const data = snap.data() as PresenceDoc
    for (const slot of Object.values(data)) {
      const absents = (slot as { absents?: Record<string, unknown> })?.absents
      if (absents && eleveId in absents) return true
    }
    return false
  } catch (err) {
    // If we can't read (network, rules), fail open — don't block declaration
    // because we couldn't verify. The worst case is one duplicate entry
    // that admin cleans up via merge.
    console.warn('[hasVerrouToday] check skipped:', err)
    return false
  }
}

/**
 * Is a class currently in session for this élève's class?
 *
 * Reads the emploi du temps for the class, checks if any seance is
 * currently ongoing (jour === current weekday AND heureDebut <= now
 * AND heureFin > now).
 *
 * Returns:
 *   - `null` if no class is in session (form available)
 *   - `{ matiere, heureFin }` if a class is ongoing (form locked until
 *     heureFin)
 *
 * Called from a useEffect with a 60s interval so the form unlocks
 * itself without a manual refresh.
 */
export interface OngoingClass {
  matiere: string
  heureFin: string  // "HH:mm"
}

/** Convert "HH:mm" to minutes since midnight. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return -1
  return h * 60 + m
}

/**
 * Map JS getDay() → French weekday name used in seance docs.
 * Matches the schema used by useEmploiDuTemps (legacy-compatible).
 */
const JOUR_BY_GETDAY = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const

export async function checkOngoingClass(
  classeId: string,
  now: Date = new Date()
): Promise<OngoingClass | null> {
  try {
    const snap = await getDocs(collection(db, emploiDuTempsSeancesCol(classeId)))
    const currentJour = JOUR_BY_GETDAY[now.getDay()]
    const nowMin = now.getHours() * 60 + now.getMinutes()

    for (const d of snap.docs) {
      const s = d.data() as {
        jour?: string
        heureDebut?: string
        heureFin?: string
        matiere?: string
      }
      if (!s.jour || !s.heureDebut || !s.heureFin) continue
      if (s.jour.toLowerCase() !== currentJour) continue
      const start = hhmmToMinutes(s.heureDebut)
      const end = hhmmToMinutes(s.heureFin)
      if (start < 0 || end < 0) continue
      if (nowMin >= start && nowMin < end) {
        return {
          matiere: s.matiere ?? 'Cours',
          heureFin: s.heureFin,
        }
      }
    }
    return null
  } catch (err) {
    // Fail open — if we can't read the EDT, don't block declaration
    console.warn('[checkOngoingClass] check skipped:', err)
    return null
  }
}

export { Timestamp }

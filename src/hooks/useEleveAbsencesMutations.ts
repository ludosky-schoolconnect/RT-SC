/**
 * RT-SC · Absences — write hook (self-declaration).
 *
 * The élève or parent declares an absence in advance. Saved with
 * statut='en attente' for PP/admin to review later (review UI ships in
 * 5d.2b).
 *
 * Time-locks live in Firestore Security Rules (request.time check between
 * 06h-18h Bénin local) — server-authoritative, can't be bypassed by
 * client clock tampering. Client-side validation here is for UX only:
 * we surface friendly error messages BEFORE the rules block the write.
 *
 * Anti-spam quotas (max 1 declared absence per day, max 3 per week)
 * are enforced via a count of existing absences read from the cache.
 */

import { useMutation } from '@tanstack/react-query'
import { Timestamp, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { absencesCol } from '@/lib/firestore-keys'
import type { Absence, SourceAbsence } from '@/types/models'

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

/**
 * Anti-spam quota check.
 *
 * Returns a French-language reason string if the quota is exceeded,
 * or null if the declaration is allowed. Consumers should surface the
 * string as an error toast/inline message and abort the save.
 *
 * Rules:
 *   - At most 1 NEW (statut='en attente') declaration per calendar day
 *   - At most 3 declarations total in the current Mon–Sat week
 */

export function checkQuota(
  existing: Absence[],
  forDate: Date
): string | null {
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  // Same-day check (against the date the user is declaring FOR)
  const sameDay = existing.filter((a) => {
    try {
      const ad = a.date.toDate()
      return dayKey(ad) === dayKey(forDate)
    } catch {
      return false
    }
  })
  if (sameDay.length >= 1) {
    return "Vous avez déjà déclaré une absence pour ce jour."
  }

  // Same-week count (Mon–Sat) against TODAY (rolling week)
  const now = new Date()
  const dayOfWeek = now.getDay() // Sun=0..Sat=6
  const diffMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + diffMon)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 5)
  weekEnd.setHours(23, 59, 59, 999)

  const thisWeek = existing.filter((a) => {
    try {
      const ad = a.createdAt?.toDate?.() ?? a.date.toDate()
      return ad >= weekStart && ad <= weekEnd
    } catch {
      return false
    }
  })
  if (thisWeek.length >= 3) {
    return "Vous avez atteint la limite de 3 déclarations cette semaine."
  }

  return null
}

export { Timestamp }

/**
 * RT-SC · Présences — write hook.
 *
 * Saves a complete appel for a (class, date, matière) tuple in one
 * setDoc(merge: true) call. Idempotent — re-saving overwrites the slot.
 *
 * Payload shape (one matière slot):
 *   { [matiereSlug]: PresenceSlot }
 *
 * The prof's identity (uid + display name) is denormalized at write time
 * so the UI can show "Pris par X" without an extra prof lookup.
 *
 * No optimistic update because the snapshot listener catches the write
 * within milliseconds. Same anti-race pattern as useSeancesMutations.
 */

import { useMutation } from '@tanstack/react-query'
import { Timestamp, serverTimestamp, setDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { presenceDoc } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import { safeMatiereId } from '@/lib/benin'
import type { AbsentMark, RetardMark } from '@/types/models'

export interface SaveAppelInput {
  classeId: string
  /** "YYYY-MM-DD" in Bénin local. Caller computes via dateISO(). */
  dateISO: string
  matiere: string
  /** Map of eleveId → AbsentMark for everyone marked Absent. */
  absents: { [eleveId: string]: AbsentMark }
  /** Map of eleveId → RetardMark for everyone marked Retard. */
  retards: { [eleveId: string]: RetardMark }
  /** Total number of élèves in the class at write time. */
  totalEleves: number
  /** Optional reference to the seance this appel was taken for. */
  seanceId?: string
  /** Optional override for prof display name; defaults to profil.nom. */
  profDisplayName?: string
}

export function useSaveAppel() {
  const profil = useAuthStore((s) => s.profil)
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: async (input: SaveAppelInput) => {
      const slug = safeMatiereId(input.matiere)
      const profName = input.profDisplayName ?? profil?.nom ?? 'Inconnu'
      const slot: Record<string, unknown> = {
        absents: input.absents,
        retards: input.retards,
        pris_par: profName,
        pris_par_uid: user?.uid ?? null,
        pris_a: serverTimestamp(),
        total_eleves: input.totalEleves,
      }
      if (input.seanceId) slot.seanceId = input.seanceId
      await setDoc(
        docRef(presenceDoc(input.classeId, input.dateISO)),
        { [slug]: slot },
        { merge: true }
      )
    },
  })
}

/** Helper: today's ISO date in Bénin local (Africa/Porto-Novo, UTC+1, no DST). */
export function todayISO(now: Date = new Date()): string {
  // Use local components — devices in Benin are on WAT.
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Helper: "HH:MM" of right now in local. */
export function nowHHMM(now: Date = new Date()): string {
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// Re-export Timestamp for convenience in callers if they need to construct
// AbsentMark/RetardMark with their own timestamps.
export { Timestamp }

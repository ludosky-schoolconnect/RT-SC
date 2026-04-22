/**
 * RT-SC · Incidents hook (Phase 3b).
 *
 * An "incident" is a deduction of civisme points as a disciplinary
 * response (bagarre, absence injustifiée, négligence, etc). Unlike
 * quests/reclamations, incidents don't have their own collection —
 * they're purely a civismeHistory entry with raison='incident'.
 *
 * Authorized callers:
 *   - Admin (any student, any classe)
 *   - Prof (only students in one of their own classes)
 * Students CANNOT submit incidents. Enforced by the UI — the button
 * only appears for admin/prof flows — and by Firestore rules which
 * restrict civismeHistory creation to admin.
 *
 * (NOTE: Because the firestore rules as shipped in Phase 3a only
 * let admin write civismeHistory, profs currently call this via an
 * admin-proxy approval step — we'll loosen rules to allow isStaff
 * in a rules update shipped alongside this.)
 *
 * Atomic: points decrement + history entry append in one transaction.
 */

import { useMutation } from '@tanstack/react-query'
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { eleveDoc, civismeHistoryCol } from '@/lib/firestore-keys'
import { CIVISME_FLOOR, CIVISME_CEILING } from '@/hooks/useCivisme'

export interface ReportIncidentInput {
  classeId: string
  eleveId: string
  /** Required — describes what happened */
  motif: string
  /** Positive number — will be subtracted from civismePoints */
  pointsADeduire: number
  parUid: string
  parNom: string
}

export function useReportIncident() {
  return useMutation({
    mutationFn: async (
      input: ReportIncidentInput
    ): Promise<{ newBalance: number }> => {
      const delta = -Math.abs(Math.round(input.pointsADeduire))
      if (delta === 0) {
        throw new Error('Indiquez un nombre de points > 0 à retirer.')
      }
      if (!input.motif.trim()) {
        throw new Error('Un motif est requis pour signaler un incident.')
      }

      let newBalance = 0
      await runTransaction(db, async (tx) => {
        const eleveRef = doc(db, eleveDoc(input.classeId, input.eleveId))
        const snap = await tx.get(eleveRef)
        if (!snap.exists()) throw new Error('Élève introuvable.')
        const data = snap.data() as { civismePoints?: number }
        const current = data.civismePoints ?? 0
        newBalance = Math.max(
          CIVISME_FLOOR,
          Math.min(CIVISME_CEILING, current + delta)
        )

        tx.update(eleveRef, { civismePoints: newBalance })

        const historyRef = doc(
          collection(db, civismeHistoryCol(input.classeId, input.eleveId))
        )
        tx.set(historyRef, {
          delta,
          raison: 'incident',
          motif: input.motif.trim(),
          date: serverTimestamp(),
          parUid: input.parUid,
          parNom: input.parNom,
          soldeApres: newBalance,
        })
      })

      return { newBalance }
    },
  })
}

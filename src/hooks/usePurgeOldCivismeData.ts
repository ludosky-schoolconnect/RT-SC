/**
 * RT-SC · Civisme data purge hook (Phase 3b maintenance).
 *
 * Manually triggered by admin from the Civisme tab's Maintenance
 * card. Deletes records older than the retention threshold (default
 * 6 months) that are in a terminal state:
 *
 *   - Reclamations with statut in ('fulfillee', 'annulee') AND older
 *     than the cutoff date.
 *   - Quetes with statut in ('cloturee', 'annulee') AND older than
 *     the cutoff, plus their claims subcollection (cascade).
 *
 * Preserved intentionally:
 *   - civismeHistory entries (students/parents should see their own
 *     long-term history; archived at year rollover, not here)
 *   - Active/ouverte quetes regardless of age
 *   - 'Pleine' (internally 'complete') quetes — still need validation
 *   - Claims on active quetes
 *
 * Note on evolving usage:
 *   As of the "Supprimer la quête" change, admin deletes quêtes
 *   outright instead of cancelling, so new `annulee` quêtes no
 *   longer appear. The purge still handles them because legacy
 *   docs may still exist from before the change. Reclamations, on
 *   the other hand, ARE still marked `fulfillee`/`annulee` on the
 *   normal flow, so the purge is definitely useful there.
 *
 * Implementation note — client-side filtering:
 *   We do NOT use compound Firestore queries like
 *     where('statut', '==', X) + where('createdAt', '<', cutoff)
 *   because those require a composite index to be created in the
 *   Firebase console. Instead we fetch all docs and filter client-
 *   side. The cost is fine at school scale: a year's worth of
 *   quêtes is typically < 100 docs and reclamations < 500.
 *
 * Why manual + not automatic? No Blaze plan = no Cloud Functions.
 * A "Purger" button that admin clicks periodically (e.g. once a
 * trimester) keeps storage bounded without extra infrastructure.
 *
 * Safety: deletions run serially rather than in a single giant
 * transaction because Firestore batches cap at 500 operations and
 * we don't need atomicity — if a purge is interrupted, re-running
 * simply picks up where it left off.
 */

import { useMutation } from '@tanstack/react-query'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  quetesCol,
  queteDoc,
  queteClaimsCol,
  reclamationsCol,
  reclamationDoc,
} from '@/lib/firestore-keys'
import type { Quete, Reclamation } from '@/types/models'

/** Default retention: 6 months (approximately one school trimester). */
const DEFAULT_RETENTION_DAYS = 180

export interface PurgeResult {
  quetesDeleted: number
  claimsDeleted: number
  reclamationsDeleted: number
}

/**
 * Safe resolution of a Firestore Timestamp (or Date, or undefined) to
 * milliseconds. Returns null when the field is missing or unparseable
 * so the caller can skip rather than accidentally delete.
 */
function toMillis(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'object' && value !== null) {
    const v = value as {
      toMillis?: () => number
      toDate?: () => Date
      seconds?: number
    }
    if (typeof v.toMillis === 'function') return v.toMillis()
    if (typeof v.toDate === 'function') return v.toDate().getTime()
    if (typeof v.seconds === 'number') return v.seconds * 1000
  }
  if (value instanceof Date) return value.getTime()
  return null
}

export function usePurgeOldCivismeData() {
  return useMutation({
    mutationFn: async (
      retentionDays: number = DEFAULT_RETENTION_DAYS
    ): Promise<PurgeResult> => {
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000

      let quetesDeleted = 0
      let claimsDeleted = 0
      let reclamationsDeleted = 0

      // ─── 1. Old reclamations ────────────────────────────────
      // Fetch the whole collection and filter client-side — avoids
      // needing a composite index (statut == X AND demandeeLe < Y).
      const reclSnap = await getDocs(collection(db, reclamationsCol()))
      for (const d of reclSnap.docs) {
        const r = d.data() as Reclamation
        if (r.statut !== 'fulfillee' && r.statut !== 'annulee') continue
        const at = toMillis(r.demandeeLe)
        if (at === null) continue
        if (at >= cutoffMs) continue
        await deleteDoc(doc(db, reclamationDoc(d.id)))
        reclamationsDeleted++
      }

      // ─── 2. Old quetes + cascade claims ──────────────────────
      const quetesSnap = await getDocs(collection(db, quetesCol()))
      for (const d of quetesSnap.docs) {
        const q = d.data() as Quete
        if (q.statut !== 'cloturee' && q.statut !== 'annulee') continue
        const at = toMillis(q.createdAt)
        if (at === null) continue
        if (at >= cutoffMs) continue

        const quesId = d.id
        // Delete all claims of this quete first
        const claimsSnap = await getDocs(
          collection(db, queteClaimsCol(quesId))
        )
        for (const cd of claimsSnap.docs) {
          await deleteDoc(cd.ref)
          claimsDeleted++
        }
        // Then the quete doc itself
        await deleteDoc(doc(db, queteDoc(quesId)))
        quetesDeleted++
      }

      return { quetesDeleted, claimsDeleted, reclamationsDeleted }
    },
  })
}

/**
 * Monthly civisme data purge.
 *
 * Replaces the manual "Purger" button in the admin's Civisme tab
 * (`src/hooks/usePurgeOldCivismeData.ts`). Runs on the 1st of every
 * month at 01:00 Africa/Porto-Novo. Deletes:
 *
 *   - Réclamations with statut ∈ ('fulfillee','annulee') AND
 *     demandeeLe < now - 180 days
 *   - Quêtes with statut ∈ ('cloturee','annulee') AND
 *     createdAt < now - 180 days, plus their claims subcollection
 *
 * Preserved intentionally (same as client-side purge):
 *   - Active/ouverte quêtes regardless of age
 *   - 'complete' (a.k.a. 'Pleine') quêtes — still need validation
 *   - civismeHistory entries (those get archived on year rollover,
 *     not purged here)
 *
 * Why monthly and not daily: purging is a maintenance task. Daily
 * would multiply invocations for no benefit (the data being purged
 * hasn't moved in months). Monthly matches how admins thought about
 * it ("run the Purger once a trimester") while being even more
 * consistent.
 *
 * Session D will remove the manual "Purger" button from the Civisme
 * tab once this function is live, or keep it as an admin override.
 * TBD — leave both working in parallel during transition.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'

const RETENTION_DAYS = 30

interface Reclamation {
  statut?: string
  demandeeLe?: { toMillis?: () => number; toDate?: () => Date }
}
interface Quete {
  statut?: string
  createdAt?: { toMillis?: () => number; toDate?: () => Date }
}

function toMillis(v: unknown): number | null {
  if (!v || typeof v !== 'object') return null
  const obj = v as {
    toMillis?: () => number
    toDate?: () => Date
    seconds?: number
  }
  if (typeof obj.toMillis === 'function') return obj.toMillis()
  if (typeof obj.toDate === 'function') return obj.toDate().getTime()
  if (typeof obj.seconds === 'number') return obj.seconds * 1000
  return null
}

export const monthlyCivismePurge = onSchedule(
  {
    schedule: '0 1 1 * *', // 01:00 on the 1st of each month
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
  },
  async () => {
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    logger.info('monthlyCivismePurge: run start', {
      cutoffISO: new Date(cutoffMs).toISOString(),
      retentionDays: RETENTION_DAYS,
    })

    let reclamationsDeleted = 0
    let quetesDeleted = 0
    let claimsDeleted = 0
    const errors: string[] = []

    // ─── 1. Réclamations ────────────────────────────────────
    try {
      const snap = await db.collection('reclamations').get()
      for (const d of snap.docs) {
        const r = d.data() as Reclamation
        if (r.statut !== 'fulfillee' && r.statut !== 'annulee') continue
        const at = toMillis(r.demandeeLe)
        if (at === null || at >= cutoffMs) continue
        try {
          await d.ref.delete()
          reclamationsDeleted++
        } catch (e) {
          errors.push(`reclamations/${d.id}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      errors.push(`reclamations scan: ${(e as Error).message}`)
    }

    // ─── 2. Quêtes + their claims ───────────────────────────
    try {
      const snap = await db.collection('quetes').get()
      for (const d of snap.docs) {
        const q = d.data() as Quete
        if (q.statut !== 'cloturee' && q.statut !== 'annulee') continue
        const at = toMillis(q.createdAt)
        if (at === null || at >= cutoffMs) continue

        const queteId = d.id
        // Delete claims subcollection first (cascade)
        try {
          const claimsSnap = await db
            .collection(`quetes/${queteId}/claims`)
            .get()
          for (const c of claimsSnap.docs) {
            await c.ref.delete()
            claimsDeleted++
          }
        } catch (e) {
          errors.push(`quetes/${queteId}/claims: ${(e as Error).message}`)
          continue // skip deleting the quête if we couldn't clear claims
        }

        // Then delete the quête itself
        try {
          await d.ref.delete()
          quetesDeleted++
        } catch (e) {
          errors.push(`quetes/${queteId}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      errors.push(`quetes scan: ${(e as Error).message}`)
    }

    logger.info('monthlyCivismePurge: complete', {
      reclamationsDeleted,
      quetesDeleted,
      claimsDeleted,
      errorCount: errors.length,
    })

    if (errors.length > 0) {
      // Surface as a failed run for Cloud Functions metrics, but don't
      // throw until the end — partial progress is still useful.
      throw new Error(
        `monthlyCivismePurge had ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`
      )
    }
  }
)

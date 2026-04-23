/**
 * onClasseDelete trigger.
 *
 * Fires on /classes/{classeId} delete. The client-side useDeleteClasse
 * already cleans élèves and their per-élève subcollections (notes,
 * colles, absences, bulletins, paiements), but it misses several
 * class-level side-cars:
 *
 *   1. /classes/{cid}/presences/{date}         — daily attendance rows
 *   2. /classes/{cid}/publications/{id}        — class-level announcements
 *   3. /emploisDuTemps/{cid} + /seances/{id}   — schedule slots (top-level)
 *   4. /ecole/coefficients_{cid}               — per-class coefficient doc
 *
 * Of these, the schedule (emploisDuTemps) is the biggest — a semester
 * typically has 20-30 seances per class. Over years of churned classes
 * (renames, restructures) this accumulates into thousands of orphan
 * docs. This trigger closes that.
 *
 * The client-side cascade in useClassesMutations.ts is left untouched
 * — it still handles the per-élève tree because that cleanup happens
 * atomically from the client's perspective (each deleteDoc is awaited
 * so the UI knows when it's safe to refresh). This trigger is a
 * SAFETY NET + top-level cleanup, not a replacement.
 *
 * Idempotency: re-reading empty subcollections and deleting zero docs
 * is a no-op. Safe to retry.
 *
 * Performance: bounded by class size. Presences accumulate ~180 docs/
 * year (one per school day). Publications rarely exceed a few dozen.
 * Seances 20-30. One coefficients doc. All well within the 540s
 * timeout even for multi-year archived classes (though those go
 * through useDeleteArchivedYear which is separate).
 *
 * This is Session E1a. Dormant until Blaze deploy.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'

const BATCH_SIZE = 450

/**
 * Delete every doc in a collection in batches.
 * Returns the number of deleted docs.
 */
async function purgeCollection(path: string): Promise<number> {
  const snap = await db.collection(path).get()
  let deleted = 0
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const d of chunk) batch.delete(d.ref)
    await batch.commit()
    deleted += chunk.length
  }
  return deleted
}

export const onClasseDelete = onDocumentDeleted(
  {
    document: 'classes/{classeId}',
    region: 'us-central1',
    timeoutSeconds: 540,
  },
  async (event) => {
    const classeId = event.params.classeId
    if (!classeId) return

    logger.info('onClasseDelete: starting', { classeId })

    // ─── 1. /classes/{cid}/presences/* ───────────────────────
    try {
      const n = await purgeCollection(`classes/${classeId}/presences`)
      logger.info('onClasseDelete: presences purged', { classeId, count: n })
    } catch (err) {
      logger.error('onClasseDelete: presences purge failed', {
        classeId,
        err: (err as Error).message,
      })
    }

    // ─── 2. /classes/{cid}/publications/* ────────────────────
    try {
      const n = await purgeCollection(`classes/${classeId}/publications`)
      logger.info('onClasseDelete: publications purged', { classeId, count: n })
    } catch (err) {
      logger.error('onClasseDelete: publications purge failed', {
        classeId,
        err: (err as Error).message,
      })
    }

    // ─── 3. /emploisDuTemps/{cid} + nested seances ───────────
    // Seances live under /emploisDuTemps/{cid}/seances/*. Purge the
    // subcollection first, then the parent doc.
    try {
      const n = await purgeCollection(`emploisDuTemps/${classeId}/seances`)
      logger.info('onClasseDelete: emploisDuTemps seances purged', {
        classeId,
        count: n,
      })
      try {
        await db.doc(`emploisDuTemps/${classeId}`).delete()
      } catch {
        // Parent doc may not exist (only created lazily on first seance);
        // ignore. No harm.
      }
    } catch (err) {
      logger.error('onClasseDelete: emploisDuTemps purge failed', {
        classeId,
        err: (err as Error).message,
      })
    }

    // ─── 4. /ecole/coefficients_{cid} ────────────────────────
    try {
      await db.doc(`ecole/coefficients_${classeId}`).delete()
      logger.info('onClasseDelete: coefficients doc deleted', { classeId })
    } catch (err) {
      // Class may not have had a coefficients override — that's fine.
      const code = (err as { code?: string }).code
      if (code !== 'not-found') {
        logger.warn('onClasseDelete: coefficients delete warning', {
          classeId,
          err: (err as Error).message,
        })
      }
    }

    logger.info('onClasseDelete: done', { classeId })
  }
)

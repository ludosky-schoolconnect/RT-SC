/**
 * onEleveDeleteCascade trigger.
 *
 * Fires on /classes/{classeId}/eleves/{eleveId} delete. The client's
 * useDeleteEleve already cascades the per-éleve subcollections
 * (notes, colles, absences, bulletins, paiements, civismeHistory) —
 * this trigger is the SAFETY NET + handles the few things the
 * client can't (cross-collection back-refs that require a global
 * query).
 *
 * Responsibilities:
 *
 *   1. Re-sweep the per-éleve subcollections in case the client
 *      cascade failed partway (network drop mid-delete, permission
 *      hiccup on one of the sub-paths, etc.). Deleting from an empty
 *      collection is a no-op, so this is always safe.
 *
 *   2. Delete /annuaire_parents/* docs that reference this éleve.
 *      Parents' contact info was linked via `annuaire_parents.eleveId`;
 *      those entries become unreachable once the student is gone.
 *      Note the deterministic ID pattern `{eleveId}_parent1/2` means
 *      we can target by ID directly (cheaper than a query), but we
 *      also run a fallback query in case older rows used different
 *      IDs.
 *
 *   3. Delete active /quetes/{q}/claims/{c} claims referencing this
 *      éleve. Claims are rewarded civisme/behavior tokens — if the
 *      éleve leaves the school, pending claims should vanish so they
 *      don't clutter the admin review queue with ghost names.
 *
 * What we intentionally DON'T clean:
 *   - /civisme_history/{eleveId}/* — already covered by the client
 *     cascade. If the client skipped it we re-run but otherwise
 *     leave it alone (it's authoritative behavior record, not a
 *     side-ref).
 *   - /archive — historical data is immutable.
 *   - /absences — archived absences are system-wide audit log, not
 *     éleve-specific references.
 *
 * Idempotency: every operation is re-runnable. If nothing matches,
 * nothing happens.
 *
 * This is Session E1b. Dormant until Blaze deploy.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'

const BATCH_SIZE = 450

/**
 * Delete every doc in a collection in batches.
 * Returns the number of docs deleted.
 */
async function purgeCollection(path: string): Promise<number> {
  try {
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
  } catch (err) {
    logger.warn('onEleveDeleteCascade: purgeCollection partial failure', {
      path,
      err: (err as Error).message,
    })
    return 0
  }
}

export const onEleveDeleteCascade = onDocumentDeleted(
  {
    document: 'classes/{classeId}/eleves/{eleveId}',
    region: 'us-central1',
    timeoutSeconds: 540,
  },
  async (event) => {
    const { classeId, eleveId } = event.params
    if (!classeId || !eleveId) return

    logger.info('onEleveDeleteCascade: starting', { classeId, eleveId })

    // ─── 1. Safety-net per-éleve subcollection sweep ───────
    // Each of these is normally cleaned by the client-side
    // useDeleteEleve loop; we re-run to catch partial failures.
    const subPaths = [
      `classes/${classeId}/eleves/${eleveId}/notes`,
      `classes/${classeId}/eleves/${eleveId}/colles`,
      `classes/${classeId}/eleves/${eleveId}/absences`,
      `classes/${classeId}/eleves/${eleveId}/bulletins`,
      `classes/${classeId}/eleves/${eleveId}/paiements`,
      `classes/${classeId}/eleves/${eleveId}/civismeHistory`,
    ]
    for (const path of subPaths) {
      const n = await purgeCollection(path)
      if (n > 0) {
        logger.info('onEleveDeleteCascade: safety-net cleanup deleted residuals', {
          path,
          count: n,
        })
      }
    }

    // ─── 2. Annuaire parents by eleveId ────────────────────
    try {
      // Fast path: deterministic IDs. Safe to delete non-existent
      // docs (Firestore treats delete() on missing as no-op).
      await Promise.allSettled([
        db.doc(`annuaire_parents/${eleveId}_parent1`).delete(),
        db.doc(`annuaire_parents/${eleveId}_parent2`).delete(),
      ])

      // Fallback: query by eleveId in case older rows used different
      // ID patterns. Cheap — there are at most 2 parent rows per éleve.
      const annSnap = await db
        .collection('annuaire_parents')
        .where('eleveId', '==', eleveId)
        .get()
      for (const d of annSnap.docs) {
        try {
          await d.ref.delete()
        } catch {
          // already deleted by the fast path above — ignore
        }
      }
      logger.info('onEleveDeleteCascade: annuaire cleaned', {
        eleveId,
        fallbackCount: annSnap.size,
      })
    } catch (err) {
      logger.error('onEleveDeleteCascade: annuaire cleanup failed', {
        eleveId,
        err: (err as Error).message,
      })
    }

    // ─── 3. Pending quete claims referencing this éleve ────
    // Uses the collectionGroup on 'claims' with an eleveId filter.
    try {
      const claimsSnap = await db
        .collectionGroup('claims')
        .where('eleveId', '==', eleveId)
        .get()
      for (let i = 0; i < claimsSnap.docs.length; i += BATCH_SIZE) {
        const chunk = claimsSnap.docs.slice(i, i + BATCH_SIZE)
        const batch = db.batch()
        for (const d of chunk) batch.delete(d.ref)
        await batch.commit()
      }
      logger.info('onEleveDeleteCascade: quete claims cleaned', {
        eleveId,
        count: claimsSnap.size,
      })
    } catch (err) {
      logger.error('onEleveDeleteCascade: claims cleanup failed', {
        eleveId,
        err: (err as Error).message,
      })
    }

    logger.info('onEleveDeleteCascade: done', { classeId, eleveId })
  }
)

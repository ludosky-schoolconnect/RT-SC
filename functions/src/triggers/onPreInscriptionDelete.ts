/**
 * onPreInscriptionDelete trigger.
 *
 * Fires on /pre_inscriptions/{id} delete. Cleans the nested
 * /documents/{docId} subcollection holding the parent-uploaded ID
 * photos, birth certificates, etc.
 *
 * Storage note: despite the feature being called "document uploads",
 * each document is stored INLINE as a base64 string inside its own
 * Firestore doc (see src/lib/inscription-doc-storage.ts — client-
 * side compression to ≤900KB keeps it under Firestore's 1MB limit).
 * There are NO Firebase Storage files to clean up — only Firestore
 * docs. Simpler than the Annale case.
 *
 * The client-side useDeletePreInscription (hooks/usePreInscriptions.ts)
 * deletes only the root doc, leaving documents/* orphaned. This
 * trigger closes that gap.
 *
 * Also note: the inscription-doc-storage module has a post-finalize
 * cleanup that wipes documents/* when admin moves a dossier to
 * "Inscrit Officiellement". This trigger is a safety net for the
 * other terminal state (rejection + delete) which doesn't go through
 * finalize.
 *
 * Idempotency: re-running on an already-clean inscription deletes
 * zero docs. Safe.
 *
 * This is Session E1b. Dormant until Blaze deploy.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'

const BATCH_SIZE = 450

export const onPreInscriptionDelete = onDocumentDeleted(
  {
    document: 'pre_inscriptions/{piId}',
    region: 'us-central1',
    timeoutSeconds: 120,
  },
  async (event) => {
    const piId = event.params.piId
    if (!piId) return

    logger.info('onPreInscriptionDelete: starting', { piId })

    try {
      // Subcollection path matches preInscriptionDocsCol('{piId}')
      // from src/lib/firestore-keys.ts
      const snap = await db
        .collection(`pre_inscriptions/${piId}/documents`)
        .get()

      if (snap.empty) {
        logger.info('onPreInscriptionDelete: no documents to clean', { piId })
        return
      }

      let deleted = 0
      for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const chunk = snap.docs.slice(i, i + BATCH_SIZE)
        const batch = db.batch()
        for (const d of chunk) batch.delete(d.ref)
        await batch.commit()
        deleted += chunk.length
      }

      logger.info('onPreInscriptionDelete: documents purged', {
        piId,
        count: deleted,
      })
    } catch (err) {
      logger.error('onPreInscriptionDelete: cleanup failed', {
        piId,
        err: (err as Error).message,
      })
      // Don't rethrow — documents are orphaned, not catastrophic,
      // and retrying forever burns invocations without likely fix.
    }
  }
)

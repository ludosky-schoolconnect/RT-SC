/**
 * onProfDeleteCascade trigger.
 *
 * Paired with the existing onProfDelete trigger (Session A). While
 * onProfDelete handles Auth-account cleanup, this sibling handles the
 * orphan references scattered across other collections that a
 * deleted prof leaves behind.
 *
 * Two separate functions so each has a single responsibility and a
 * failure in one doesn't block the other. Both fire on the same
 * event (/professeurs/{uid} delete) and run in parallel.
 *
 * Orphan refs cleaned:
 *
 *   1. classes.matieresProfesseurs — a map { matiere → profId } on
 *      each class doc. Scans all classes, removes any key whose value
 *      is the deleted profId. The client-side useDeleteProf already
 *      cleans `classesIds`, `profPrincipalId`, and `seances` via
 *      collectionGroup, but the matieresProfesseurs map is missed.
 *
 *   2. notes.professeurId — every Note doc carries the writer's uid.
 *      Set to empty string on all notes this prof ever wrote. We
 *      keep the note (grades are evidence — we can't silently erase
 *      a student's grade because the teacher left) and just null the
 *      authorship. Uses a collectionGroup query.
 *
 *   3. colles.donneParProfId — same pattern for colles. Set to empty
 *      string, preserve the colle itself.
 *
 * What we intentionally DON'T do here:
 *   - Don't delete notes/colles. Those are academic record, not
 *     metadata about the prof. The school needs to audit them later.
 *   - Don't touch /archive — historical data is immutable and the
 *     prof reference there is part of the year's factual record.
 *
 * Idempotency: if retried, a second run finds no matching docs (we
 * already cleared the fields) and no-ops cleanly.
 *
 * Performance: for a school with a few thousand notes per prof over
 * several years, this is a few hundred batched writes. Well under
 * the function's 60s timeout. If a prof has more than ~450 notes
 * (the Firestore batch cap), we chunk.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'
import { FieldValue } from 'firebase-admin/firestore'

const BATCH_SIZE = 450

export const onProfDeleteCascade = onDocumentDeleted(
  {
    document: 'professeurs/{uid}',
    region: 'us-central1',
    timeoutSeconds: 540,
  },
  async (event) => {
    const uid = event.params.uid
    if (!uid) return

    logger.info('onProfDeleteCascade: starting', { uid })

    // ─── 1. matieresProfesseurs map on each class ──────────────
    try {
      const classesSnap = await db.collection('classes').get()
      let classesTouched = 0
      for (const classeDoc of classesSnap.docs) {
        const data = classeDoc.data() as {
          matieresProfesseurs?: Record<string, string>
        }
        const map = data.matieresProfesseurs
        if (!map) continue

        // Find keys whose value is the deleted uid
        const toRemove: string[] = []
        for (const [matiere, profId] of Object.entries(map)) {
          if (profId === uid) toRemove.push(matiere)
        }
        if (toRemove.length === 0) continue

        // Build the update using FieldValue.delete() on each mapped key
        const update: Record<string, unknown> = {}
        for (const matiere of toRemove) {
          update[`matieresProfesseurs.${matiere}`] = FieldValue.delete()
        }
        try {
          await classeDoc.ref.update(update)
          classesTouched++
        } catch (err) {
          logger.warn('onProfDeleteCascade: matieresProfesseurs update failed for one class', {
            classeId: classeDoc.id,
            err: (err as Error).message,
          })
        }
      }
      logger.info('onProfDeleteCascade: matieresProfesseurs cleaned', {
        uid,
        classesTouched,
      })
    } catch (err) {
      logger.error('onProfDeleteCascade: matieresProfesseurs scan failed', {
        uid,
        err: (err as Error).message,
      })
      // continue to next cleanup pass
    }

    // ─── 2. notes.professeurId ─────────────────────────────────
    // collectionGroup('notes') matches every document at
    // /classes/*/eleves/*/notes/*. Filter to this prof.
    try {
      const notesSnap = await db
        .collectionGroup('notes')
        .where('professeurId', '==', uid)
        .get()

      for (let i = 0; i < notesSnap.docs.length; i += BATCH_SIZE) {
        const chunk = notesSnap.docs.slice(i, i + BATCH_SIZE)
        const batch = db.batch()
        for (const d of chunk) batch.update(d.ref, { professeurId: '' })
        await batch.commit()
      }
      logger.info('onProfDeleteCascade: notes.professeurId cleared', {
        uid,
        count: notesSnap.size,
      })
    } catch (err) {
      logger.error('onProfDeleteCascade: notes cleanup failed', {
        uid,
        err: (err as Error).message,
      })
    }

    // ─── 3. colles.donneParProfId ──────────────────────────────
    try {
      const collesSnap = await db
        .collectionGroup('colles')
        .where('donneParProfId', '==', uid)
        .get()

      for (let i = 0; i < collesSnap.docs.length; i += BATCH_SIZE) {
        const chunk = collesSnap.docs.slice(i, i + BATCH_SIZE)
        const batch = db.batch()
        for (const d of chunk) batch.update(d.ref, { donneParProfId: '' })
        await batch.commit()
      }
      logger.info('onProfDeleteCascade: colles.donneParProfId cleared', {
        uid,
        count: collesSnap.size,
      })
    } catch (err) {
      logger.error('onProfDeleteCascade: colles cleanup failed', {
        uid,
        err: (err as Error).message,
      })
    }

    logger.info('onProfDeleteCascade: done', { uid })
  }
)

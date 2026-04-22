/**
 * onProfDelete trigger.
 *
 * Fires when a /professeurs/{uid} document is deleted. Deletes the
 * corresponding Firebase Auth account so the user can no longer log
 * in. Without this, deleted profs keep a valid Auth session until
 * they log out manually.
 *
 * Why this is important: an admin who removes a prof from the staff
 * list expects that prof to lose access immediately. In pre-Blaze
 * RT-SC, only the Firestore doc was deleted — the Auth account
 * lingered. This function closes that gap.
 *
 * The document ID IS the uid (they're created with the same ID in
 * the client's sign-up flow), so we can pass it straight to
 * admin.auth().deleteUser().
 *
 * Errors are logged but NOT rethrown. The prof's Firestore doc is
 * already gone — retrying the Auth deletion indefinitely doesn't
 * help (e.g. if the Auth account was already deleted manually,
 * deleteUser throws 'auth/user-not-found' and that's fine).
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { auth } from '../lib/firebase.js'

export const onProfDelete = onDocumentDeleted(
  {
    document: 'professeurs/{uid}',
    region: 'us-central1',
  },
  async (event) => {
    const uid = event.params.uid
    if (!uid) {
      logger.warn('onProfDelete: missing uid param', { eventId: event.id })
      return
    }

    try {
      await auth.deleteUser(uid)
      logger.info('onProfDelete: Auth user deleted', { uid })
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'auth/user-not-found') {
        // Already gone — nothing to do. Not an error.
        logger.info('onProfDelete: Auth user not found (already deleted)', {
          uid,
        })
        return
      }
      logger.error('onProfDelete: failed to delete Auth user', {
        uid,
        code: e.code,
        message: e.message,
      })
      // Intentionally do NOT rethrow — retrying won't fix a broken
      // Auth record and we don't want the function to spin in
      // failure loop consuming quota.
    }
  }
)

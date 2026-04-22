/**
 * Weekly stale declared-absences cleanup.
 *
 * Replaces the client-side 14-day batch-delete in
 * `src/hooks/useSchoolAbsences.ts`. Runs every Sunday at 02:30
 * Africa/Porto-Novo.
 *
 * Scope: `/classes/{cId}/eleves/{eId}/absences/{id}` — the
 * parent/prof-declared absences (with a `raison` and `statut`).
 * NOT the appel-marked presences; those are handled by
 * `dailyPresenceRollover` which archives them to `/archived_absences/`.
 *
 * Why 14 days: the admin's Vie scolaire triage view only shows
 * recent declarations. Anything older than 14 days has already been
 * actioned or is irrelevant; keeping it in the live collection just
 * bloats collectionGroup queries used by triage.
 *
 * Data NOT archived: these declared absences aren't considered
 * long-term-valuable (unlike bulletins or civismeHistory). If an
 * admin needs them post-cleanup, they live in the nightly backup.
 * For year-boundary context: the year rollover ALSO archives them
 * per-élève into /archive/{annee}/... — that archive is the
 * definitive long-term record.
 *
 * Why weekly (not daily): the data churn is low (~a few declarations
 * per week), and daily cleanup would invoke the function 7x more
 * often for minimal benefit. Weekly matches the prior client-side
 * cadence.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

interface AbsenceLike {
  date?: Timestamp
  createdAt?: Timestamp
}

function tsToMillis(ts: Timestamp | undefined): number | null {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  return null
}

/**
 * Path filter: match only LIVE paths (`classes/{cId}/eleves/{eId}/absences/{id}`)
 * and NOT archive paths (e.g. `archive/2025-2026/classes/{cId}/eleves/.../absences/...`).
 * The collectionGroup('absences') query surfaces both by default.
 */
function isLiveAbsencePath(path: string): boolean {
  // Live paths: exactly 5 segments starting with "classes/"
  const parts = path.split('/')
  if (parts.length !== 5) return false
  return parts[0] === 'classes' && parts[2] === 'eleves' && parts[3] === parts[3] // explicit
  // (The structural check above is the meaningful part — parts[2] === 'eleves'
  // confirms the shape. Archive paths have 'archive' as parts[0].)
}

export const weeklyStaleAbsencesCleanup = onSchedule(
  {
    schedule: '30 2 * * 0', // Sunday 02:30
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
    timeoutSeconds: 300,
  },
  async () => {
    const cutoff = Date.now() - FOURTEEN_DAYS_MS
    logger.info('weeklyStaleAbsencesCleanup: run start', {
      cutoffISO: new Date(cutoff).toISOString(),
    })

    let scanned = 0
    let deleted = 0
    let skippedArchive = 0
    const errors: string[] = []

    try {
      const snap = await db.collectionGroup('absences').get()

      // Batch deletes (Firestore batches are capped at 500 ops)
      let batch = db.batch()
      let batchOps = 0

      for (const d of snap.docs) {
        scanned++
        if (!isLiveAbsencePath(d.ref.path)) {
          skippedArchive++
          continue
        }

        const data = d.data() as AbsenceLike
        const refMillis = tsToMillis(data.createdAt) ?? tsToMillis(data.date)
        if (refMillis === null || refMillis >= cutoff) continue

        batch.delete(d.ref)
        batchOps++
        deleted++

        if (batchOps >= 400) {
          await batch.commit()
          batch = db.batch()
          batchOps = 0
        }
      }

      if (batchOps > 0) {
        await batch.commit()
      }
    } catch (e) {
      errors.push(`scan: ${(e as Error).message}`)
      logger.error('weeklyStaleAbsencesCleanup: scan failed', {
        error: (e as Error).message,
      })
    }

    logger.info('weeklyStaleAbsencesCleanup: complete', {
      scanned,
      deleted,
      skippedArchive,
      errors: errors.length,
    })

    if (errors.length > 0) {
      throw new Error(
        `weeklyStaleAbsencesCleanup had ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`
      )
    }
  }
)

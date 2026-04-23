/**
 * Daily presence rollover.
 *
 * Runs at 00:05 Africa/Porto-Novo every day (5 minutes past midnight
 * to ensure the day has cleanly rolled over in the admin's timezone).
 * For each `/classes/{cId}/presences/{dateISO}` doc where `dateISO`
 * is STRICTLY BEFORE today's date, walks each matière slot's
 * `absents` map and writes one `/archived_absences/{compositeId}`
 * entry per marked absence, then deletes the live presence doc.
 *
 * Replaces the client-side lazy-on-read hook `useArchiveRollover`
 * in `src/hooks/useArchiveRollover.ts`. After this function is live
 * in production, Session D will remove the hook invocation from
 * `VieScolaireTab.tsx` — the scheduled run makes the client-side
 * pass redundant.
 *
 * Idempotency: composite ID is `${classeId}__${dateISO}__${matiereSlug}__${eleveId}`.
 * `setDoc` with merge overwrites with identical data — safe to
 * re-run (e.g. accidental manual invocation). Duplicate daily runs
 * write the same bytes twice.
 *
 * Cost profile at 10 schools:
 *   - 1 invocation/day × 365 = 365 invocations/year (free tier: 2M/mo)
 *   - Firestore reads: ~one `presences` collectionGroup scan per run.
 *     At 10 classes × 1 day lingering × 10 schools = ~100 docs/day.
 *   - Writes: 1 archive per absent mark + 1 delete per presence doc.
 *     ~50 marks/day/school × 10 schools = 500 writes/day max.
 * All well under Blaze free tier thresholds.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import {
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'

// ─── Helpers ────────────────────────────────────────────────

/**
 * Today's ISO date in Bénin local time. We format explicitly rather
 * than rely on server locale because Cloud Functions default to UTC,
 * so midnight-in-Bénin is 23:00 UTC on the prior day.
 */
function todayISOBenin(): string {
  const now = new Date()
  // UTC+1 (Bénin) — add 1h to UTC then format as YYYY-MM-DD
  const beninMs = now.getTime() + 60 * 60 * 1000
  const benin = new Date(beninMs)
  const y = benin.getUTCFullYear()
  const m = String(benin.getUTCMonth() + 1).padStart(2, '0')
  const d = String(benin.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `classes/{cId}/presences/{dateISO}` → `{classeId, dateISO}` */
function parsePresencePath(path: string): { classeId: string; dateISO: string } {
  const parts = path.split('/')
  return {
    classeId: parts[1] ?? '',
    dateISO: parts[3] ?? '',
  }
}

// Minimal types — match the client-side models, duplicated here to
// keep functions/ build independent of src/
interface AbsentMark {
  nom?: string
  heure?: string
  raison?: string
}
interface PresenceSlot {
  absents?: Record<string, AbsentMark>
  retards?: Record<string, unknown>
  pris_par?: string
  pris_par_uid?: string
  pris_a?: Timestamp
  total_eleves?: number
  seanceId?: string
}
type PresenceDocShape = Record<string, PresenceSlot>

// ─── Main ───────────────────────────────────────────────────

export const dailyPresenceRollover = onSchedule(
  {
    schedule: '5 0 * * *', // 00:05 every day
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
  },
  async () => {
    const today = todayISOBenin()
    logger.info('dailyPresenceRollover: run start', { today })

    // Use a collectionGroup query to scan /classes/*/presences in one pass
    const snap = await db.collectionGroup('presences').get()

    let archived = 0
    let deleted = 0
    let skipped = 0
    const errors: string[] = []

    for (const presenceSnap of snap.docs) {
      const { classeId, dateISO } = parsePresencePath(presenceSnap.ref.path)
      if (!classeId || !dateISO) {
        skipped++
        continue
      }

      // Only roll over days STRICTLY BEFORE today — leave today's live doc alone
      if (dateISO >= today) {
        skipped++
        continue
      }

      try {
        const data = presenceSnap.data() as PresenceDocShape

        // Convert the dateISO to a Timestamp for the archive doc's
        // `date` field — keeps compatibility with the existing archive
        // schema written by the legacy client-side hook.
        const [yy, mm, dd] = dateISO.split('-').map(Number)
        const dateTs = Timestamp.fromDate(
          new Date(Date.UTC(yy ?? 1970, (mm ?? 1) - 1, dd ?? 1, 0, 0, 0))
        )

        // Walk each matière slot
        const batch = db.batch()
        let batchWrites = 0
        for (const [matiereSlug, slot] of Object.entries(data)) {
          if (!slot || typeof slot !== 'object') continue
          const absents = slot.absents ?? {}
          for (const [eleveId, mark] of Object.entries(absents)) {
            const archiveId = `${classeId}__${dateISO}__${matiereSlug}__${eleveId}`
            const archiveRef = db.doc(`archived_absences/${archiveId}`)
            batch.set(archiveRef, {
              classeId,
              classeNom: '', // the existing schema leaves this blank too
              eleveId,
              eleveNom: mark?.nom ?? 'Inconnu',
              dateISO,
              date: dateTs,
              matiereSlug,
              matiere: matiereSlug.replace(/-/g, ' '),
              heure: mark?.heure ?? '',
              raison: mark?.raison ?? null,
              prisPar: slot.pris_par ?? '—',
              prisParUid: slot.pris_par_uid ?? null,
              archivedAt: FieldValue.serverTimestamp(),
            })
            batchWrites++
            archived++

            // Firestore batches are capped at 500 operations. Flush
            // if we hit the limit mid-class — rare for a real school,
            // but the server handles edge cases even if the client
            // rollover never did.
            if (batchWrites >= 400) {
              await batch.commit()
              batchWrites = 0
            }
          }
        }

        // Delete the presence doc AFTER archive writes
        batch.delete(presenceSnap.ref)
        deleted++
        await batch.commit()
      } catch (err) {
        const msg = `${classeId}/${dateISO}: ${(err as Error).message}`
        errors.push(msg)
        logger.error('dailyPresenceRollover: class failed', {
          classeId,
          dateISO,
          error: (err as Error).message,
        })
      }
    }

    logger.info('dailyPresenceRollover: complete', {
      today,
      archived,
      deleted,
      skipped,
      errors: errors.length,
    })

    if (errors.length > 0) {
      // Throwing surfaces the run as failed in Cloud Functions metrics,
      // and Scheduler retries on next cron tick (tomorrow) with the
      // same composite-id idempotency keeping writes safe.
      throw new Error(
        `dailyPresenceRollover had ${errors.length} per-class error(s): ${errors.slice(0, 3).join('; ')}`
      )
    }
  }
)

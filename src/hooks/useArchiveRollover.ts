/**
 * RT-SC · Daily archive roll-over for appel-marked absences.
 *
 * Lazy-on-read: when admin opens Triage école, this hook scans the
 * school-wide /presences/ collection for any doc with dateISO < today.
 * For each such doc, it walks every matière slot's `absents` map and
 * writes one /archived_absences/{auto} doc per (élève, matière) pair,
 * then deletes the original presence doc.
 *
 * The triage view's listener on /presences/ then re-fires with only
 * today's docs remaining, naturally clearing yesterday's data from
 * the active view.
 *
 * Why lazy-on-read instead of cron:
 *   - No infrastructure dependency (Cloud Functions cost extra setup)
 *   - Runs naturally during admin's daily monitoring workflow
 *   - If admin doesn't open the app for N days, archive runs on day
 *     N+1's first open — late but still correct
 *   - For a single-school CEG with a daily-active admin, this is fine
 *
 * Idempotency: archived_absences are written with a deterministic
 * composite ID `${classeId}__${dateISO}__${matiereSlug}__${eleveId}`
 * so re-running the roll-over (e.g. multiple admins opening the view
 * simultaneously) doesn't create duplicates. setDoc with this key
 * either creates or overwrites with identical data.
 *
 * Called once per session via useArchiveRollover() — the hook tracks
 * a session-scoped flag so it doesn't re-run on every tab switch.
 */

import { useEffect } from 'react'
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { archivedAbsenceDoc, presenceDoc as presenceDocPath } from '@/lib/firestore-keys'
import { todayISO } from '@/hooks/usePresenceMutations'
import type { AbsentMark, PresenceDoc } from '@/types/models'

/** Session flag — true after the rollover has been attempted this load. */
let rolloverAttempted = false

/** Parse "classes/{cId}/presences/{dateISO}" → { classeId, dateISO }. */
function parsePresencePath(path: string): { classeId: string; dateISO: string } {
  const parts = path.split('/')
  return {
    classeId: parts[1] ?? '',
    dateISO: parts[3] ?? '',
  }
}

async function runRollover(): Promise<void> {
  const today = todayISO()
  let archived = 0
  let deleted = 0

  try {
    // Use a one-shot getDocs (not a listener) — we only need the snapshot
    // at this moment in time, not a live subscription.
    const snap = await getDocs(query(collectionGroup(db, 'presences')))

    for (const presenceDocSnap of snap.docs) {
      const { classeId, dateISO } = parsePresencePath(presenceDocSnap.ref.path)
      if (!classeId || !dateISO) continue
      if (dateISO >= today) continue // today or future: keep in active view

      const data = presenceDocSnap.data() as PresenceDoc
      const dateTs = Timestamp.fromDate(new Date(dateISO + 'T12:00:00'))

      // Walk every matière slot
      for (const [matiereSlug, slot] of Object.entries(data)) {
        if (!slot || typeof slot !== 'object') continue
        const absents = (slot.absents ?? {}) as Record<string, AbsentMark>
        for (const [eleveId, mark] of Object.entries(absents)) {
          // Deterministic composite ID for idempotent re-archiving
          const archiveId = `${classeId}__${dateISO}__${matiereSlug}__${eleveId}`
          await setDoc(doc(db, archivedAbsenceDoc(archiveId)), {
            classeId,
            classeNom: '',  // populated by /classes lookup elsewhere; kept blank for now
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
            archivedAt: serverTimestamp(),
          })
          archived += 1
        }
      }

      // After all slots have been archived, delete the presence doc
      await deleteDoc(doc(db, presenceDocPath(classeId, dateISO)))
      deleted += 1
    }

    if (archived > 0 || deleted > 0) {
      console.info(
        `[archive-rollover] Archived ${archived} marked absence(s); deleted ${deleted} presence doc(s).`
      )
    }
  } catch (err) {
    // Don't surface to user — the worst case is the active view shows
    // some yesterday-data alongside today's, which is annoying but
    // not data-loss. We retry on next session.
    console.warn('[archive-rollover] failed:', err)
  }
}

/**
 * Mounts an effect that runs the rollover ONCE per session.
 *
 * Pass canRun=false for prof sessions — rules would block the writes
 * anyway but short-circuiting avoids the noisy console warning and
 * spares one needless getDocs call.
 */
export function useArchiveRollover(canRun: boolean = true) {
  useEffect(() => {
    if (!canRun) return
    if (rolloverAttempted) return
    rolloverAttempted = true
    void runRollover()
  }, [canRun])
}

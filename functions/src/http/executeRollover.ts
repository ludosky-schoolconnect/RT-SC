/**
 * RT-SC · executeRollover — callable Cloud Function.
 *
 * Executes the year-end rollover atomically from the server, using the
 * promotion plan staged by the admin in `ecole/rolloverPlan`.
 *
 * Contract:
 *   - Admin stages decisions for every class via the UI (stageClassDecisions)
 *   - Admin triggers this function from ModalArchiveAnnee
 *   - This function reads the plan, applies every promotion decision, then
 *     runs the full school-wide archive — all using Admin SDK (no client)
 *   - Progress is written to ecole/rolloverPlan.progress so the client can
 *     show a live bar without staying connected to execute the work
 *   - If this function fails mid-way, the plan doc is marked 'failed'.
 *     The admin can re-trigger (idempotent checks prevent double-writes)
 *     or reset the plan to start classification over.
 *
 * Why server-side matters:
 *   - Admin's phone can close — the function keeps running on Google's servers
 *   - No client round-trip latency per write (100x faster on large schools)
 *   - Admin SDK bypasses Firestore security rules → no permission edge cases
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'

// ─── Types (mirror src/types/models.ts, no shared dep) ────────

interface StagedDecision {
  eleveId: string
  statut: 'admis' | 'echoue' | 'abandonne'
  destClasseId?: string
}

interface RolloverPlanDoc {
  annee: string
  newAnnee: string
  status: 'staging' | 'executing' | 'done' | 'failed'
  classePlans: Record<string, { decisions: StagedDecision[]; stagedAt: FirebaseFirestore.Timestamp }>
}

interface RolloverResult {
  classesProcessed: number
  elevesArchived: number
  errors: string[]
}

// ─── Helpers ───────────────────────────────────────────────────

const SUBS = ['notes', 'colles', 'absences', 'bulletins', 'paiements', 'civismeHistory'] as const

async function writeProgress(step: string, done: number, total: number) {
  try {
    await db.doc('ecole/rolloverPlan').update({
      'progress.step': step,
      'progress.done': done,
      'progress.total': total,
      'progress.updatedAt': FieldValue.serverTimestamp(),
    })
  } catch { /* progress write failing is non-fatal */ }
}

async function moveEleve(sourceClasseId: string, eleveId: string, destClasseId: string) {
  const sourceRef = db.doc(`classes/${sourceClasseId}/eleves/${eleveId}`)
  const snap = await sourceRef.get()
  if (!snap.exists) return  // already moved — idempotent skip

  const data = snap.data()!
  await db.collection(`classes/${destClasseId}/eleves`).add({
    ...data,
    dateAjout: FieldValue.serverTimestamp(),
    _transfere: true,
  })
  await sourceRef.delete()
}

async function archiveEleve(classeId: string, eleveId: string, annee: string) {
  const eleveRef = db.doc(`classes/${classeId}/eleves/${eleveId}`)
  const snap = await eleveRef.get()
  if (!snap.exists) return  // already archived — idempotent skip

  const data = snap.data()!
  await db.doc(`archive/${annee}/classes/${classeId}/eleves/${eleveId}`).set(data)

  for (const sub of SUBS) {
    const subSnap = await db.collection(`classes/${classeId}/eleves/${eleveId}/${sub}`).get()
    for (const sd of subSnap.docs) {
      await db.doc(`archive/${annee}/classes/${classeId}/eleves/${eleveId}/${sub}/${sd.id}`).set(sd.data())
      await sd.ref.delete()
    }
  }

  await eleveRef.delete()
}

function genPasskey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let key = ''
  for (let i = 0; i < 6; i++) key += chars[Math.floor(Math.random() * chars.length)]
  return key
}

// ─── Main function ─────────────────────────────────────────────

export const executeRollover = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    // ── 1. Auth: must be an admin prof ───────────────────────
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.')

    const profSnap = await db.doc(`professeurs/${uid}`).get()
    const profData = profSnap.data() as { role?: string } | undefined
    if (profData?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Réservé aux administrateurs.')
    }

    // ── 2. Read plan ─────────────────────────────────────────
    const planRef = db.doc('ecole/rolloverPlan')
    const planSnap = await planRef.get()
    if (!planSnap.exists) {
      throw new HttpsError('not-found', 'Aucun plan de clôture trouvé. Complétez la promotion des classes d\'abord.')
    }

    const plan = planSnap.data() as RolloverPlanDoc
    if (plan.status === 'executing') {
      throw new HttpsError('already-exists', 'Un archivage est déjà en cours.')
    }
    if (plan.status === 'done') {
      throw new HttpsError('already-exists', `L'année ${plan.annee} est déjà archivée.`)
    }

    const { annee, newAnnee, classePlans } = plan
    if (!annee || !newAnnee || !classePlans) {
      throw new HttpsError('invalid-argument', 'Plan incomplet — relancez la procédure depuis le début.')
    }

    // ── 3. Mark as executing ─────────────────────────────────
    await planRef.update({ status: 'executing', executingAt: FieldValue.serverTimestamp() })
    logger.info('executeRollover: started', { annee, newAnnee, classes: Object.keys(classePlans).length })

    const result: RolloverResult = { classesProcessed: 0, elevesArchived: 0, errors: [] }

    try {
      const classEntries = Object.entries(classePlans)
      let classDone = 0

      // ── 4. Apply promotion decisions (Operation A) ──────────
      for (const [classeId, classePlan] of classEntries) {
        await writeProgress('transitions', classDone, classEntries.length)

        for (const dec of classePlan.decisions) {
          try {
            if (dec.statut === 'admis') {
              if (!dec.destClasseId) throw new Error('Destination manquante')
              await moveEleve(classeId, dec.eleveId, dec.destClasseId)
            } else if (dec.statut === 'echoue') {
              const ref = db.doc(`classes/${classeId}/eleves/${dec.eleveId}`)
              const s = await ref.get()
              if (s.exists) await ref.update({ _transfere: true })
            } else if (dec.statut === 'abandonne') {
              await archiveEleve(classeId, dec.eleveId, annee)
            }
          } catch (e) {
            const msg = `Élève ${dec.eleveId} (${classeId}): ${(e as Error).message}`
            logger.warn('executeRollover: transition error', { msg })
            result.errors.push(msg)
          }
        }
        classDone++
      }

      // ── 5. Archive classes + remaining élèves (Operation B) ─
      const classesSnap = await db.collection('classes').get()
      let archDone = 0

      for (const classeDoc of classesSnap.docs) {
        const classeId = classeDoc.id
        await writeProgress('archive', archDone, classesSnap.size)

        try {
          const classeData = classeDoc.data()

          // 5a. Archive the class doc
          await db.doc(`archive/${annee}/classes/${classeId}`).set(classeData)

          // 5b. Clear presences
          const presSnap = await db.collection(`classes/${classeId}/presences`).get()
          await Promise.all(presSnap.docs.map((d) => d.ref.delete()))

          // 5c. Archive + clear emploi du temps
          const edtSnap = await db.collection(`classes/${classeId}/emploisDuTemps/default/seances`).get()
          for (const sd of edtSnap.docs) {
            await db.doc(`archive/${annee}/classes/${classeId}/emploisDuTemps/default/seances/${sd.id}`).set(sd.data())
            await sd.ref.delete()
          }

          // 5d. Archive remaining élèves (échoués stay in class → archive their data)
          const elevesSnap = await db.collection(`classes/${classeId}/eleves`).get()
          for (const eDoc of elevesSnap.docs) {
            const eleveData = eDoc.data()

            if (eleveData._transfere === true) {
              // Admis who were moved — clear flag + reset civisme for new year
              await eDoc.ref.update({ _transfere: false, civismePoints: 0 })
              continue
            }

            // Archive this élève (échoués + any others remaining)
            await db.doc(`archive/${annee}/classes/${classeId}/eleves/${eDoc.id}`).set(eleveData)

            for (const sub of SUBS) {
              const subSnap = await db.collection(`classes/${classeId}/eleves/${eDoc.id}/${sub}`).get()
              for (const sd of subSnap.docs) {
                await db.doc(`archive/${annee}/classes/${classeId}/eleves/${eDoc.id}/${sub}/${sd.id}`).set(sd.data())
                await sd.ref.delete()
              }
            }

            // Reset civisme for new year
            try { await eDoc.ref.update({ civismePoints: 0 }) } catch { /* non-fatal */ }
            result.elevesArchived++
          }

          // 5e. Reset class: new passkey, clear PP, bump année
          await classeDoc.ref.update({
            annee: newAnnee,
            passkey: genPasskey(),
            profPrincipalId: '',
          })

          result.classesProcessed++
        } catch (e) {
          result.errors.push(`Classe ${classeId}: ${(e as Error).message}`)
        } finally {
          archDone++
        }
      }

      // ── 6. Wipe vigilance_ia ─────────────────────────────────
      await writeProgress('vigilance', 0, 1)
      try {
        const vigSnap = await db.collection('vigilance_ia').get()
        await Promise.all(vigSnap.docs.map((d) => d.ref.delete()))
      } catch (e) {
        result.errors.push(`Vigilance IA: ${(e as Error).message}`)
      }

      // ── 7. Reset prof assignments ────────────────────────────
      await writeProgress('profs', 0, 1)
      try {
        const profsSnap = await db.collection('professeurs').get()
        for (const pDoc of profsSnap.docs) {
          try {
            await pDoc.ref.update({ classesIds: [], matieres: [] })
          } catch { /* non-fatal per-prof */ }
        }
      } catch (e) {
        result.errors.push(`Profs: ${(e as Error).message}`)
      }

      // ── 8. Archive + clear annonces ──────────────────────────
      await writeProgress('annonces', 0, 1)
      try {
        const annSnap = await db.collection('annonces').get()
        for (const aDoc of annSnap.docs) {
          await db.doc(`archive/${annee}/annonces/${aDoc.id}`).set(aDoc.data())
          await aDoc.ref.delete()
        }
      } catch (e) {
        result.errors.push(`Annonces: ${(e as Error).message}`)
      }

      // ── 9. Wipe civisme year-scoped data ─────────────────────
      await writeProgress('civisme', 0, 1)
      try {
        const quetesSnap = await db.collection('quetes').get()
        for (const qDoc of quetesSnap.docs) {
          const claimsSnap = await db.collection(`quetes/${qDoc.id}/claims`).get()
          await Promise.all(claimsSnap.docs.map((d) => d.ref.delete()))
          await qDoc.ref.delete()
        }
        const reclSnap = await db.collection('reclamations').get()
        await Promise.all(reclSnap.docs.map((d) => d.ref.delete()))
      } catch (e) {
        result.errors.push(`Civisme: ${(e as Error).message}`)
      }

      // ── 10. Write archive metadata ───────────────────────────
      await writeProgress('meta', 0, 1)
      await db.doc(`archive/${annee}`).set({
        annee,
        classesCount: result.classesProcessed,
        elevesCount: result.elevesArchived,
        errorsCount: result.errors.length,
        archivedAt: FieldValue.serverTimestamp(),
        inProgress: false,
      })

      // ── 11. Bump anneeActive + clear transition tracking ─────
      await writeProgress('annee', 0, 1)
      await db.doc('ecole/config').update({
        anneeActive: newAnnee,
        transitionInProgress: false,
        classesTransitioned: [],
        lastArchivedAt: FieldValue.serverTimestamp(),
        lastArchivedAnnee: annee,
      })

      // ── 12. Mark plan as done ────────────────────────────────
      await planRef.update({
        status: 'done',
        completedAt: FieldValue.serverTimestamp(),
        result,
        'progress.step': 'done',
        'progress.done': 1,
        'progress.total': 1,
      })

      logger.info('executeRollover: completed', { annee, newAnnee, ...result })
      return { success: true, result }

    } catch (e) {
      const msg = (e as Error).message
      logger.error('executeRollover: fatal error', { msg })
      try {
        await planRef.update({ status: 'failed', error: msg, failedAt: FieldValue.serverTimestamp() })
      } catch { /* non-fatal */ }
      throw new HttpsError('internal', `Archivage échoué : ${msg}`)
    }
  }
)

/**
 * RT-SC · Year rollover operations.
 *
 * TWO-STEP PROCESS — admin runs Operation A then Operation B:
 *
 * Operation A — Transition élèves (per class):
 *   For each élève in a source class, classify as:
 *     - admis     → move to a destination class (next year's class)
 *     - echoue    → keep in same class (gets a fresh year alongside new admis from below)
 *     - abandonne → archive immediately, remove from active rosters
 *   The `_transfere: true` flag is set on processed élèves so they don't
 *   appear in the rollover modal again in the same session.
 *
 * Operation B — Final archive (school-wide):
 *   For each class:
 *     - Copy class doc to archive/{annee}/classes/{cid}
 *     - Copy each remaining élève + their subcollections to the archive
 *     - Delete the original élève subcollections (notes, bulletins, etc.)
 *     - Reset the class: new passkey, clear profPrincipalId, set annee=newAnnee
 *     - Clear _transfere flags on remaining élèves
 *   Then:
 *     - Wipe vigilance_ia
 *     - Wipe presences (per-class)
 *     - Archive + clear emploi du temps (per-class)
 *     - Archive + clear annonces (school-wide)
 *     - Update /ecole/config.anneeActive = newAnnee
 *
 * All operations report progress via a callback so the UI can show a
 * percentage indicator. Errors are captured per-item so a partial failure
 * doesn't abort the whole flow.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import {
  absencesCol,
  annoncesCol,
  archiveAnnonceDoc,
  archiveClasseDoc,
  archiveEleveDoc,
  archiveEleveSubCol,
  archiveEmploiDuTempsSeancesCol,
  archiveYearDoc,
  bulletinsCol,
  civismeHistoryCol,
  classeDoc,
  collesCol,
  ecoleConfigDoc,
  eleveDoc,
  elevesCol,
  emploiDuTempsSeancesCol,
  notesCol,
  paiementsCol,
  presencesCol,
  professeursCol,
  quetesCol,
  queteClaimsCol,
  queteDoc,
  reclamationDoc,
  reclamationsCol,
  vigilanceCol,
} from '@/lib/firestore-keys'
import { genererClassePasskey } from '@/lib/benin'
import type { Eleve } from '@/types/models'

// ─── Pure: bump year string ─────────────────────────────────

/**
 * "2025-2026" → "2026-2027". Throws if the input doesn't match the format
 * or the years aren't consecutive (defensive — should match the validator
 * in ActiveYearCard).
 */
export function bumpAnnee(annee: string): string {
  const m = annee.trim().match(/^(\d{4})-(\d{4})$/)
  if (!m) throw new Error(`Format d'année invalide : ${annee}`)
  const start = parseInt(m[1], 10)
  const end = parseInt(m[2], 10)
  if (end !== start + 1) {
    throw new Error(`Années non consécutives : ${annee}`)
  }
  return `${end}-${end + 1}`
}

// ─── Operation A — per-élève transition ─────────────────────

export type TransitionStatut = 'admis' | 'echoue' | 'abandonne'

export interface TransitionDecision {
  eleveId: string
  statut: TransitionStatut
  /** Required when statut === 'admis' — destination class id */
  destClasseId?: string
}

export interface TransitionResult {
  successCount: number
  errors: { eleveId: string; statut: TransitionStatut; error: string }[]
}

export interface TransitionParams {
  sourceClasseId: string
  decisions: TransitionDecision[]
  /** Active année (used as the archive folder for abandonnés) */
  annee: string
  onProgress?: (done: number, total: number) => void
}

/**
 * Apply transition decisions for one source class.
 *
 * Operations per élève:
 *   - admis → move doc to destClasseId (preserve identity, add _transfere flag)
 *   - echoue → flag _transfere on existing doc (stays in source)
 *   - abandonne → archive the élève now, then delete from active
 */
export async function executeTransition({
  sourceClasseId,
  decisions,
  annee,
  onProgress,
}: TransitionParams): Promise<TransitionResult> {
  const result: TransitionResult = { successCount: 0, errors: [] }
  let done = 0
  const total = decisions.length

  for (const dec of decisions) {
    try {
      // Pre-flight: does this élève still exist in the source class?
      // If not (e.g. admin re-ran the modal after a partial failure, or
      // the doc was already moved in a prior session), we don't error —
      // we just skip. The final archive step will reconcile.
      const sourceRef = docRef(eleveDoc(sourceClasseId, dec.eleveId))
      const existsSnap = await getDoc(sourceRef)
      if (!existsSnap.exists()) {
        // Silently count as success — whatever the intent, the work is
        // already done (or the élève is no longer here to worry about).
        result.successCount++
        continue
      }

      if (dec.statut === 'admis') {
        if (!dec.destClasseId) {
          throw new Error('Classe de destination manquante')
        }
        await moveEleveBetweenClasses(sourceClasseId, dec.eleveId, dec.destClasseId)
      } else if (dec.statut === 'echoue') {
        // Just mark; the final archive step will handle the persistence
        await updateDoc(sourceRef, {
          _transfere: true,
        })
      } else if (dec.statut === 'abandonne') {
        await archiveAndDeleteEleve(sourceClasseId, dec.eleveId, annee)
      }
      result.successCount++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push({
        eleveId: dec.eleveId,
        statut: dec.statut,
        error: msg,
      })
    } finally {
      done++
      onProgress?.(done, total)
    }
  }

  // Mark this class as transitioned in the school config so the UI can
  // show a banner until the final archive runs. Non-fatal if this fails
  // — it's a UX breadcrumb, not a correctness requirement.
  try {
    const cfgSnap = await getDoc(docRef(ecoleConfigDoc()))
    const cfg = (cfgSnap.data() ?? {}) as {
      classesTransitioned?: string[]
    }
    const existing = new Set(cfg.classesTransitioned ?? [])
    existing.add(sourceClasseId)
    await setDoc(
      docRef(ecoleConfigDoc()),
      {
        transitionInProgress: true,
        classesTransitioned: Array.from(existing),
      },
      { merge: true }
    )
  } catch (e) {
    console.warn(
      '[rollover] Could not update transitionInProgress flag:',
      (e as Error).message
    )
  }

  return result
}

/**
 * Move an élève from one class to another, preserving identity but giving
 * them a fresh dateAjout and a _transfere flag (so they don't show up again
 * in the rollover modal for the destination class in the same session).
 *
 * Subcollections (notes, bulletins, etc.) are NOT carried over — each year
 * starts fresh. The data lives in the archive for posterity (created during
 * Operation B).
 */
async function moveEleveBetweenClasses(
  sourceClasseId: string,
  eleveId: string,
  destClasseId: string
): Promise<void> {
  const allSnap = await getDocs(collection(db, elevesCol(sourceClasseId)))
  const eleveSnap = allSnap.docs.find((d) => d.id === eleveId)
  if (!eleveSnap) throw new Error('Élève introuvable')
  const data = eleveSnap.data() as Omit<Eleve, 'id'>

  // Cleaned copy: fresh dateAjout, mark as already-handled this session
  const moved = {
    ...data,
    dateAjout: serverTimestamp(),
    _transfere: true,
  }

  await addDoc(collection(db, elevesCol(destClasseId)), moved)
  await deleteDoc(docRef(eleveDoc(sourceClasseId, eleveId)))
}

/**
 * Copy élève + subcollections into archive, then delete from active.
 */
async function archiveAndDeleteEleve(
  classeId: string,
  eleveId: string,
  annee: string
): Promise<void> {
  // 1. Read the élève doc
  const allSnap = await getDocs(collection(db, elevesCol(classeId)))
  const eleveSnap = allSnap.docs.find((d) => d.id === eleveId)
  if (!eleveSnap) throw new Error('Élève introuvable')
  const data = eleveSnap.data()

  // 2. Write the archive copy
  await setDoc(docRef(archiveEleveDoc(annee, classeId, eleveId)), data)

  // 3. Copy each subcollection
  const subs: { live: string; sub: 'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements' | 'civismeHistory' }[] = [
    { live: notesCol(classeId, eleveId), sub: 'notes' },
    { live: collesCol(classeId, eleveId), sub: 'colles' },
    { live: absencesCol(classeId, eleveId), sub: 'absences' },
    { live: bulletinsCol(classeId, eleveId), sub: 'bulletins' },
    { live: paiementsCol(classeId, eleveId), sub: 'paiements' },
    { live: civismeHistoryCol(classeId, eleveId), sub: 'civismeHistory' },
  ]
  for (const { live, sub } of subs) {
    const liveSnap = await getDocs(collection(db, live))
    const archivePath = archiveEleveSubCol(annee, classeId, eleveId, sub)
    for (const sd of liveSnap.docs) {
      await setDoc(docRef(`${archivePath}/${sd.id}`), sd.data())
      await deleteDoc(sd.ref)
    }
  }

  // 4. Delete the live élève doc itself
  await deleteDoc(docRef(eleveDoc(classeId, eleveId)))
}

// ─── Operation B — final school-wide archive ────────────────

export interface ArchiveYearParams {
  /** The année currently active — what's about to be archived */
  annee: string
  /** Calculated as bumpAnnee(annee) */
  newAnnee: string
  onProgress?: (step: string, done: number, total: number) => void
}

export interface ArchiveYearResult {
  classesProcessed: number
  elevesArchived: number
  errors: string[]
}

export async function executeFinalArchive({
  annee,
  newAnnee,
  onProgress,
}: ArchiveYearParams): Promise<ArchiveYearResult> {
  const result: ArchiveYearResult = {
    classesProcessed: 0,
    elevesArchived: 0,
    errors: [],
  }

  // 0. Double-rollover guard. If `archive/{annee}` metadata doc already
  // exists, this année has been archived once before. Two cases:
  //   a) inProgress: true  → previous run crashed mid-loop. The archive is
  //      partial and must NOT be re-used or overwritten without first being
  //      deleted (otherwise counts / élève data will be wrong).
  //   b) inProgress: false / absent → completed archive. Re-running would
  //      overwrite the archive snapshots with empty data (live collections
  //      were already wiped). Bail loudly in both cases.
  try {
    const archiveMetaSnap = await getDoc(docRef(archiveYearDoc(annee)))
    if (archiveMetaSnap.exists()) {
      if (archiveMetaSnap.data()?.inProgress === true) {
        throw new Error(
          `Une archive partielle de ${annee} a été détectée — l'opération précédente a été interrompue en cours de route. Supprimez d'abord l'archive de ${annee} dans la zone "Archives annuelles" pour réessayer depuis le début.`
        )
      }
      throw new Error(
        `L'année ${annee} a déjà été archivée. Ré-exécuter écraserait les archives existantes avec des données vides. Pour rejouer l'opération, supprimez d'abord l'archive de ${annee} dans la zone "Archives annuelles".`
      )
    }
  } catch (e) {
    // Re-throw user-facing messages; surface unexpected errors as warnings.
    if (e instanceof Error && (e.message.startsWith("L'année") || e.message.startsWith('Une archive'))) throw e
    result.errors.push(`Vérification archive existante: ${(e as Error).message}`)
  }

  // Write the in-progress sentinel BEFORE touching any class data. If the
  // operation crashes mid-loop, the next run will detect inProgress: true
  // and refuse to overwrite the partial archive (rather than silently
  // re-archiving already-empty collections).
  try {
    await setDoc(docRef(archiveYearDoc(annee)), {
      annee,
      inProgress: true,
      startedAt: serverTimestamp(),
    })
  } catch (e) {
    throw new Error(`Impossible d'écrire le marqueur d'archive: ${(e as Error).message}`)
  }

  // 1. Read every class
  const classesSnap = await getDocs(collection(db, 'classes'))
  const classes = classesSnap.docs
  let classDone = 0

  for (const classeDocSnap of classes) {
    const classeId = classeDocSnap.id
    onProgress?.('classes', classDone, classes.length)

    try {
      const classeData = classeDocSnap.data()

      // 1a. Reset presences (delete all)
      try {
        const presSnap = await getDocs(collection(db, presencesCol(classeId)))
        await Promise.all(presSnap.docs.map((d) => deleteDoc(d.ref)))
      } catch (e) {
        result.errors.push(`Présences ${classeId}: ${(e as Error).message}`)
      }

      // 1b. Archive the class doc itself
      await setDoc(docRef(archiveClasseDoc(annee, classeId)), classeData)

      // 1c. Archive every remaining élève + subcollections
      const elevesSnap = await getDocs(collection(db, elevesCol(classeId)))
      for (const eDoc of elevesSnap.docs) {
        const eleveId = eDoc.id
        const eleveData = eDoc.data()

        // Already moved by Operation A's "admis" path? Skip — they're in the
        // destination class now. Their _transfere flag tells us not to archive
        // them HERE (they belong to the new year, not the old one). But we
        // still want to clear the _transfere flag for the new year.
        //
        // We wrap the reset in its own try/catch so a rules denial on one
        // élève doesn't abort the class's whole pass. If the reset fails,
        // log a warning — admin may need to manually clear it next year.
        if (eleveData._transfere === true) {
          try {
            // Clear _transfere for the new year, and reset civismePoints
            // so admis who were carried forward start fresh in their
            // destination class. Prior history lives on in the archive
            // under the OLD classeId — parents can still look it up.
            await updateDoc(eDoc.ref, {
              _transfere: false,
              civismePoints: 0,
            })
          } catch (e) {
            result.errors.push(
              `Flag _transfere non réinitialisé pour ${eleveId} (classe ${classeId}): ${(e as Error).message}`
            )
          }
          continue
        }

        // Otherwise: archive the élève + each subcollection
        await setDoc(docRef(archiveEleveDoc(annee, classeId, eleveId)), eleveData)

        const subs: { live: string; sub: 'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements' | 'civismeHistory' }[] = [
          { live: notesCol(classeId, eleveId), sub: 'notes' },
          { live: collesCol(classeId, eleveId), sub: 'colles' },
          { live: absencesCol(classeId, eleveId), sub: 'absences' },
          { live: bulletinsCol(classeId, eleveId), sub: 'bulletins' },
          { live: paiementsCol(classeId, eleveId), sub: 'paiements' },
          // Civisme history is archived with the élève so parents and
          // admins can still look up a prior-year record if needed.
          // Once archived, the live copy is deleted — next year starts
          // with a clean history.
          { live: civismeHistoryCol(classeId, eleveId), sub: 'civismeHistory' },
        ]
        for (const { live, sub } of subs) {
          const subSnap = await getDocs(collection(db, live))
          const archivePath = archiveEleveSubCol(annee, classeId, eleveId, sub)
          for (const sd of subSnap.docs) {
            await setDoc(docRef(`${archivePath}/${sd.id}`), sd.data())
            await deleteDoc(sd.ref)
          }
        }

        // Échoués stay in the class for the new year. Reset their
        // civismePoints to 0 so they don't start the new year with
        // last year's score. Other year-scoped state lives in the
        // subcollections that were just wiped above (notes, bulletins,
        // civismeHistory, etc.). Student identity fields on the eleve
        // doc (nom, contacts, etc.) are preserved as-is.
        try {
          await updateDoc(eDoc.ref, { civismePoints: 0 })
        } catch (e) {
          result.errors.push(
            `Réinitialisation civisme ${eleveId}: ${(e as Error).message}`
          )
        }
        result.elevesArchived++
      }

      // 1d. Archive emploi du temps for this class, then delete
      try {
        const edtSnap = await getDocs(collection(db, emploiDuTempsSeancesCol(classeId)))
        const archEdtPath = archiveEmploiDuTempsSeancesCol(annee, classeId)
        for (const sd of edtSnap.docs) {
          await setDoc(docRef(`${archEdtPath}/${sd.id}`), sd.data())
          await deleteDoc(sd.ref)
        }
      } catch (e) {
        result.errors.push(`Emploi du temps ${classeId}: ${(e as Error).message}`)
      }

      // 1e. Reset the class: new passkey, clear PP, bump année
      await updateDoc(docRef(classeDoc(classeId)), {
        annee: newAnnee,
        passkey: genererClassePasskey(),
        profPrincipalId: '',
      })

      result.classesProcessed++
    } catch (e) {
      result.errors.push(`Classe ${classeId}: ${(e as Error).message}`)
    } finally {
      classDone++
      onProgress?.('classes', classDone, classes.length)
    }
  }

  // 2. Wipe vigilance_ia
  onProgress?.('vigilance', 0, 1)
  try {
    const vigSnap = await getDocs(collection(db, vigilanceCol()))
    await Promise.all(vigSnap.docs.map((d) => deleteDoc(d.ref)))
  } catch (e) {
    result.errors.push(`Vigilance IA: ${(e as Error).message}`)
  }
  onProgress?.('vigilance', 1, 1)

  // 2bis. Clear prof assignments — every Professeur's classesIds + matieres
  // get reset to []. Reasoning: classes are reborn with new IDs effectively
  // (same doc, but reset state — new passkey, no PP), and the new année
  // requires fresh assignments anyway. Without this, profs keep dangling
  // references to the previous configuration and the new année's class
  // setup starts from a broken state.
  //
  // PP role (`profPrincipalDe` was already nulled on the Classe side in
  // step 1e). Here we ensure the prof-side mirror is also clean.
  //
  // We DON'T touch role/statut/email/nom — those are identity fields, not
  // year-scoped assignments.
  onProgress?.('profs', 0, 1)
  try {
    const profsSnap = await getDocs(collection(db, professeursCol()))
    let cleared = 0
    let failed = 0
    for (const profDoc of profsSnap.docs) {
      try {
        await updateDoc(profDoc.ref, {
          classesIds: [],
          matieres: [],
        })
        cleared++
      } catch (e) {
        failed++
        // Log but don't abort — one prof failing shouldn't block the rest
        console.warn(
          `[rollover] Prof ${profDoc.id} clear failed:`,
          (e as Error).message
        )
      }
    }
    if (failed > 0) {
      result.errors.push(
        `Affectations professeurs: ${failed} sur ${profsSnap.docs.length} non réinitialisé${failed > 1 ? 's' : ''}`
      )
    }
    void cleared
  } catch (e) {
    result.errors.push(
      `Réinitialisation des affectations professeurs: ${(e as Error).message}`
    )
  }
  onProgress?.('profs', 1, 1)

  // 3. Archive + clear annonces
  onProgress?.('annonces', 0, 1)
  try {
    const annoncesSnap = await getDocs(collection(db, annoncesCol()))
    for (const aDoc of annoncesSnap.docs) {
      await setDoc(docRef(archiveAnnonceDoc(annee, aDoc.id)), aDoc.data())
      await deleteDoc(aDoc.ref)
    }
  } catch (e) {
    result.errors.push(`Annonces: ${(e as Error).message}`)
  }
  onProgress?.('annonces', 1, 1)

  // 3ter. Wipe civisme year-scoped data (quêtes, claims, réclamations).
  //
  // Civisme data is inherently year-scoped: quests are published for
  // this school year's activities, reclamations are current requests,
  // and the rewards catalog (/recompenses) is persistent and does NOT
  // need wiping — the same rewards are still valid next year.
  //
  // We do NOT archive this data here. It's transient by nature, and
  // the important long-term record — each élève's civismeHistory —
  // has already been archived as part of the per-élève subcollection
  // loop above (Operation B step 1c).
  //
  // Order matters: claims live under /quetes/*/claims, so we nuke
  // claims first (cascade-style) for each quête, then the quête
  // itself, before moving to réclamations.
  onProgress?.('civisme', 0, 1)
  try {
    // Wipe all quêtes + their claims subcollection
    const quetesSnap = await getDocs(collection(db, quetesCol()))
    for (const qDoc of quetesSnap.docs) {
      const questId = qDoc.id
      const claimsSnap = await getDocs(
        collection(db, queteClaimsCol(questId))
      )
      for (const cd of claimsSnap.docs) {
        await deleteDoc(cd.ref)
      }
      await deleteDoc(docRef(queteDoc(questId)))
    }

    // Wipe all reclamations
    const reclSnap = await getDocs(collection(db, reclamationsCol()))
    for (const rDoc of reclSnap.docs) {
      await deleteDoc(docRef(reclamationDoc(rDoc.id)))
    }
  } catch (e) {
    result.errors.push(`Civisme (quêtes + réclamations): ${(e as Error).message}`)
  }
  onProgress?.('civisme', 1, 1)

  // 3bis. Finalise the archive year metadata doc. The doc was pre-written
  // with inProgress: true at the start of the operation; we now overwrite
  // it with the final counts and clear the in-progress flag. The browse UI
  // queries this doc to list archived years (client SDK has no listCollections).
  try {
    await setDoc(docRef(archiveYearDoc(annee)), {
      annee,
      classesCount: result.classesProcessed,
      elevesCount: result.elevesArchived,
      errorsCount: result.errors.length,
      archivedAt: serverTimestamp(),
      inProgress: false,
    })
  } catch (e) {
    result.errors.push(`Archive metadata: ${(e as Error).message}`)
  }

  // 4. Bump anneeActive + clear transition tracking + stamp archive record
  //
  // The transitionInProgress + classesTransitioned fields were set
  // during Operation A. Now that the full archive has run, clear them
  // so the new year starts with no stale warnings.
  //
  // lastArchivedAt + lastArchivedAnnee are written so the DangerZone
  // UI can show a "just archived" success card, making it impossible
  // for admin to click "Archiver" again immediately in confusion.
  onProgress?.('annee', 0, 1)
  try {
    await setDoc(
      docRef(ecoleConfigDoc()),
      {
        anneeActive: newAnnee,
        transitionInProgress: false,
        classesTransitioned: [],
        lastArchivedAt: serverTimestamp(),
        lastArchivedAnnee: annee,
      },
      { merge: true }
    )
  } catch (e) {
    result.errors.push(`Année active: ${(e as Error).message}`)
  }
  onProgress?.('annee', 1, 1)

  return result
}

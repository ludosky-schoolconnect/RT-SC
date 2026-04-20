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
  bulletinsCol,
  classeDoc,
  collesCol,
  ecoleConfigDoc,
  eleveDoc,
  elevesCol,
  emploiDuTempsSeancesCol,
  notesCol,
  paiementsCol,
  presencesCol,
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
      if (dec.statut === 'admis') {
        if (!dec.destClasseId) {
          throw new Error('Classe de destination manquante')
        }
        await moveEleveBetweenClasses(sourceClasseId, dec.eleveId, dec.destClasseId)
      } else if (dec.statut === 'echoue') {
        // Just mark; the final archive step will handle the persistence
        await updateDoc(docRef(eleveDoc(sourceClasseId, dec.eleveId)), {
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
  const subs: { live: string; sub: 'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements' }[] = [
    { live: notesCol(classeId, eleveId), sub: 'notes' },
    { live: collesCol(classeId, eleveId), sub: 'colles' },
    { live: absencesCol(classeId, eleveId), sub: 'absences' },
    { live: bulletinsCol(classeId, eleveId), sub: 'bulletins' },
    { live: paiementsCol(classeId, eleveId), sub: 'paiements' },
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
        if (eleveData._transfere === true) {
          await updateDoc(eDoc.ref, { _transfere: false })
          continue
        }

        // Otherwise: archive the élève + each subcollection
        await setDoc(docRef(archiveEleveDoc(annee, classeId, eleveId)), eleveData)

        const subs: { live: string; sub: 'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements' }[] = [
          { live: notesCol(classeId, eleveId), sub: 'notes' },
          { live: collesCol(classeId, eleveId), sub: 'colles' },
          { live: absencesCol(classeId, eleveId), sub: 'absences' },
          { live: bulletinsCol(classeId, eleveId), sub: 'bulletins' },
          { live: paiementsCol(classeId, eleveId), sub: 'paiements' },
        ]
        for (const { live, sub } of subs) {
          const subSnap = await getDocs(collection(db, live))
          const archivePath = archiveEleveSubCol(annee, classeId, eleveId, sub)
          for (const sd of subSnap.docs) {
            await setDoc(docRef(`${archivePath}/${sd.id}`), sd.data())
            await deleteDoc(sd.ref)
          }
        }
        // NOTE: échoués stay in the class; we DON'T delete them. The cleared
        // _transfere flag is what marks them as "ready for the new year".
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

  // 4. Bump anneeActive
  onProgress?.('annee', 0, 1)
  try {
    await setDoc(
      docRef(ecoleConfigDoc()),
      { anneeActive: newAnnee },
      { merge: true }
    )
  } catch (e) {
    result.errors.push(`Année active: ${(e as Error).message}`)
  }
  onProgress?.('annee', 1, 1)

  return result
}

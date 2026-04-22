/**
 * RT-SC · Delete an archived year (hard delete, recursive).
 *
 * DANGER: this permanently wipes every document under /archive/{annee}/,
 * including all class snapshots, élève snapshots, every subcollection
 * (notes, bulletins, absences, paiements, colles), archived annonces,
 * and archived emplois du temps. No undo.
 *
 * Use cases this is meant for:
 *   - End-of-life cleanup (school is closing, archived data no longer
 *     needs retention)
 *   - Long-past years where legal retention window has expired
 *   - Correcting a mistaken archive (rarely)
 *
 * Use cases this is NOT for:
 *   - "Tidying up" — archived years should generally stay forever
 *   - Temporary deletion while fixing something — there's no undo
 *
 * The UI should gate this with a type-to-confirm + full count preview.
 *
 * Implementation: Firestore doesn't have a native recursive delete on
 * the client SDK. We walk the known tree structure layer by layer:
 *
 *   /archive/{annee}                          ← metadata doc
 *       /classes/{cid}                        ← class snapshot
 *           /eleves/{eid}                     ← élève snapshot
 *               /notes/*                      ← 5 subcollections
 *               /colles/*
 *               /absences/*
 *               /bulletins/*
 *               /paiements/*
 *       /annonces/{aid}
 *       /emploisDuTemps/{cid}/seances/*
 *
 * Deletes happen bottom-up so we never leave orphaned children if we
 * abort. Progress is reported per-doc-deleted so the UI can show
 * "N / total" progression.
 */

import { useMutation } from '@tanstack/react-query'
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  archiveAnnoncesCol,
  archiveClassesCol,
  archiveElevesCol,
  archiveEleveSubCol,
  archiveEmploiDuTempsSeancesCol,
  archiveYearDoc,
} from '@/lib/firestore-keys'

export interface DeleteArchivedYearProgress {
  stage: string  // human-readable current stage
  done: number   // docs deleted so far
  total: number  // estimated total to delete (grows as we discover)
}

export interface DeleteArchivedYearInput {
  annee: string
  onProgress?: (p: DeleteArchivedYearProgress) => void
}

const SUB_KINDS: Array<'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements'> = [
  'notes',
  'colles',
  'absences',
  'bulletins',
  'paiements',
]

export function useDeleteArchivedYear() {
  return useMutation({
    mutationFn: async (input: DeleteArchivedYearInput) => {
      const { annee, onProgress } = input
      let done = 0
      let total = 1 // metadata doc; grows as we discover

      function bump(stage: string) {
        done++
        onProgress?.({ stage, done, total })
      }

      // ─── Classes layer ────────────────────────────────────────
      onProgress?.({ stage: 'Lecture des classes', done, total })
      const classesSnap = await getDocs(collection(db, archiveClassesCol(annee)))
      total += classesSnap.docs.length

      for (const cDoc of classesSnap.docs) {
        const classeId = cDoc.id
        onProgress?.({
          stage: `Classe ${classeId}`,
          done,
          total,
        })

        // Élèves of this class
        const elevesSnap = await getDocs(
          collection(db, archiveElevesCol(annee, classeId))
        )
        total += elevesSnap.docs.length

        for (const eDoc of elevesSnap.docs) {
          const eleveId = eDoc.id

          // Subcollections
          for (const sub of SUB_KINDS) {
            const subPath = archiveEleveSubCol(annee, classeId, eleveId, sub)
            const subSnap = await getDocs(collection(db, subPath))
            total += subSnap.docs.length
            await Promise.all(
              subSnap.docs.map(async (sd) => {
                await deleteDoc(sd.ref)
                bump(`${sub} / ${eleveId}`)
              })
            )
          }

          // Élève doc itself
          await deleteDoc(eDoc.ref)
          bump(`Élève ${eleveId}`)
        }

        // Emploi du temps for this class
        const edtPath = archiveEmploiDuTempsSeancesCol(annee, classeId)
        const edtSnap = await getDocs(collection(db, edtPath))
        total += edtSnap.docs.length
        await Promise.all(
          edtSnap.docs.map(async (sd) => {
            await deleteDoc(sd.ref)
            bump('Emploi du temps')
          })
        )

        // Class doc itself
        await deleteDoc(cDoc.ref)
        bump(`Classe ${classeId}`)
      }

      // ─── Annonces ─────────────────────────────────────────────
      onProgress?.({ stage: 'Annonces', done, total })
      const annoncesSnap = await getDocs(collection(db, archiveAnnoncesCol(annee)))
      total += annoncesSnap.docs.length
      await Promise.all(
        annoncesSnap.docs.map(async (aDoc) => {
          await deleteDoc(aDoc.ref)
          bump('Annonce')
        })
      )

      // ─── Metadata doc ─────────────────────────────────────────
      onProgress?.({ stage: 'Métadonnées', done, total })
      await deleteDoc(doc(db, archiveYearDoc(annee)))
      bump('Métadonnées')

      onProgress?.({ stage: 'Terminé', done, total })
      return { deleted: done }
    },
  })
}

/**
 * Pre-flight count — walks the tree and returns counts for the confirm
 * dialog. Cheaper than full deletion; called once before we ask admin
 * to type the year.
 */
export async function countArchivedYearDocs(annee: string): Promise<{
  classes: number
  eleves: number
  bulletins: number
  notes: number
  absences: number
  paiements: number
  colles: number
  annonces: number
  seances: number
}> {
  const classesSnap = await getDocs(collection(db, archiveClassesCol(annee)))
  let eleves = 0
  let bulletins = 0
  let notes = 0
  let absences = 0
  let paiements = 0
  let colles = 0
  let seances = 0

  for (const cDoc of classesSnap.docs) {
    const classeId = cDoc.id
    const elevesSnap = await getDocs(
      collection(db, archiveElevesCol(annee, classeId))
    )
    eleves += elevesSnap.docs.length

    await Promise.all(
      elevesSnap.docs.map(async (eDoc) => {
        const eleveId = eDoc.id
        const counts = await Promise.all(
          SUB_KINDS.map(async (sub) => {
            const s = await getDocs(
              collection(db, archiveEleveSubCol(annee, classeId, eleveId, sub))
            )
            return { sub, n: s.docs.length }
          })
        )
        for (const { sub, n } of counts) {
          if (sub === 'bulletins') bulletins += n
          else if (sub === 'notes') notes += n
          else if (sub === 'absences') absences += n
          else if (sub === 'paiements') paiements += n
          else if (sub === 'colles') colles += n
        }
      })
    )

    const edtSnap = await getDocs(
      collection(db, archiveEmploiDuTempsSeancesCol(annee, classeId))
    )
    seances += edtSnap.docs.length
  }

  const annoncesSnap = await getDocs(collection(db, archiveAnnoncesCol(annee)))

  return {
    classes: classesSnap.docs.length,
    eleves,
    bulletins,
    notes,
    absences,
    paiements,
    colles,
    annonces: annoncesSnap.docs.length,
    seances,
  }
}

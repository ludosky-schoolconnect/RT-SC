/**
 * RT-SC · Notes — read + write hooks.
 *
 * Notes are stored at /classes/{cid}/eleves/{eid}/notes/{noteId}
 * One doc per (élève × matière × période). The note id encodes the
 * matière + period for stable upserts (avoid creating duplicates if the
 * same note is "edited" twice).
 *
 * Two read patterns:
 *   1. useEleveNotes(cid, eid)              — all notes for one élève
 *   2. useNotesPourMatierePeriode(cid, ...) — all élèves' notes for
 *      one matière in one period (the note-entry grid)
 *
 * Periods come from BulletinConfig (Trimestre 1/2/3 or Semestre 1/2).
 */

import { useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import { notesCol } from '@/lib/firestore-keys'
import { safeMatiereId } from '@/lib/benin'
import {
  moyenneInterros as computeMoyenneInterros,
  moyenneMatiere as computeMoyenneMatiere,
} from '@/lib/bulletin'
import type { Note, Periode } from '@/types/models'

const FIVE_MIN = 5 * 60_000

/**
 * Stable note id: "{periodSlug}_{matiereSafe}".
 * Period gets slugged because it can contain spaces (e.g. "Trimestre 1").
 */
export function noteIdFor(periode: Periode, matiere: string): string {
  const periodSlug = periode.replace(/\s+/g, '-')
  return `${periodSlug}_${safeMatiereId(matiere)}`
}

// ─── All notes for one élève (live snapshot) ────────────────

export function useEleveNotes(classeId: string | undefined, eleveId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      collection(db, notesCol(classeId, eleveId)),
      (snap) => {
        const list: (Note & { id: string })[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Note),
        }))
        qc.setQueryData(['notes', classeId, eleveId], list)
      },
      (err) => console.error('[useEleveNotes] snapshot error:', err)
    )
    return unsub
  }, [classeId, eleveId, qc])

  return useQuery<(Note & { id: string })[]>({
    queryKey: ['notes', classeId ?? 'none', eleveId ?? 'none'],
    enabled: !!classeId && !!eleveId,
    queryFn: async () =>
      qc.getQueryData<(Note & { id: string })[]>(['notes', classeId, eleveId]) ?? [],
    staleTime: FIVE_MIN,
  })
}

// ─── All notes for one matière+période across all élèves of a class ─

/**
 * Used by the note-entry grid. Live snapshot per élève would be too
 * many subscriptions; instead we use a single collectionGroup query.
 *
 * NOTE: requires a Firestore composite index. The error message will
 * include a one-click create-index URL the first time the query runs.
 */
export function useNotesPourMatierePeriode(args: {
  classeId: string | undefined
  matiere: string | undefined
  periode: Periode | undefined
}) {
  const { classeId, matiere, periode } = args
  const qc = useQueryClient()

  const enabled = !!classeId && !!matiere && !!periode

  useEffect(() => {
    if (!enabled) return
    // Need to filter to one class. We use the parent path constraint via
    // a collection (not collectionGroup) since notes always live under
    // /classes/{cid}/eleves/{eid}/notes — and we want only this cid.
    // Without knowing eleve ids upfront we can't query the subcollection
    // directly, so we fall back to a collectionGroup with filters. This
    // requires an index on (matiere, periode) — see firestore.indexes.json.
    const q = query(
      collectionGroup(db, 'notes'),
      where('matiere', '==', matiere),
      where('periode', '==', periode)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Filter client-side to this class (parent.parent.parent.id === classeId).
        // collectionGroup matches across all classes; we discard others.
        const list: { eleveId: string; note: Note & { id: string } }[] = []
        for (const d of snap.docs) {
          // path: classes/{cid}/eleves/{eid}/notes/{nid}
          const parts = d.ref.path.split('/')
          const cid = parts[1]
          const eid = parts[3]
          if (cid !== classeId) continue
          list.push({
            eleveId: eid,
            note: { id: d.id, ...(d.data() as Note) },
          })
        }
        qc.setQueryData(
          ['notes-grid', classeId, matiere, periode],
          list
        )
      },
      (err) => console.error('[useNotesPourMatierePeriode] snapshot error:', err)
    )
    return unsub
  }, [enabled, classeId, matiere, periode, qc])

  return useQuery<{ eleveId: string; note: Note & { id: string } }[]>({
    queryKey: [
      'notes-grid',
      classeId ?? 'none',
      matiere ?? 'none',
      periode ?? 'none',
    ],
    enabled,
    queryFn: async () =>
      qc.getQueryData<{ eleveId: string; note: Note & { id: string } }[]>(
        ['notes-grid', classeId, matiere, periode]
      ) ?? [],
    staleTime: FIVE_MIN,
  })
}

// ─── Save / update one note ─────────────────────────────────

export interface SaveNoteInput {
  classeId: string
  eleveId: string
  matiere: string
  periode: Periode
  interros: number[]
  devoir1: number | null
  devoir2: number | null
  professeurId?: string
  /** When true, also closes the note (estCloture: true, computes moyennes) */
  cloturer?: boolean
  /**
   * When true, marks this élève as abandoning this matière for this period.
   * Stored as `abandonne: true` on the Note doc. The bulletin engine skips
   * abandoned matières when computing moyenneGenerale.
   */
  abandonne?: boolean
}

export function useSaveNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveNoteInput) => {
      const id = noteIdFor(input.periode, input.matiere)
      const mi = computeMoyenneInterros(input.interros)
      const mm = computeMoyenneMatiere({
        moyenneInterros: mi,
        devoir1: input.devoir1,
        devoir2: input.devoir2,
      })

      const noteData: Partial<Note> & { updatedAt: ReturnType<typeof serverTimestamp> } = {
        matiere: input.matiere,
        periode: input.periode,
        interros: input.interros,
        devoir1: input.devoir1,
        devoir2: input.devoir2,
        moyenneInterros: input.cloturer ? mi : null,
        moyenneMatiere: input.cloturer ? mm : null,
        estCloture: input.cloturer === true,
        professeurId: input.professeurId ?? '',
        updatedAt: serverTimestamp(),
      }
      // Only write the abandonne field when explicitly provided. Autosave
      // (which never passes it) must NOT clobber a previously-set abandon
      // flag — that would silently un-abandon an élève just by typing.
      if (input.abandonne !== undefined) {
        noteData.abandonne = input.abandonne
      }

      await setDoc(
        docRef(`${notesCol(input.classeId, input.eleveId)}/${id}`),
        noteData,
        { merge: true }
      )
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['notes', vars.classeId, vars.eleveId] })
      qc.invalidateQueries({
        queryKey: ['notes-grid', vars.classeId, vars.matiere, vars.periode],
      })
    },
  })
}

// ─── PP unlock ─────────────────────────────────────────────

import { writeBatch, doc as fsDoc } from 'firebase/firestore'

export interface UnlockMatiereInput {
  classeId: string
  matiere: string
  periode: Periode
  eleveIds: string[]
}

/**
 * Sets `estCloture: false` on every élève's note for one (class, matière,
 * period). Also resets the computed moyennes since the data may change.
 *
 * Used by the PP cross-matière dashboard to undo a prof's closure.
 * Doesn't touch the abandonne flag — that decision stands.
 *
 * Atomic via a Firestore batch (capped at 500 ops; one note per élève
 * means a class up to 500 fits).
 */
export function useUnlockMatiere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UnlockMatiereInput) => {
      const batch = writeBatch(db)
      for (const eleveId of input.eleveIds) {
        const id = noteIdFor(input.periode, input.matiere)
        const path = `${notesCol(input.classeId, eleveId)}/${id}`
        batch.set(
          fsDoc(db, path),
          {
            estCloture: false,
            moyenneInterros: null,
            moyenneMatiere: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      }
      await batch.commit()
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ['notes-grid', vars.classeId, vars.matiere, vars.periode],
      })
      qc.invalidateQueries({
        queryKey: ['notes-class-period', vars.classeId, vars.periode],
      })
      for (const eid of vars.eleveIds) {
        qc.invalidateQueries({ queryKey: ['notes', vars.classeId, eid] })
      }
    },
  })
}

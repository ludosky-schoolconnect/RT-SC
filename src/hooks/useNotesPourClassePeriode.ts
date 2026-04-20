/**
 * RT-SC · All notes for one class × period, across every matière.
 *
 * Used by the PP cross-matière dashboard (Bulletins mode) to show a grid
 * of (élève × matière) cells.
 *
 * Implementation: collectionGroup query on `notes` filtered by `periode`,
 * then client-side filter to this class's eleve subcollection by parent
 * path. Same pattern as useNotesPourMatierePeriode but without the
 * matière filter.
 *
 * Requires a Firestore composite index — see firestore.indexes.json.
 * If the index doesn't exist yet, the query will throw with a one-click
 * URL to create it (Firebase prints this in the browser console).
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/firebase'
import type { Note, Periode } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export interface NotesByMatiere {
  /** Map: matiere -> map of eleveId -> Note doc */
  byMatiereByEleve: Record<string, Record<string, Note & { id: string }>>
  /** Distinct matière names found in the notes */
  matieresPresentes: string[]
}

export function useNotesPourClassePeriode(args: {
  classeId: string | undefined
  periode: Periode | undefined
}) {
  const { classeId, periode } = args
  const qc = useQueryClient()

  const enabled = !!classeId && !!periode

  useEffect(() => {
    if (!enabled) return
    const q = query(
      collectionGroup(db, 'notes'),
      where('periode', '==', periode)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const byMatiereByEleve: Record<string, Record<string, Note & { id: string }>> = {}
        const matieresSet = new Set<string>()
        for (const d of snap.docs) {
          // path: classes/{cid}/eleves/{eid}/notes/{nid}
          const parts = d.ref.path.split('/')
          const cid = parts[1]
          const eid = parts[3]
          if (cid !== classeId) continue
          const note = { id: d.id, ...(d.data() as Note) }
          const m = note.matiere
          if (!m) continue
          matieresSet.add(m)
          if (!byMatiereByEleve[m]) byMatiereByEleve[m] = {}
          byMatiereByEleve[m][eid] = note
        }
        const result: NotesByMatiere = {
          byMatiereByEleve,
          matieresPresentes: Array.from(matieresSet).sort((a, b) =>
            a.localeCompare(b, 'fr')
          ),
        }
        qc.setQueryData(['notes-class-period', classeId, periode], result)
      },
      (err) =>
        console.error('[useNotesPourClassePeriode] snapshot error:', err)
    )
    return unsub
  }, [enabled, classeId, periode, qc])

  return useQuery<NotesByMatiere>({
    queryKey: [
      'notes-class-period',
      classeId ?? 'none',
      periode ?? 'none',
    ],
    enabled,
    queryFn: async () =>
      qc.getQueryData<NotesByMatiere>(['notes-class-period', classeId, periode]) ?? {
        byMatiereByEleve: {},
        matieresPresentes: [],
      },
    staleTime: FIVE_MIN,
  })
}

/**
 * RT-SC · School-wide élèves — flat list across every class.
 *
 * Uses a collectionGroup query on `eleves` to fetch every élève in the
 * school in one round-trip. Each returned record carries the parent
 * classeId (extracted from the doc path) so callers can navigate to
 * the classe or write paiements under the correct path.
 *
 * Used by the Finances tab to power a school-wide élève search (cashier
 * needs to find "KPETA Marie" without first knowing her class).
 *
 * NOT live — this is a one-shot getDocs. School rosters don't change
 * mid-session frequently enough to justify N class snapshots running
 * in parallel. Cached for 5 minutes.
 *
 * Security: collectionGroup('eleves') must be allowlisted in
 * firestore.rules:
 *   match /{path=**}/eleves/{eleveId} { allow read: if isStaff(); }
 * (Already in place — same rule used by signup and parent login.)
 */

import { useQuery } from '@tanstack/react-query'
import { collectionGroup, getDocs, query } from 'firebase/firestore'
import { db } from '@/firebase'
import type { Eleve } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export interface EleveWithClasse extends Eleve {
  /** Extracted from doc.ref.parent.parent.id (the classe doc). */
  classeId: string
}

export function useAllEleves() {
  return useQuery<EleveWithClasse[]>({
    queryKey: ['eleves', 'all'],
    queryFn: async () => {
      const snap = await getDocs(query(collectionGroup(db, 'eleves')))

      const list: EleveWithClasse[] = []
      for (const d of snap.docs) {
        // The collectionGroup matches archive élèves too. parseLiveElevePath
        // returns null for those (and for any other non-live shape), giving
        // us a single canonical filter consistent with absence triage.
        // Note: the eleve doc path is `classes/{cid}/eleves/{eid}` (4 segs),
        // not the 6-segment subcollection shape, so we DON'T pass subColName.
        const parts = d.ref.path.split('/')
        if (parts.length !== 4) continue
        if (parts[0] !== 'classes' || parts[2] !== 'eleves') continue
        const classeId = parts[1]
        if (!classeId) continue

        list.push({
          id: d.id,
          classeId,
          ...(d.data() as Omit<Eleve, 'id'>),
        })
      }

      list.sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
      return list
    },
    staleTime: FIVE_MIN,
  })
}

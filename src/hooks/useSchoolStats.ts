/**
 * RT-SC · School live counts.
 *
 * Uses Firestore's `getCountFromServer` aggregation — costs ONE read per
 * collection regardless of how many documents are inside. Far cheaper than
 * fetching all docs and counting in JS.
 *
 * Cached for 2 minutes via TanStack Query so the welcome page doesn't
 * re-hit Firestore on every visit.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, collectionGroup, getCountFromServer } from 'firebase/firestore'
import { db } from '@/firebase'

interface SchoolStats {
  classes: number
  eleves: number
  professeurs: number
}

async function fetchSchoolStats(): Promise<SchoolStats> {
  const [classesSnap, elevesSnap, profsSnap] = await Promise.all([
    getCountFromServer(collection(db, 'classes')),
    getCountFromServer(collectionGroup(db, 'eleves')),
    getCountFromServer(collection(db, 'professeurs')),
  ])

  return {
    classes: classesSnap.data().count,
    eleves: elevesSnap.data().count,
    professeurs: profsSnap.data().count,
  }
}

export function useSchoolStats() {
  return useQuery<SchoolStats>({
    queryKey: ['school-stats'],
    queryFn: fetchSchoolStats,
    staleTime: 2 * 60_000,
  })
}

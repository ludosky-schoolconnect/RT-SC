/**
 * RT-SC · School live counts.
 *
 * Uses Firestore's `getCountFromServer` aggregation — costs ONE read per
 * collection regardless of how many documents are inside. Far cheaper than
 * fetching all docs and counting in JS.
 *
 * Filters to the CURRENT school year so old/archived classes and their
 * students are excluded from the welcome-page display.
 *
 * Flow:
 *   1. Read /ecole/config to get anneeActive (e.g. "2026-2027")
 *   2. Count /classes where annee == anneeActive
 *   3. Count /classes/{id}/eleves sub-collections for each active class
 *      using getCountFromServer per class then sum
 *
 * Works on the unauthenticated welcome page — /ecole/* and /classes/*
 * are publicly readable per security rules.
 *
 * Cached for 2 minutes via TanStack Query.
 */

import { useQuery } from '@tanstack/react-query'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/firebase'

interface SchoolStats {
  classes: number
  eleves: number
}

async function safeCount(
  q: Parameters<typeof getCountFromServer>[0]
): Promise<number> {
  try {
    const snap = await getCountFromServer(q)
    return snap.data().count
  } catch (err) {
    console.warn('[useSchoolStats] count failed, returning 0:', err)
    return 0
  }
}

async function fetchSchoolStats(): Promise<SchoolStats> {
  // Always enumerate /classes directly — collectionGroup('eleves') would
  // also count students in /archive/.../eleves, inflating the total.
  const classSnap = await getDocs(collection(db, 'classes'))

  // If anneeActive is configured, filter to the current year only.
  let filteredDocs = classSnap.docs
  try {
    const configSnap = await getDoc(doc(db, 'ecole', 'config'))
    if (configSnap.exists()) {
      const anneeActive = (configSnap.data() as { anneeActive?: string }).anneeActive
      if (anneeActive) {
        filteredDocs = classSnap.docs.filter(
          (d) => (d.data() as { annee?: string }).annee === anneeActive
        )
      }
    }
  } catch {
    // Config unreadable — use all classes as-is
  }

  const counts = await Promise.all(
    filteredDocs.map((d) => safeCount(collection(db, 'classes', d.id, 'eleves')))
  )

  return {
    classes: filteredDocs.length,
    eleves: counts.reduce((sum, n) => sum + n, 0),
  }
}

export function useSchoolStats() {
  return useQuery<SchoolStats>({
    queryKey: ['school-stats'],
    queryFn: fetchSchoolStats,
    staleTime: 2 * 60_000,
    retry: false,
  })
}

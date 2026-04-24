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
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
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
  // Read the current school year from /ecole/config
  let anneeActive: string | null = null
  try {
    const configSnap = await getDoc(doc(db, 'ecole', 'config'))
    if (configSnap.exists()) {
      anneeActive = (configSnap.data() as { anneeActive?: string }).anneeActive ?? null
    }
  } catch {
    // /ecole/config unreadable — fall back to unfiltered counts below
  }

  if (!anneeActive) {
    // Fallback: no year info, count everything (legacy behaviour)
    const [classes, eleves] = await Promise.all([
      safeCount(collection(db, 'classes')),
      safeCount(collectionGroup(db, 'eleves')),
    ])
    return { classes, eleves }
  }

  // Count classes for the active year
  const classesQuery = query(
    collection(db, 'classes'),
    where('annee', '==', anneeActive)
  )
  const classesCount = await safeCount(classesQuery)

  // Count eleves only from active-year classes (avoids archived students)
  let elevesCount = 0
  try {
    const classSnap = await getDocs(classesQuery)
    const counts = await Promise.all(
      classSnap.docs.map((d) =>
        safeCount(collection(db, 'classes', d.id, 'eleves'))
      )
    )
    elevesCount = counts.reduce((sum, n) => sum + n, 0)
  } catch (err) {
    console.warn('[useSchoolStats] eleves count failed:', err)
  }

  return { classes: classesCount, eleves: elevesCount }
}

export function useSchoolStats() {
  return useQuery<SchoolStats>({
    queryKey: ['school-stats'],
    queryFn: fetchSchoolStats,
    staleTime: 2 * 60_000,
    retry: false,
  })
}

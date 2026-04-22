/**
 * RT-SC · School live counts.
 *
 * Uses Firestore's `getCountFromServer` aggregation — costs ONE read per
 * collection regardless of how many documents are inside. Far cheaper than
 * fetching all docs and counting in JS.
 *
 * Only counts collections that are publicly readable (rules `allow read: if
 * true`) so this hook works on the unauthenticated welcome page:
 *   - /classes (public)
 *   - /{path}/eleves (public via collection group)
 *
 * Each count is wrapped in safeCount() so a failure on one doesn't kill
 * the other. Missing values surface as 0.
 *
 * Cached for 2 minutes via TanStack Query.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, collectionGroup, getCountFromServer } from 'firebase/firestore'
import { db } from '@/firebase'

interface SchoolStats {
  classes: number
  eleves: number
}

async function safeCount(
  query: ReturnType<typeof collection> | ReturnType<typeof collectionGroup>
): Promise<number> {
  try {
    const snap = await getCountFromServer(query)
    return snap.data().count
  } catch (err) {
    console.warn('[useSchoolStats] count failed, returning 0:', err)
    return 0
  }
}

async function fetchSchoolStats(): Promise<SchoolStats> {
  const [classes, eleves] = await Promise.all([
    safeCount(collection(db, 'classes')),
    safeCount(collectionGroup(db, 'eleves')),
  ])

  return { classes, eleves }
}

export function useSchoolStats() {
  return useQuery<SchoolStats>({
    queryKey: ['school-stats'],
    queryFn: fetchSchoolStats,
    staleTime: 2 * 60_000,
    retry: false,
  })
}

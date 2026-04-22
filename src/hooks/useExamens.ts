/**
 * RT-SC · Exam countdowns — read + write hooks.
 *
 * Doc lives at /ecole/examens. Public read per rules (displayed on
 * authenticated dashboards only, but rule-level public is fine since
 * this is non-sensitive school-wide data). Admin-only write.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { ecoleExamensDoc } from '@/lib/firestore-keys'
import type { ExamCountdown, ExamensConfig } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useExamens() {
  return useQuery<ExamCountdown[]>({
    queryKey: ['examens'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, ecoleExamensDoc()))
      if (!snap.exists()) return []
      const data = snap.data() as Partial<ExamensConfig>
      return Array.isArray(data.examens) ? data.examens : []
    },
    staleTime: FIVE_MIN,
  })
}

export function useUpdateExamens() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (examens: ExamCountdown[]) => {
      await setDoc(
        doc(db, ecoleExamensDoc()),
        { examens } satisfies ExamensConfig,
        { merge: true }
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examens'] })
    },
  })
}

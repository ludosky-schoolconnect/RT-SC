/**
 * RT-SC · useBulletinObservations — mutation.
 *
 * Writes the Bulletin v2 editor-authored fields to
 * /classes/{classeId}/eleves/{eleveId}/bulletins/{periode}:
 *   - observationsChef  : free-text, ≤ 500 chars (UI-enforced)
 *   - decisionConseil   : one of 5 mentions, or undefined to clear
 *
 * Both fields are optional on the Bulletin doc — this mutation does a
 * merge write so it never clobbers unrelated fields (rang, moyenneGenerale,
 * locks, etc.). The Firestore Security Rules scope this write to admin +
 * the class's professeur principal; a non-PP prof attempting to call this
 * will be rejected server-side.
 *
 * Cache invalidation: we invalidate the `bulletin-view-period-base` query
 * key so the open detail modal refreshes automatically after a save.
 * Other bulletins-tab lists are unaffected because their own read hooks
 * don't carry these fields.
 *
 * Clearing: passing `undefined` for either field writes `null` via
 * deleteField() so Firestore drops the property entirely — that way
 * an "Aucune décision" selection truly removes the field rather than
 * leaving a stale string on the doc.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteField, setDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { bulletinDoc } from '@/lib/firestore-keys'
import type { DecisionConseil, Periode } from '@/types/models'

export interface UpdateBulletinObservationsInput {
  classeId: string
  eleveId: string
  periode: Periode
  /** Trimmed observations text. Empty string clears the field. */
  observationsChef: string
  /** Chosen decision, or undefined to clear. */
  decisionConseil: DecisionConseil | undefined
}

export function useUpdateBulletinObservations() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      classeId,
      eleveId,
      periode,
      observationsChef,
      decisionConseil,
    }: UpdateBulletinObservationsInput) => {
      // Build the patch so that empty values *remove* the field rather
      // than storing ''. Clean, predictable reads everywhere downstream.
      const patch: {
        observationsChef: string | ReturnType<typeof deleteField>
        decisionConseil: DecisionConseil | ReturnType<typeof deleteField>
      } = {
        observationsChef: observationsChef.trim().length
          ? observationsChef.trim()
          : deleteField(),
        decisionConseil: decisionConseil ?? deleteField(),
      }

      await setDoc(
        docRef(bulletinDoc(classeId, eleveId, periode)),
        patch,
        { merge: true }
      )
    },
    onSettled: (_data, _err, vars) => {
      // Invalidate the right read hook based on whether this was a
      // period or annual bulletin write. The two views use different
      // query keys (Session 3 left them deliberately separate so a
      // period-only update doesn't refetch all annual computations).
      if (vars.periode === 'Année') {
        qc.invalidateQueries({
          queryKey: ['bulletin-view-annual', vars.classeId, vars.eleveId],
        })
      } else {
        qc.invalidateQueries({
          queryKey: [
            'bulletin-view-period-base',
            vars.classeId,
            vars.eleveId,
            vars.periode,
          ],
        })
      }
      // The compact bulletin list on BulletinsTab reads a different key; we
      // don't need to touch it because it doesn't surface these fields.
    },
  })
}

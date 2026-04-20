/**
 * RT-SC · Matières globales — read + write hooks.
 *
 * The school maintains one canonical list of subjects taught.
 * Lives at /ecole/matieres = { liste: ['Mathématiques', ...] }.
 *
 * Used by:
 *   - Coefficients editor (dropdown of matières)
 *   - Note entry (which matières apply to the selected class)
 *   - Prof signup (multi-select of matières they teach)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  deleteField,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import { ecoleMatieresDoc } from '@/lib/firestore-keys'
import type { MatieresGlobales } from '@/types/models'

const TEN_MIN = 10 * 60_000

/**
 * Returns the matières as a sorted, deduplicated array.
 * Empty array (never null) when no doc exists yet.
 */
export function useMatieres() {
  return useQuery<string[]>({
    queryKey: ['ecole', 'matieres'],
    queryFn: async () => {
      const snap = await getDoc(docRef(ecoleMatieresDoc()))
      if (!snap.exists()) return []
      const data = snap.data() as Partial<MatieresGlobales>
      const raw = Array.isArray(data.liste) ? data.liste : []
      const cleaned = Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean)))
      cleaned.sort((a, b) => a.localeCompare(b, 'fr'))
      return cleaned
    },
    staleTime: TEN_MIN,
  })
}

export function useUpdateMatieres() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (liste: string[]) => {
      const cleaned = Array.from(
        new Set(liste.map((s) => s.trim()).filter(Boolean))
      )
      cleaned.sort((a, b) => a.localeCompare(b, 'fr'))
      await setDoc(docRef(ecoleMatieresDoc()), { liste: cleaned })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'matieres'] })
    },
  })
}

/**
 * Remove a matière from the global list AND from every (niveau, série)
 * coefficient doc. Atomic via Firestore batched write.
 *
 * This is THE correct way to delete a matière. The previous flow (admin
 * removed from local draft + saved global list) left orphan coefficient
 * entries that ghosted in the PP cross-matière dashboard.
 *
 * Notes already saved with this matière are NOT touched (they remain in
 * Firestore but won't appear in any new bulletin since the coefficient
 * entry is gone). To remove old notes, that's a separate operation.
 *
 * Doesn't touch the `Conduite` key — it's the one matière you can't
 * remove via this UI (see CONDUITE_GUARD in caller).
 */
export function useRemoveMatiere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (matiere: string) => {
      const trimmed = matiere.trim()
      if (!trimmed || trimmed === 'Conduite') {
        throw new Error('Matière invalide ou protégée')
      }

      // 1. Read current matières list, drop the target
      const matieresSnap = await getDoc(docRef(ecoleMatieresDoc()))
      const data = matieresSnap.exists()
        ? (matieresSnap.data() as Partial<MatieresGlobales>)
        : { liste: [] }
      const currentList = Array.isArray(data.liste) ? data.liste : []
      const nextList = currentList.filter((m) => m !== trimmed)

      // 2. Find every coefficient doc and remove the key if present
      const ecoleSnap = await getDocs(collection(db, 'ecole'))
      const coefDocs = ecoleSnap.docs.filter((d) =>
        d.id.startsWith('coefficients_')
      )

      // 3. Single batch — list update + every coef doc that has the key
      const batch = writeBatch(db)
      batch.set(docRef(ecoleMatieresDoc()), { liste: nextList })
      let cleanedDocs = 0
      for (const d of coefDocs) {
        const v = d.data() as Record<string, unknown>
        if (Object.prototype.hasOwnProperty.call(v, trimmed)) {
          batch.update(d.ref, { [trimmed]: deleteField() })
          cleanedDocs++
        }
      }
      await batch.commit()
      return { cleanedDocs }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'matieres'] })
      // Invalidate every coefficients query — we don't know which keys
      qc.invalidateQueries({ queryKey: ['ecole', 'coefficients'] })
    },
  })
}

/**
 * One-shot cleanup: scans every /ecole/coefficients_* doc and removes any
 * matière key that isn't in the current global matières list (except
 * Conduite, which is always kept).
 *
 * Used to recover from the pre-fix state where removing a matière left
 * orphan coefficient entries that ghosted in the PP cross-matière view.
 *
 * Returns counts so the UI can tell the admin what was cleaned.
 */
export function useCleanupOrphanCoefficients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // 1. Read current matières list (the source of truth for "valid keys")
      const matieresSnap = await getDoc(docRef(ecoleMatieresDoc()))
      const data = matieresSnap.exists()
        ? (matieresSnap.data() as Partial<MatieresGlobales>)
        : { liste: [] }
      const validSet = new Set([
        ...(Array.isArray(data.liste) ? data.liste : []),
        'Conduite',
      ])

      // 2. Scan every coefficient doc, build a batch of cleanups
      const ecoleSnap = await getDocs(collection(db, 'ecole'))
      const coefDocs = ecoleSnap.docs.filter((d) =>
        d.id.startsWith('coefficients_')
      )

      const batch = writeBatch(db)
      let docsAffected = 0
      let keysRemoved = 0
      for (const d of coefDocs) {
        const v = d.data() as Record<string, unknown>
        const orphans: Record<string, ReturnType<typeof deleteField>> = {}
        for (const key of Object.keys(v)) {
          if (!validSet.has(key)) {
            orphans[key] = deleteField()
            keysRemoved++
          }
        }
        if (Object.keys(orphans).length > 0) {
          batch.update(d.ref, orphans)
          docsAffected++
        }
      }

      if (docsAffected > 0) {
        await batch.commit()
      }
      return { docsAffected, keysRemoved }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'coefficients'] })
    },
  })
}

/**
 * RT-SC · Élèves — write hooks.
 *
 * All mutations operate on a single class's subcollection.
 * Create + delete invalidate the live snapshot; the snapshot then
 * reflects the change naturally. Update is optimistic.
 *
 * Codes (PIN, parent passkey) are auto-generated using the helpers
 * from lib/benin.ts.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import {
  absencesCol,
  bulletinsCol,
  collesCol,
  eleveDoc,
  elevesCol,
  notesCol,
  paiementsCol,
  presencesCol,
} from '@/lib/firestore-keys'
import { genererCodePin, genererPasskeyParent } from '@/lib/benin'
import type { Eleve, Genre } from '@/types/models'

// ─── Create ─────────────────────────────────────────────────

export interface CreateEleveInput {
  classeId: string
  nom: string
  genre: Genre
  dateNaissance: string  // YYYY-MM-DD
  contactParent?: string
  ajoutePar?: string  // uid of admin who added
}

export function useCreateEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEleveInput): Promise<{ id: string; codePin: string; passkeyParent: string }> => {
      const codePin = genererCodePin()
      const passkeyParent = genererPasskeyParent()

      const newRef = await addDoc(
        collection(db, elevesCol(input.classeId)),
        {
          nom: input.nom.trim(),
          genre: input.genre,
          contactParent: (input.contactParent ?? '').trim(),
          date_naissance: input.dateNaissance.trim(),
          dateAjout: serverTimestamp(),
          ajoutePar: input.ajoutePar ?? '',
          codePin,
          passkeyParent,
        }
      )
      return { id: newRef.id, codePin, passkeyParent }
    },
    onSuccess: (data, vars) => {
      // Class-scoped listener picks up the new doc via onSnapshot.
      // These invalidations ensure any other read of that key
      // (sparse reads in UI) sees the latest view.
      qc.invalidateQueries({ queryKey: ['eleves', vars.classeId] })
      qc.invalidateQueries({ queryKey: ['classe', vars.classeId, 'eleve-count'] })
      qc.invalidateQueries({ queryKey: ['school-stats'] })

      // School-wide list (useAllEleves) is a one-shot getDocs with
      // a 5-min stale time. Keep it in sync with the new élève so
      // the Finances terminal + Bilan don't show stale data until
      // the 5-min window expires.
      //
      // Only seed if the cache was already hydrated. Seeding an
      // empty cache would trick useAllEleves into thinking the
      // school has just 1 student (the one we just added).
      const cached = qc.getQueryData<
        Array<{
          id: string
          classeId: string
          nom?: string
          genre?: string
          contactParent?: string
          date_naissance?: string
        }>
      >(['eleves', 'all'])

      if (cached && cached.length > 0) {
        const optimisticEntry = {
          id: data.id,
          classeId: vars.classeId,
          nom: vars.nom.trim(),
          genre: vars.genre,
          contactParent: (vars.contactParent ?? '').trim(),
          date_naissance: vars.dateNaissance.trim(),
        }
        if (!cached.some((e) => e.id === optimisticEntry.id)) {
          const next = [...cached, optimisticEntry].sort((a, b) =>
            (a.nom ?? '').localeCompare(b.nom ?? '')
          )
          qc.setQueryData(['eleves', 'all'], next)
        }
      }

      // Force-refetch — guarantees the cache ends up consistent
      // with server within a few hundred ms.
      void qc.refetchQueries({ queryKey: ['eleves', 'all'] })
    },
  })
}

// ─── Update ─────────────────────────────────────────────────

export interface UpdateEleveInput {
  classeId: string
  eleveId: string
  patch: Partial<Pick<Eleve, 'nom' | 'genre' | 'contactParent' | 'date_naissance'>>
}

export function useUpdateEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ classeId, eleveId, patch }: UpdateEleveInput) => {
      // Trim string fields before write
      const cleaned: Record<string, unknown> = { ...patch }
      if (typeof cleaned.nom === 'string') cleaned.nom = (cleaned.nom as string).trim()
      if (typeof cleaned.contactParent === 'string')
        cleaned.contactParent = (cleaned.contactParent as string).trim()
      await updateDoc(docRef(eleveDoc(classeId, eleveId)), cleaned)
    },
    onMutate: async ({ classeId, eleveId, patch }) => {
      await qc.cancelQueries({ queryKey: ['eleves', classeId] })
      const previous = qc.getQueryData<Eleve[]>(['eleves', classeId])
      qc.setQueryData<Eleve[]>(['eleves', classeId], (old) =>
        (old ?? []).map((e) => (e.id === eleveId ? { ...e, ...patch } : e))
      )
      return { previous }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['eleves', vars.classeId], ctx.previous)
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['eleves', vars.classeId] })

      // Also update the school-wide cache if present.
      qc.setQueryData<
        Array<{
          id: string
          classeId: string
          nom?: string
          genre?: string
          contactParent?: string
          date_naissance?: string
        }>
      >(['eleves', 'all'], (old) => {
        if (!old) return old
        return old.map((e) =>
          e.id === vars.eleveId && e.classeId === vars.classeId
            ? { ...e, ...vars.patch }
            : e
        )
      })
    },
  })
}

// ─── Regenerate PIN ─────────────────────────────────────────

export function useRegenerateEleveCodes() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (args: {
      classeId: string
      eleveId: string
      what: 'pin' | 'parent' | 'both'
    }): Promise<{ codePin?: string; passkeyParent?: string }> => {
      const patch: Record<string, string> = {}
      if (args.what === 'pin' || args.what === 'both') {
        patch.codePin = genererCodePin()
      }
      if (args.what === 'parent' || args.what === 'both') {
        patch.passkeyParent = genererPasskeyParent()
      }
      await updateDoc(docRef(eleveDoc(args.classeId, args.eleveId)), patch)
      return {
        codePin: patch.codePin,
        passkeyParent: patch.passkeyParent,
      }
    },
    onSuccess: (returned, vars) => {
      qc.setQueryData<Eleve[]>(['eleves', vars.classeId], (old) =>
        (old ?? []).map((e) =>
          e.id === vars.eleveId
            ? {
                ...e,
                ...(returned.codePin ? { codePin: returned.codePin } : {}),
                ...(returned.passkeyParent
                  ? { passkeyParent: returned.passkeyParent }
                  : {}),
              }
            : e
        )
      )
    },
  })
}

// ─── Delete (cascading subcollection cleanup) ───────────────

/**
 * Delete an élève with all their subcollections.
 *
 * Design notes:
 *
 * 1. **No optimistic removal** — the parent `useEleves` hook pipes
 *    `onSnapshot` directly into the query cache. Optimistically
 *    filtering the élève out of cache races against incoming snapshots
 *    and causes "flash away then reappear" UX. We let the snapshot be
 *    the single source of truth. Progression indicator in the calling
 *    UI gives feedback while we wait.
 *
 * 2. **Errors accumulate, they don't abort** — `Promise.allSettled` on
 *    each subcollection. Individual doc failures (rules denial on a
 *    locked bulletin, say) get logged but don't prevent the main
 *    élève doc from being deleted. Admin would rather have "élève
 *    gone + warning that 2 old bulletins couldn't be erased" than
 *    "nothing happened, retry multiple times".
 *
 * 3. **Chunked deletes** — parallel doc deletes can hit Firestore
 *    write quotas on large sets. We cap at 25 concurrent.
 *
 * 4. **Main élève doc always attempted** — even if subcollections had
 *    partial failures, we still try to delete the élève doc. That's
 *    what makes the user see the élève vanish from the list. Orphaned
 *    subcol docs are harmless (they just take space).
 *
 * 5. **Throws only if the main doc delete fails** — that's the one
 *    thing the user cares about. Subcol failures are surfaced via
 *    console warning + a returned `warnings` array the caller can
 *    display if desired.
 */

const DELETE_CHUNK_SIZE = 25

async function deleteInChunks(
  docs: { ref: import('firebase/firestore').DocumentReference }[]
): Promise<{ ok: number; failed: number; firstErr?: string }> {
  let ok = 0
  let failed = 0
  let firstErr: string | undefined

  for (let i = 0; i < docs.length; i += DELETE_CHUNK_SIZE) {
    const chunk = docs.slice(i, i + DELETE_CHUNK_SIZE)
    const results = await Promise.allSettled(chunk.map((d) => deleteDoc(d.ref)))
    for (const r of results) {
      if (r.status === 'fulfilled') ok++
      else {
        failed++
        if (!firstErr) firstErr = r.reason?.message ?? String(r.reason)
      }
    }
  }

  return { ok, failed, firstErr }
}

export function useDeleteEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (args: {
      classeId: string
      eleveId: string
    }): Promise<{ warnings: string[] }> => {
      const { classeId, eleveId } = args
      const warnings: string[] = []

      const subPaths: { path: string; label: string }[] = [
        { path: notesCol(classeId, eleveId), label: 'notes' },
        { path: collesCol(classeId, eleveId), label: 'colles' },
        { path: absencesCol(classeId, eleveId), label: 'absences' },
        { path: bulletinsCol(classeId, eleveId), label: 'bulletins' },
        { path: paiementsCol(classeId, eleveId), label: 'paiements' },
      ]

      for (const { path, label } of subPaths) {
        try {
          const subSnap = await getDocs(collection(db, path))
          if (subSnap.docs.length === 0) continue
          const { failed, firstErr } = await deleteInChunks(subSnap.docs)
          if (failed > 0) {
            warnings.push(
              `${failed} ${label} non supprimé${failed > 1 ? 's' : ''}${
                firstErr ? ` (${firstErr})` : ''
              }`
            )
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          warnings.push(`Lecture ${label} échouée : ${msg}`)
        }
      }

      // Note: we intentionally skip presences cleanup here. Élève
      // references inside /presences/{date}.absents{} are keyed by
      // élève id; once the élève doc is gone, they become orphan
      // lookups that the daily rollover will clean up naturally
      // within 24h (5d.6 archive rollover).
      void presencesCol

      // Main delete — the one that matters for UI
      await deleteDoc(docRef(eleveDoc(classeId, eleveId)))

      return { warnings }
    },
    // No onMutate — let onSnapshot drive the cache. Adding optimistic
    // removal races against the incoming snapshot that still contains
    // the élève (since we haven't reached the main deleteDoc yet), and
    // causes the "delete button does nothing" feel.
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['classe', vars.classeId, 'eleve-count'] })
      qc.invalidateQueries({ queryKey: ['school-stats'] })

      // Remove the deleted élève from the school-wide cache so
      // Finances terminal + Bilan don't keep showing a ghost
      // student. Safe to do synchronously (unlike adds, where
      // the new doc might not have landed on all replicas yet,
      // a delete is already confirmed at this point).
      qc.setQueryData<
        Array<{ id: string; classeId: string; nom?: string }>
      >(['eleves', 'all'], (old) =>
        (old ?? []).filter(
          (e) => !(e.id === vars.eleveId && e.classeId === vars.classeId)
        )
      )
      // Also refetch so the cache ends up authoritative.
      void qc.refetchQueries({ queryKey: ['eleves', 'all'] })
    },
  })
}

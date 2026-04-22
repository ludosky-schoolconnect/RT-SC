/**
 * RT-SC · Annales data hooks.
 *
 * /annales is a top-level collection. Reads are public per the
 * Firestore rules (read: if true). Writes require staff (admin OR
 * prof) per the school-wide rule block; further per-role + per-UID
 * guards live in the UI.
 *
 * The `classe` field is free-text (e.g. "3ème M1" or "3ème"). For
 * the student view we want matching to be fuzzy so an annale tagged
 * "3ème" shows up for students in "3ème M1", "3ème M2", etc. We do
 * the filter in-memory after a full read rather than in Firestore
 * (no indexes needed, list is small enough per-school).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  deleteDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { colRef, docRef } from '@/firebase'
import { annalesCol, annaleDoc } from '@/lib/firestore-keys'
import type { Annale } from '@/types/models'

// ─── Reads ─────────────────────────────────────────────────────

/**
 * All annales, ordered by most-recently-added first.
 * Used by admin + prof (they see everything).
 */
export function useAllAnnales() {
  return useQuery({
    queryKey: ['annales', 'all'],
    queryFn: async (): Promise<Annale[]> => {
      const snap = await getDocs(
        query(colRef(annalesCol()), orderBy('dateAjout', 'desc'))
      )
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Annale, 'id'>) }))
    },
    staleTime: 60_000,
  })
}

/**
 * Annales relevant to a specific student's classe.
 *
 * Matching logic:
 *   1. Exact match (annale.classe === studentClasse)
 *   2. Level-prefix match: if annale.classe is a pure level ("3ème",
 *      "Terminale", etc.), it matches any student whose classe
 *      starts with that level.
 *
 * This mirrors how admins/profs typically file papers: either
 * specifically ("for my section only") or broadly ("for all 3èmes").
 */
export function useAnnalesForClasse(studentClasse: string | undefined) {
  return useQuery({
    queryKey: ['annales', 'forClasse', studentClasse ?? ''],
    enabled: Boolean(studentClasse),
    queryFn: async (): Promise<Annale[]> => {
      const snap = await getDocs(
        query(colRef(annalesCol()), orderBy('dateAjout', 'desc'))
      )
      const all = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Annale, 'id'>),
      }))
      if (!studentClasse) return []
      const target = studentClasse.trim().toLowerCase()
      return all.filter((a) => matchesStudentClasse(a.classe, target))
    },
    staleTime: 60_000,
  })
}

/**
 * Returns true if an annale tagged with `annaleClasse` should be
 * visible to a student in `studentClasse`.
 */
function matchesStudentClasse(
  annaleClasse: string | undefined,
  studentClasseLc: string
): boolean {
  if (!annaleClasse) return false
  const a = annaleClasse.trim().toLowerCase()
  if (!a) return false

  // Exact match
  if (a === studentClasseLc) return true

  // Level-prefix match: student "3ème m1" should match annale "3ème"
  // but NOT vice versa. We check if student starts with annale + space.
  if (studentClasseLc.startsWith(a + ' ')) return true
  if (studentClasseLc.startsWith(a + '-')) return true
  if (studentClasseLc.startsWith(a + ',')) return true

  return false
}

// ─── Mutations ─────────────────────────────────────────────────

export interface AnnaleInput {
  titre: string
  matiere: string
  classe: string
  lien: string
  corrige?: string
  ajoutePar: string
  ajouteParUid: string
  ajouteParRole: 'admin' | 'prof'
}

/**
 * Add a new annale. Stamps dateAjout server-side so ordering is
 * consistent regardless of client clock.
 */
export function useAddAnnale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AnnaleInput) => {
      const payload: Record<string, unknown> = {
        titre: input.titre.trim(),
        matiere: input.matiere.trim(),
        classe: input.classe.trim(),
        lien: input.lien.trim(),
        ajoutePar: input.ajoutePar,
        ajouteParUid: input.ajouteParUid,
        ajouteParRole: input.ajouteParRole,
        dateAjout: serverTimestamp(),
      }
      // Only include `corrige` if non-empty — avoids storing empty
      // strings that the UI would then render as "Corrigé" links
      // pointing nowhere.
      const corrigeTrimmed = input.corrige?.trim()
      if (corrigeTrimmed) payload.corrige = corrigeTrimmed

      const ref = await addDoc(colRef(annalesCol()), payload)
      return ref.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annales'] })
    },
  })
}

export interface AnnaleUpdate {
  id: string
  titre?: string
  matiere?: string
  classe?: string
  lien?: string
  /** Pass empty string to CLEAR the corrigé; omit to leave unchanged. */
  corrige?: string
}

export function useUpdateAnnale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AnnaleUpdate) => {
      const patch: Record<string, unknown> = {}
      if (input.titre !== undefined) patch.titre = input.titre.trim()
      if (input.matiere !== undefined) patch.matiere = input.matiere.trim()
      if (input.classe !== undefined) patch.classe = input.classe.trim()
      if (input.lien !== undefined) patch.lien = input.lien.trim()
      if (input.corrige !== undefined) {
        const trimmed = input.corrige.trim()
        // Firestore has no "set to null" shortcut here, but we can
        // use deleteField() for clearing. For now we just write the
        // trimmed string; the viewer checks truthiness before showing
        // the corrigé button, so an empty string effectively hides
        // the button.
        patch.corrige = trimmed
      }
      await updateDoc(docRef(annaleDoc(input.id)), patch)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annales'] })
    },
  })
}

export function useDeleteAnnale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(docRef(annaleDoc(id)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annales'] })
    },
  })
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Format a Firestore Timestamp to a short French date, handling the
 * edge case where the write just happened and serverTimestamp hasn't
 * resolved yet (in which case we show "à l'instant").
 */
export function formatDateAjout(ts: Timestamp | null | undefined): string {
  if (!ts) return "à l'instant"
  const d = ts.toDate()
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * RT-SC · Year archive read hooks (read-only).
 *
 * Wraps queries on /archive/{annee}/... — the data written by the year
 * rollover. All operations here are READS; the year archive is
 * immutable after rollover completes (no edit, no delete from the UI
 * for now — if a delete-year feature is needed later, it's admin-only
 * with heavy confirm).
 *
 * Hooks:
 *   - useArchivedYears       — list all archived years (from metadata docs)
 *   - useArchivedClasses     — classes of a given year
 *   - useArchivedEleves      — élèves of a given class in a given year
 *   - useArchivedEleve       — single élève doc
 *   - useArchivedEleveSub    — a subcollection (notes/bulletins/absences/etc)
 *
 * Queries are one-shot (getDocs) not live-snapshot — archived data
 * doesn't change, so there's no point streaming. React Query caches
 * for 10 minutes on staleTime.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  archiveClassesCol,
  archiveClasseDoc,
  archiveElevesCol,
  archiveEleveDoc,
  archiveEleveSubCol,
  archiveYearDoc,
} from '@/lib/firestore-keys'
import { doc } from 'firebase/firestore'
import type {
  ArchivedYear,
  Bulletin,
  Classe,
  Eleve,
  Note,
  Absence,
  Paiement,
  Colle,
} from '@/types/models'

const TEN_MIN = 10 * 60_000

// ─── Years list ───────────────────────────────────────────────

export function useArchivedYears() {
  return useQuery<ArchivedYear[]>({
    queryKey: ['archive', 'years'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'archive'))
      const years: ArchivedYear[] = []
      snap.docs.forEach((d) => {
        const data = d.data()
        // Only count docs that look like year metadata (annee field present).
        // Raw subcollection placeholders might also exist — skip those.
        if (data && typeof data.annee === 'string') {
          years.push({
            annee: data.annee,
            classesCount: data.classesCount ?? 0,
            elevesCount: data.elevesCount ?? 0,
            errorsCount: data.errorsCount ?? 0,
            archivedAt: data.archivedAt,
          })
        }
      })
      // Sort newest first (string compare works for YYYY-YYYY format)
      years.sort((a, b) => b.annee.localeCompare(a.annee))
      return years
    },
    staleTime: TEN_MIN,
  })
}

// ─── Classes of an archived year ──────────────────────────────

export function useArchivedClasses(annee: string | null | undefined) {
  return useQuery<(Classe & { id: string })[]>({
    queryKey: ['archive', annee ?? '(null)', 'classes'],
    enabled: !!annee,
    queryFn: async () => {
      if (!annee) return []
      const snap = await getDocs(collection(db, archiveClassesCol(annee)))
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Classe) }))
    },
    staleTime: TEN_MIN,
  })
}

export function useArchivedClasse(
  annee: string | null | undefined,
  classeId: string | null | undefined
) {
  return useQuery<(Classe & { id: string }) | null>({
    queryKey: ['archive', annee ?? '(null)', 'classe', classeId ?? '(null)'],
    enabled: !!annee && !!classeId,
    queryFn: async () => {
      if (!annee || !classeId) return null
      const snap = await getDoc(doc(db, archiveClasseDoc(annee, classeId)))
      if (!snap.exists()) return null
      return { id: snap.id, ...(snap.data() as Classe) }
    },
    staleTime: TEN_MIN,
  })
}

// ─── Élèves of an archived class ──────────────────────────────

export function useArchivedEleves(
  annee: string | null | undefined,
  classeId: string | null | undefined
) {
  return useQuery<(Eleve & { id: string })[]>({
    queryKey: ['archive', annee ?? '(null)', 'classe', classeId ?? '(null)', 'eleves'],
    enabled: !!annee && !!classeId,
    queryFn: async () => {
      if (!annee || !classeId) return []
      const snap = await getDocs(collection(db, archiveElevesCol(annee, classeId)))
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Eleve) }))
        .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
    },
    staleTime: TEN_MIN,
  })
}

export function useArchivedEleve(
  annee: string | null | undefined,
  classeId: string | null | undefined,
  eleveId: string | null | undefined
) {
  return useQuery<(Eleve & { id: string }) | null>({
    queryKey: [
      'archive',
      annee ?? '(null)',
      'classe',
      classeId ?? '(null)',
      'eleve',
      eleveId ?? '(null)',
    ],
    enabled: !!annee && !!classeId && !!eleveId,
    queryFn: async () => {
      if (!annee || !classeId || !eleveId) return null
      const snap = await getDoc(doc(db, archiveEleveDoc(annee, classeId, eleveId)))
      if (!snap.exists()) return null
      return { id: snap.id, ...(snap.data() as Eleve) }
    },
    staleTime: TEN_MIN,
  })
}

// ─── Subcollections ───────────────────────────────────────────

type SubKind = 'notes' | 'bulletins' | 'absences' | 'paiements' | 'colles'

type SubTypeMap = {
  notes: Note
  bulletins: Bulletin
  absences: Absence
  paiements: Paiement
  colles: Colle
}

export function useArchivedEleveSub<K extends SubKind>(
  annee: string | null | undefined,
  classeId: string | null | undefined,
  eleveId: string | null | undefined,
  sub: K
) {
  return useQuery<(SubTypeMap[K] & { id: string })[]>({
    queryKey: [
      'archive',
      annee ?? '(null)',
      'classe',
      classeId ?? '(null)',
      'eleve',
      eleveId ?? '(null)',
      sub,
    ],
    enabled: !!annee && !!classeId && !!eleveId,
    queryFn: async () => {
      if (!annee || !classeId || !eleveId) return []
      const snap = await getDocs(
        collection(db, archiveEleveSubCol(annee, classeId, eleveId, sub))
      )
      return snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as SubTypeMap[K]),
      }))
    },
    staleTime: TEN_MIN,
  })
}

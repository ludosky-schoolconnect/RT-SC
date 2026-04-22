/**
 * RT-SC · useBulletinView — fetch + assemble a BulletinView.
 *
 * Two variants:
 *   - usePeriodBulletinView({ classeId, eleveId, periode })  → EnrichedBulletinPeriodView
 *   - useAnnualBulletinView({ classeId, eleveId })           → BulletinAnnualView
 *
 * Both return a tightly-shaped view ready to feed into <BulletinView />.
 *
 * Period variant (v2 enriched):
 *   The period hook composes three fetches:
 *     1. Per-student base view (bulletin + notes + classe + élève + coefficients)
 *     2. Class-wide enrichment data (classmates' bulletins + notes + presences)
 *     3. Per-student discipline source (this élève's absences + colles +
 *        civismeHistory, period-bounded client-side)
 *   Then calls `enrichBulletinPeriodView()` to merge everything into an
 *   EnrichedBulletinPeriodView with class stats, per-matière rangs,
 *   discipline counts, moyenne-en-lettres, and per-matière appreciation.
 *
 *   The class-wide data (step 2) lives in its own hook
 *   `useClassPeriodEnrichment` so every student in the same class × period
 *   shares ONE fetch — typical admin browsing stays well within Blaze
 *   free tier.
 *
 * Annual variant: unchanged. Annual bulletin enrichment is out of scope
 * for Bulletin v2 phase 1.
 *
 * Cached via TanStack Query. 5-min stale.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  absencesCol,
  bulletinsCol,
  civismeHistoryCol,
  classesCol,
  collesCol,
  elevesCol,
  notesCol,
  professeurDoc,
} from '@/lib/firestore-keys'
import {
  assembleBulletinAnnualView,
  assembleBulletinPeriodView,
  type BulletinAnnualView,
  type BulletinPeriodView,
} from '@/lib/bulletinView'
import {
  enrichBulletinPeriodView,
  type EnrichedBulletinPeriodView,
} from '@/lib/bulletinEnrichment'
import {
  coefficientsTargetId,
} from '@/lib/benin'
import { useEcoleConfig } from './useEcoleConfig'
import { useBulletinConfig } from './useBulletinConfig'
import { useClassPeriodEnrichment } from './useClassPeriodEnrichment'
import type {
  Bulletin,
  Classe,
  Eleve,
  Note,
  Periode,
  Professeur,
} from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Period variant (v2 enriched) ───────────────────────────

export function usePeriodBulletinView(args: {
  classeId: string | undefined
  eleveId: string | undefined
  periode: Periode | undefined
}) {
  const { classeId, eleveId, periode } = args
  const { data: ecoleConfig } = useEcoleConfig()
  const { data: bulletinConfig } = useBulletinConfig()

  // Shared class-wide fetch (one per class×periode, dedup'd across students)
  const { data: classEnrichment } = useClassPeriodEnrichment({ classeId, periode })

  // ─ Per-student base view + per-student discipline source ─
  const enabled =
    !!classeId && !!eleveId && !!periode && !!ecoleConfig && !!bulletinConfig

  const baseQuery = useQuery<{
    baseView: BulletinPeriodView
    absences: { date: unknown; heureDebut?: string }[]
    colles: { heures: number }[]
    civismeHistory: { raison?: string; motif?: string; date?: unknown }[]
  } | null>({
    queryKey: ['bulletin-view-period-base', classeId, eleveId, periode],
    enabled,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      if (!classeId || !eleveId || !periode || !ecoleConfig || !bulletinConfig) {
        return null
      }

      // 1. Bulletin doc
      const bullSnap = await getDoc(
        doc(db, `${bulletinsCol(classeId, eleveId)}/${periode}`)
      )
      if (!bullSnap.exists()) return null
      const bulletin = bullSnap.data() as Bulletin

      // 2. Élève doc
      const eleveSnap = await getDoc(doc(db, `${elevesCol(classeId)}/${eleveId}`))
      if (!eleveSnap.exists()) return null
      const eleve = { id: eleveSnap.id, ...(eleveSnap.data() as Omit<Eleve, 'id'>) }

      // 3. Classe doc
      const classeSnap = await getDoc(doc(db, `${classesCol()}/${classeId}`))
      if (!classeSnap.exists()) return null
      const classe = { id: classeSnap.id, ...(classeSnap.data() as Omit<Classe, 'id'>) }

      // 3b. Professeur Principal doc — Bulletin v2, Session 3. Fetched
      //     only when the class has one assigned. Missing PP is NOT an
      //     error — the view simply carries no PP signature. Read is
      //     public under the current rules (staff read all profs), so
      //     no permission concerns here.
      let profPrincipal: Professeur | null = null
      if (classe.profPrincipalId) {
        const ppSnap = await getDoc(doc(db, professeurDoc(classe.profPrincipalId)))
        if (ppSnap.exists()) {
          profPrincipal = {
            id: ppSnap.id,
            ...(ppSnap.data() as Omit<Professeur, 'id'>),
          }
        }
      }

      // 4. Notes for this élève × period
      const notesSnap = await getDocs(
        query(collection(db, notesCol(classeId, eleveId)), where('periode', '==', periode))
      )
      const notes = notesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Note, never>),
      }))

      // 5. Coefficients doc
      const targetId = coefficientsTargetId(classe.niveau, classe.serie ?? null)
      const coefSnap = await getDoc(doc(db, `ecole/coefficients_${targetId}`))
      const coefficients = coefSnap.exists() ? (coefSnap.data() as Record<string, number>) : {}

      // 6. Per-student discipline source: absences, colles, civismeHistory
      //    for this period. Fetched in parallel.
      const [absencesSnap, collesSnap, civismeSnap] = await Promise.all([
        getDocs(collection(db, absencesCol(classeId, eleveId))),
        getDocs(
          query(
            collection(db, collesCol(classeId, eleveId)),
            where('periode', '==', periode)
          )
        ),
        getDocs(collection(db, civismeHistoryCol(classeId, eleveId))),
      ])
      const absences = absencesSnap.docs.map((d) => d.data() as { date: unknown; heureDebut?: string })
      const colles = collesSnap.docs.map((d) => d.data() as { heures: number })
      const civismeHistory = civismeSnap.docs.map(
        (d) => d.data() as { raison?: string; motif?: string; date?: unknown }
      )

      const baseView = assembleBulletinPeriodView({
        bulletin,
        notes,
        coefficients,
        eleve,
        classe,
        bulletinConfig,
        ecoleConfig,
        profPrincipal,
      })

      return { baseView, absences, colles, civismeHistory }
    },
  })

  // ─ Merge base + class-wide via the enricher ─
  // Derived synchronously in useMemo so the return type matches the
  // caller's expectations without an extra query layer.
  const enriched: EnrichedBulletinPeriodView | null = useMemo(() => {
    if (!baseQuery.data) return null
    const { baseView, absences, colles, civismeHistory } = baseQuery.data

    // If class enrichment hasn't loaded yet (or failed), return the base
    // view unchanged. The enriched fields stay undefined — UI should
    // treat them as "not yet available" and render defensively.
    if (!classEnrichment || !eleveId || !periode) {
      return baseView as EnrichedBulletinPeriodView
    }

    return enrichBulletinPeriodView({
      baseView,
      eleveId,
      periode,
      classmates: classEnrichment.classmates,
      effectif: classEnrichment.effectif,
      periodeDates: bulletinConfig?.periodeDates,
      disciplineSource: {
        absences: absences as { date: { toDate?: () => Date } | Date | undefined; heureDebut?: string }[],
        presences: classEnrichment.presences,
        colles,
        civismeHistory: civismeHistory as {
          raison?: string
          motif?: string
          date?: { toDate?: () => Date } | Date
        }[],
      },
    })
  }, [
    baseQuery.data,
    classEnrichment,
    eleveId,
    periode,
    bulletinConfig?.periodeDates,
  ])

  return {
    ...baseQuery,
    data: enriched,
  }
}

// ─── Annual variant ─────────────────────────────────────────

export function useAnnualBulletinView(args: {
  classeId: string | undefined
  eleveId: string | undefined
}) {
  const { classeId, eleveId } = args
  const { data: ecoleConfig } = useEcoleConfig()
  const { data: bulletinConfig } = useBulletinConfig()

  const enabled = !!classeId && !!eleveId && !!ecoleConfig && !!bulletinConfig

  return useQuery<BulletinAnnualView | null>({
    queryKey: ['bulletin-view-annual', classeId, eleveId],
    enabled,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      if (!classeId || !eleveId || !ecoleConfig || !bulletinConfig) {
        return null
      }

      // 1. Annual bulletin
      const annualSnap = await getDoc(
        doc(db, `${bulletinsCol(classeId, eleveId)}/Année`)
      )
      if (!annualSnap.exists()) return null
      const annualBulletin = annualSnap.data() as Bulletin

      // 2. Per-period bulletins (everything but Année)
      const allSnap = await getDocs(collection(db, bulletinsCol(classeId, eleveId)))
      const periodBulletins: { periode: string; bulletin: Bulletin }[] = []
      for (const d of allSnap.docs) {
        if (d.id === 'Année') continue
        periodBulletins.push({ periode: d.id, bulletin: d.data() as Bulletin })
      }
      // Sort by listPeriodes order — we know the canonical order from config
      periodBulletins.sort((a, b) => a.periode.localeCompare(b.periode, 'fr'))

      // 3. Élève doc
      const eleveSnap = await getDoc(doc(db, `${elevesCol(classeId)}/${eleveId}`))
      if (!eleveSnap.exists()) return null
      const eleve = { id: eleveSnap.id, ...(eleveSnap.data() as Omit<Eleve, 'id'>) }

      // 4. Classe doc
      const classeSnap = await getDoc(doc(db, `${classesCol()}/${classeId}`))
      if (!classeSnap.exists()) return null
      const classe = { id: classeSnap.id, ...(classeSnap.data() as Omit<Classe, 'id'>) }

      // 4b. Professeur Principal — same pattern as the period variant.
      let profPrincipal: Professeur | null = null
      if (classe.profPrincipalId) {
        const ppSnap = await getDoc(doc(db, professeurDoc(classe.profPrincipalId)))
        if (ppSnap.exists()) {
          profPrincipal = {
            id: ppSnap.id,
            ...(ppSnap.data() as Omit<Professeur, 'id'>),
          }
        }
      }

      return assembleBulletinAnnualView({
        annualBulletin,
        periodBulletins,
        eleve,
        classe,
        bulletinConfig,
        ecoleConfig,
        profPrincipal,
      })
    },
  })
}

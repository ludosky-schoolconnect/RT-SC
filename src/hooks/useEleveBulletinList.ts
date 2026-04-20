/**
 * RT-SC · useEleveBulletinList — list all bulletins for one élève.
 *
 * Used by the élève dashboard's Bulletins tab and the parent dashboard's
 * Bulletins tab. Returns the list of available bulletin docs for the
 * (classeId × eleveId) pair, split into period + annual.
 *
 * Reads bulletin docs directly (lightweight metadata: periode, moyenne,
 * statut) rather than the full assembled view. The full view is only
 * assembled when the user opens a specific bulletin via the modal.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol } from '@/lib/firestore-keys'
import type { Bulletin } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export interface BulletinSummary {
  /** Doc id (e.g. "Trimestre 1" or "Année") */
  periode: string
  /** True for the special "Année" doc */
  isAnnual: boolean
  moyenneGenerale: number
  rang?: string
  statutAnnuel?: 'Admis' | 'Échoué'
  estVerrouille: boolean
  dateCalcul: string
}

export interface EleveBulletinList {
  periodes: BulletinSummary[]
  annual: BulletinSummary | null
}

export function useEleveBulletinList(args: {
  classeId: string | undefined
  eleveId: string | undefined
}) {
  const { classeId, eleveId } = args
  return useQuery<EleveBulletinList>({
    queryKey: ['eleve-bulletin-list', classeId, eleveId],
    enabled: !!classeId && !!eleveId,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      if (!classeId || !eleveId) return { periodes: [], annual: null }
      const snap = await getDocs(collection(db, bulletinsCol(classeId, eleveId)))
      const periodes: BulletinSummary[] = []
      let annual: BulletinSummary | null = null
      for (const d of snap.docs) {
        const data = d.data() as Bulletin
        const summary: BulletinSummary = {
          periode: d.id,
          isAnnual: d.id === 'Année',
          moyenneGenerale: data.moyenneAnnuelle ?? data.moyenneGenerale,
          rang: data.rang,
          statutAnnuel: data.statutAnnuel,
          estVerrouille: data.estVerrouille ?? false,
          dateCalcul: data.dateCalcul ?? new Date().toISOString(),
        }
        if (summary.isAnnual) annual = summary
        else periodes.push(summary)
      }
      // Stable order — alphabetical works for "Semestre 1/2" and "Trimestre 1/2/3"
      periodes.sort((a, b) => a.periode.localeCompare(b.periode, 'fr'))
      return { periodes, annual }
    },
  })
}

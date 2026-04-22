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
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol, eleveDoc } from '@/lib/firestore-keys'
import type { Bulletin, Eleve } from '@/types/models'

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
  /**
   * Élève's genre, derived from the eleve doc. Used for feminine
   * agreement on display strings like "Admise" / "Échouée". Null if
   * the eleve doc couldn't be read.
   */
  genre: 'M' | 'F' | null
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
      if (!classeId || !eleveId)
        return { periodes: [], annual: null, genre: null }

      // Parallel fetch: bulletins subcollection + parent eleve doc.
      // The eleve doc gives us the student's genre for gendered
      // labels ("Admise" vs "Admis"). One extra read per hook call;
      // cached for 5 minutes along with the bulletins.
      const [bulletinsSnap, eleveSnap] = await Promise.all([
        getDocs(collection(db, bulletinsCol(classeId, eleveId))),
        getDoc(doc(db, eleveDoc(classeId, eleveId))),
      ])

      const periodes: BulletinSummary[] = []
      let annual: BulletinSummary | null = null
      for (const d of bulletinsSnap.docs) {
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
      periodes.sort((a, b) => a.periode.localeCompare(b.periode, 'fr'))

      // Genre: only two stored values on disk, 'M' | 'F'. Default to
      // null when the eleve doc is missing — callers must handle it.
      let genre: 'M' | 'F' | null = null
      if (eleveSnap.exists()) {
        const eleveData = eleveSnap.data() as Eleve
        if (eleveData.genre === 'M' || eleveData.genre === 'F') {
          genre = eleveData.genre
        }
      }

      return { periodes, annual, genre }
    },
  })
}

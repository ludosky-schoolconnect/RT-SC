/**
 * RT-SC · useBulletinView — fetch + assemble a BulletinView.
 *
 * Two variants:
 *   - usePeriodBulletinView({ classeId, eleveId, periode })
 *   - useAnnualBulletinView({ classeId, eleveId })
 *
 * Both return a tightly-shaped view ready to feed into <BulletinView />.
 *
 * Cached via TanStack Query. The data is moderately large (one Bulletin
 * doc + N notes for period view, all bulletins for annual) so 5-min stale.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  bulletinsCol,
  notesCol,
  classesCol,
  elevesCol,
} from '@/lib/firestore-keys'
import {
  assembleBulletinAnnualView,
  assembleBulletinPeriodView,
  type BulletinAnnualView,
  type BulletinPeriodView,
} from '@/lib/bulletinView'
import {
  coefficientsTargetId,
} from '@/lib/benin'
import { useEcoleConfig } from './useEcoleConfig'
import { useBulletinConfig } from './useBulletinConfig'
import type {
  Bulletin,
  Classe,
  Eleve,
  Note,
  Periode,
} from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Period variant ─────────────────────────────────────────

export function usePeriodBulletinView(args: {
  classeId: string | undefined
  eleveId: string | undefined
  periode: Periode | undefined
}) {
  const { classeId, eleveId, periode } = args
  const { data: ecoleConfig } = useEcoleConfig()
  const { data: bulletinConfig } = useBulletinConfig()

  // We need the classe to know niveau/série for the coefficients lookup
  const enabled = !!classeId && !!eleveId && !!periode && !!ecoleConfig && !!bulletinConfig

  return useQuery<BulletinPeriodView | null>({
    queryKey: ['bulletin-view-period', classeId, eleveId, periode],
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

      return assembleBulletinPeriodView({
        bulletin,
        notes,
        coefficients,
        eleve,
        classe,
        bulletinConfig,
        ecoleConfig,
      })
    },
  })
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

      return assembleBulletinAnnualView({
        annualBulletin,
        periodBulletins,
        eleve,
        classe,
        bulletinConfig,
        ecoleConfig,
      })
    },
  })
}

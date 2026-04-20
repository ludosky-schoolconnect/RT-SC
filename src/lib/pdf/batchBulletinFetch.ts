/**
 * RT-SC · Batch bulletin-view fetching for PDF export.
 *
 * usePeriodBulletinView / useAnnualBulletinView fetch ONE élève's view.
 * For PDF en lot we need ALL élèves' views. The naive approach (N hooks
 * in a loop) doesn't compose, so we expose pure async functions instead.
 *
 * Optimizations:
 *   1. Shared docs (ecoleConfig, bulletinConfig, classe, coefficients)
 *      are fetched ONCE for the whole batch.
 *   2. Per-élève reads (eleve + bulletin + notes) run in parallel via
 *      Promise.all so 30 élèves don't take 30× the time of 1.
 *   3. Élèves whose bulletin doesn't exist for the period are silently
 *      skipped (so a partially-generated period still produces a PDF
 *      with whoever's ready).
 *
 * Memory note: each view is ~10–50KB; 50 élèves max 2.5MB — fine for
 * client-side processing in jsPDF.
 */

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
import { coefficientsTargetId } from '@/lib/benin'
import type {
  Bulletin,
  Classe,
  Eleve,
  Note,
  Periode,
  EcoleConfig,
  BulletinConfig,
} from '@/types/models'

interface SharedContext {
  classe: Classe
  coefficients: Record<string, number>
  ecoleConfig: EcoleConfig
  bulletinConfig: BulletinConfig
}

async function fetchSharedContext(
  classeId: string,
  ecoleConfig: EcoleConfig,
  bulletinConfig: BulletinConfig
): Promise<SharedContext | null> {
  const classeSnap = await getDoc(doc(db, `${classesCol()}/${classeId}`))
  if (!classeSnap.exists()) return null
  const classe = { id: classeSnap.id, ...(classeSnap.data() as Omit<Classe, 'id'>) }

  const targetId = coefficientsTargetId(classe.niveau, classe.serie ?? null)
  const coefSnap = await getDoc(doc(db, `ecole/coefficients_${targetId}`))
  const coefficients = coefSnap.exists() ? (coefSnap.data() as Record<string, number>) : {}

  return { classe, coefficients, ecoleConfig, bulletinConfig }
}

async function fetchOneElevePeriodView(
  eleveId: string,
  periode: Periode,
  ctx: SharedContext
): Promise<BulletinPeriodView | null> {
  const classeId = ctx.classe.id

  // Three reads in parallel
  const [bullSnap, eleveSnap, notesSnap] = await Promise.all([
    getDoc(doc(db, `${bulletinsCol(classeId, eleveId)}/${periode}`)),
    getDoc(doc(db, `${elevesCol(classeId)}/${eleveId}`)),
    getDocs(
      query(collection(db, notesCol(classeId, eleveId)), where('periode', '==', periode))
    ),
  ])

  if (!bullSnap.exists()) return null
  if (!eleveSnap.exists()) return null

  const bulletin = bullSnap.data() as Bulletin
  const eleve = { id: eleveSnap.id, ...(eleveSnap.data() as Omit<Eleve, 'id'>) }
  const notes = notesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Note, never>),
  }))

  return assembleBulletinPeriodView({
    bulletin,
    notes,
    coefficients: ctx.coefficients,
    eleve,
    classe: ctx.classe,
    bulletinConfig: ctx.bulletinConfig,
    ecoleConfig: ctx.ecoleConfig,
  })
}

async function fetchOneEleveAnnualView(
  eleveId: string,
  ctx: SharedContext
): Promise<BulletinAnnualView | null> {
  const classeId = ctx.classe.id

  const [bullsSnap, eleveSnap] = await Promise.all([
    getDocs(collection(db, bulletinsCol(classeId, eleveId))),
    getDoc(doc(db, `${elevesCol(classeId)}/${eleveId}`)),
  ])

  if (!eleveSnap.exists()) return null
  const eleve = { id: eleveSnap.id, ...(eleveSnap.data() as Omit<Eleve, 'id'>) }

  // Look for the special "Année" annual doc. Period bulletins use period
  // strings as their id; the annual doc is "Année" by convention.
  let annualBulletin: Bulletin | null = null
  const periodBulletins: { periode: string; bulletin: Bulletin }[] = []
  for (const d of bullsSnap.docs) {
    if (d.id === 'Année') {
      annualBulletin = d.data() as Bulletin
    } else {
      periodBulletins.push({ periode: d.id, bulletin: d.data() as Bulletin })
    }
  }
  if (!annualBulletin) return null
  periodBulletins.sort((a, b) => a.periode.localeCompare(b.periode, 'fr'))

  return assembleBulletinAnnualView({
    annualBulletin,
    periodBulletins,
    eleve,
    classe: ctx.classe,
    bulletinConfig: ctx.bulletinConfig,
    ecoleConfig: ctx.ecoleConfig,
  })
}

// ─── Public API ──────────────────────────────────────────────

export interface BatchFetchOptions {
  classeId: string
  /** Sorted élève list (typically alphabetical by nom) */
  eleves: { id: string }[]
  ecoleConfig: EcoleConfig
  bulletinConfig: BulletinConfig
}

/**
 * Fetch all period bulletin views for a class. Élèves without a bulletin
 * for the period are silently skipped. Returns views in the SAME ORDER
 * as the input `eleves` array.
 */
export async function fetchAllPeriodBulletinViews(
  args: BatchFetchOptions & { periode: Periode }
): Promise<BulletinPeriodView[]> {
  const ctx = await fetchSharedContext(args.classeId, args.ecoleConfig, args.bulletinConfig)
  if (!ctx) return []

  const results = await Promise.all(
    args.eleves.map((e) => fetchOneElevePeriodView(e.id, args.periode, ctx))
  )
  return results.filter((v): v is BulletinPeriodView => v !== null)
}

export async function fetchAllAnnualBulletinViews(
  args: BatchFetchOptions
): Promise<BulletinAnnualView[]> {
  const ctx = await fetchSharedContext(args.classeId, args.ecoleConfig, args.bulletinConfig)
  if (!ctx) return []

  const results = await Promise.all(
    args.eleves.map((e) => fetchOneEleveAnnualView(e.id, ctx))
  )
  return results.filter((v): v is BulletinAnnualView => v !== null)
}

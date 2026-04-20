/**
 * RT-SC · Annual closure orchestrator (Phase 4c-iii).
 *
 * Reads every per-period Bulletin doc for a class, computes per élève
 * the annual moyenne, statut (Admis/Échoué), and annual rank, then
 * writes:
 *
 *   1. An annual Bulletin doc at /classes/{cid}/eleves/{eid}/bulletins/Année
 *   2. Denormalized fields on the Eleve doc itself: moyenneAnnuelle,
 *      statutAnnuel, rang. This keeps the Transition modal fast (no need
 *      to query the bulletins subcollection for hundreds of élèves).
 *
 * Preflight is strict — annual closure has real-world consequences
 * (Admis/Échoué decides if the élève advances). Every period must have a
 * locked bulletin for every élève before we proceed.
 *
 * Pure-ish: preflight + compute are pure; write does Firestore I/O.
 */

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol, elevesCol } from '@/lib/firestore-keys'
import {
  computeRanking,
  listPeriodes,
  moyenneAnnuelle,
  statutAnnuel,
  type FormuleAnnuelle,
  type RankInput,
} from '@/lib/bulletin'
import type {
  Bulletin,
  BulletinConfig,
  Eleve,
} from '@/types/models'

// ─── Types ──────────────────────────────────────────────────

export interface AnnualGenerationInput {
  classeId: string
  eleves: Eleve[]
  bulletinConfig: BulletinConfig
  /**
   * For each élève, their per-period bulletin docs (must include all
   * periods of the year). Keyed by [eleveId][periode].
   */
  bulletinsByEleveByPeriode: Record<string, Record<string, Bulletin>>
}

export type PreflightSeverity = 'error' | 'warning'

export interface AnnualPreflightIssue {
  severity: PreflightSeverity
  eleveId?: string
  periode?: string
  message: string
}

export interface AnnualPreflightResult {
  issues: AnnualPreflightIssue[]
  canProceed: boolean
  /** All periods we expect to have bulletins for */
  expectedPeriodes: string[]
  /** Élève summary: completeness count + per-élève moyennes if present */
  perEleveSummary: {
    eleveId: string
    bulletinsFound: number
    bulletinsMissing: number
    bulletinsUnlocked: number
  }[]
}

export function runAnnualPreflight(
  input: AnnualGenerationInput
): AnnualPreflightResult {
  const issues: AnnualPreflightIssue[] = []
  const expectedPeriodes = listPeriodes(
    input.bulletinConfig.typePeriode,
    input.bulletinConfig.nbPeriodes
  )

  if (input.eleves.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Aucun élève dans cette classe.',
    })
  }

  const perEleveSummary: AnnualPreflightResult['perEleveSummary'] = []

  for (const eleve of input.eleves) {
    let bulletinsFound = 0
    let bulletinsMissing = 0
    let bulletinsUnlocked = 0

    for (const periode of expectedPeriodes) {
      const bull = input.bulletinsByEleveByPeriode[eleve.id]?.[periode]
      if (!bull) {
        bulletinsMissing++
        issues.push({
          severity: 'error',
          eleveId: eleve.id,
          periode,
          message: `${eleve.nom} : aucun bulletin pour ${periode}. Le PP doit le générer avant la clôture annuelle.`,
        })
      } else if (!bull.estVerrouille) {
        bulletinsUnlocked++
        issues.push({
          severity: 'error',
          eleveId: eleve.id,
          periode,
          message: `${eleve.nom} : bulletin de ${periode} non verrouillé.`,
        })
      } else {
        bulletinsFound++
      }
    }
    perEleveSummary.push({
      eleveId: eleve.id,
      bulletinsFound,
      bulletinsMissing,
      bulletinsUnlocked,
    })
  }

  return {
    issues,
    canProceed: issues.every((i) => i.severity !== 'error'),
    expectedPeriodes,
    perEleveSummary,
  }
}

// ─── Compute (pure) ─────────────────────────────────────────

export interface AnnualComputed {
  eleveId: string
  /** Full annual bulletin doc — written to /bulletins/Année */
  bulletin: Bulletin
  /** Denormalized fields to merge onto the Eleve doc itself */
  eleveUpdate: {
    moyenneAnnuelle: number
    statutAnnuel: 'Admis' | 'Échoué'
    rang: string
  }
}

export function computeAnnualBulletins(
  input: AnnualGenerationInput
): AnnualComputed[] {
  const formule: FormuleAnnuelle = input.bulletinConfig.formuleAnnuelle ?? 'standard'
  const expectedPeriodes = listPeriodes(
    input.bulletinConfig.typePeriode,
    input.bulletinConfig.nbPeriodes
  )

  // First pass — compute moyenneAnnuelle per élève
  const intermediate = input.eleves.map((eleve) => {
    const perPeriodMoyennes: { periode: string; moyenne: number }[] = []
    for (const periode of expectedPeriodes) {
      const bull = input.bulletinsByEleveByPeriode[eleve.id]?.[periode]
      // Preflight should have caught missing — but defensive null check
      if (!bull) continue
      perPeriodMoyennes.push({
        periode,
        moyenne: bull.moyenneGenerale,
      })
    }
    const moyenne = moyenneAnnuelle(
      perPeriodMoyennes.map((p) => p.moyenne),
      formule
    )
    const statut = statutAnnuel(moyenne)
    return {
      eleveId: eleve.id,
      genre: eleve.genre,
      moyenne,
      statut,
      perPeriodMoyennes,
    }
  })

  // Second pass — annual ranking
  const rankInput: RankInput[] = intermediate.map((x) => ({
    id: x.eleveId,
    moyenneGenerale: x.moyenne,
    genre: x.genre,
  }))
  const ranking = computeRanking(rankInput)
  const rankByEleve = new Map(ranking.map((r) => [r.id, r]))

  // Build annual bulletin docs + denormalized eleve fields
  return intermediate.map((x) => {
    const rang = rankByEleve.get(x.eleveId)?.rang ?? ''
    const bulletin: Bulletin = {
      periode: 'Année',
      moyenneGenerale: x.moyenne,
      // For the annual doc, totalPoints/totalCoeffs/noteConduite/coeffs aren't
      // recomputed (they're a sum over periods). We store 0s as a convention
      // and rely on the per-period bulletins for breakdown. The display layer
      // uses `perPeriodMoyennes` for transparency.
      totalPoints: 0,
      totalCoeffs: 0,
      noteConduite: 0,
      totalHeuresColle: 0,
      coeffConduite: 0,
      estVerrouille: true,
      dateCalcul: new Date().toISOString(),
      rang,
      perPeriodMoyennes: x.perPeriodMoyennes,
      formuleUsed: input.bulletinConfig.formuleAnnuelle ?? 'standard',
      moyenneAnnuelle: x.moyenne,
      statutAnnuel: x.statut,
    }
    return {
      eleveId: x.eleveId,
      bulletin,
      eleveUpdate: {
        moyenneAnnuelle: x.moyenne,
        statutAnnuel: x.statut,
        rang,
      },
    }
  })
}

// ─── Write (Firestore I/O) ──────────────────────────────────

export interface AnnualWriteResult {
  successCount: number
  errorCount: number
  errors: string[]
}

export async function writeAnnualBulletins(
  classeId: string,
  computed: AnnualComputed[]
): Promise<AnnualWriteResult> {
  const result: AnnualWriteResult = {
    successCount: 0,
    errorCount: 0,
    errors: [],
  }
  if (computed.length === 0) return result

  try {
    const batch = writeBatch(db)
    for (const c of computed) {
      // 1. Annual bulletin doc
      const bullPath = `${bulletinsCol(classeId, c.eleveId)}/Année`
      batch.set(doc(db, bullPath), {
        ...c.bulletin,
        _writtenAt: serverTimestamp(),
      })
      // 2. Denormalized fields on the Eleve doc
      const elevePath = `${elevesCol(classeId)}/${c.eleveId}`
      batch.set(
        doc(db, elevePath),
        c.eleveUpdate,
        { merge: true }
      )
    }
    await batch.commit()
    result.successCount = computed.length
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errorCount = computed.length
    result.errors.push(message)
  }
  return result
}

// ─── Fetch all per-period bulletins for the class ───────────

export async function fetchAllBulletinsForClass(
  classeId: string,
  eleveIds: string[]
): Promise<Record<string, Record<string, Bulletin>>> {
  const result: Record<string, Record<string, Bulletin>> = {}
  await Promise.all(
    eleveIds.map(async (eid) => {
      const snap = await getDocs(collection(db, bulletinsCol(classeId, eid)))
      const byPeriode: Record<string, Bulletin> = {}
      for (const d of snap.docs) {
        // Skip the annual doc itself when feeding back into computation
        if (d.id === 'Année') continue
        byPeriode[d.id] = d.data() as Bulletin
      }
      result[eid] = byPeriode
    })
  )
  return result
}

// ─── Unlock annual closure (admin-only safety net) ──────────

import { deleteDoc, doc as fsDoc, updateDoc, deleteField } from 'firebase/firestore'

/**
 * Removes the annual bulletin doc and clears the denormalized fields
 * on Eleve docs. Admin-only — PP cannot unlock annual closures (this
 * matches the legacy app's behavior where annual decisions were treated
 * as much more permanent than per-period bulletins).
 */
export async function unlockAnnualClosure(args: {
  classeId: string
  eleveIds: string[]
}): Promise<{ deletedCount: number; errors: string[] }> {
  const errors: string[] = []
  let deletedCount = 0
  for (const eid of args.eleveIds) {
    try {
      // Delete annual bulletin doc
      const bullPath = `${bulletinsCol(args.classeId, eid)}/Année`
      await deleteDoc(fsDoc(db, bullPath))
      // Clear Eleve fields
      const elevePath = `${elevesCol(args.classeId)}/${eid}`
      await updateDoc(fsDoc(db, elevePath), {
        moyenneAnnuelle: deleteField(),
        statutAnnuel: deleteField(),
        rang: deleteField(),
      })
      deletedCount++
    } catch (err) {
      errors.push(`${eid}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { deletedCount, errors }
}

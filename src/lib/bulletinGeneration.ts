/**
 * RT-SC · Bulletin generation orchestrator.
 *
 * Pure-ish function (it does Firestore I/O at the end). Given a class +
 * period + the full picture (notes, coefficients, conduite, colles), it:
 *
 *   1. For each élève, gathers their non-abandonné closed notes
 *   2. Computes their conduite (baseConduite minus colle hours / 2)
 *   3. Computes their moyenne générale via the engine
 *   4. Computes the ranking across all élèves
 *   5. Writes one Bulletin doc per élève via a Firestore batch
 *
 * Returns a result with per-élève success/skip/error info. PP can review
 * before/after.
 *
 * Validation (preflight) is a separate function — `runPreflight` — so
 * the UI can show what's wrong WITHOUT triggering writes.
 */

import {
  doc,
  getDocs,
  collection,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol, collesCol } from '@/lib/firestore-keys'
import {
  computeRanking,
  moyenneGenerale,
  noteConduite,
  type ClosedSubject,
  type RankInput,
} from '@/lib/bulletin'
import { totalHeuresForPeriode } from '@/hooks/useColles'
import type {
  Bulletin,
  CoefficientsDoc,
  Colle,
  Eleve,
  Note,
  Periode,
} from '@/types/models'

const CONDUITE_KEY = 'Conduite'

// ─── Inputs ─────────────────────────────────────────────────

export interface GenerationInput {
  classeId: string
  periode: Periode
  eleves: Eleve[]
  /** Indexed by [matiere][eleveId]. Only includes notes WITH estCloture: true OR abandonne: true */
  notesByMatiereByEleve: Record<string, Record<string, Note & { id: string }>>
  /** Coefficients doc for the class's (niveau, série) */
  coefficients: CoefficientsDoc
  /** Indexed by eleveId — colles list per élève */
  collesByEleve: Record<string, Colle[]>
  baseConduite: number
}

// ─── Preflight ──────────────────────────────────────────────

export type PreflightSeverity = 'error' | 'warning'

export interface PreflightIssue {
  severity: PreflightSeverity
  /** Élève id when the issue is specific to one; otherwise undefined */
  eleveId?: string
  /** Matière name when the issue is specific to one */
  matiere?: string
  message: string
}

export interface PreflightResult {
  /** All issues found. Errors block; warnings are informational. */
  issues: PreflightIssue[]
  /** Convenience: true if no errors */
  canProceed: boolean
  /** Per-élève summary count */
  perEleveSummary: { eleveId: string; closedCount: number; abandonedCount: number; missingCount: number }[]
  /** Matières considered (from the coefficients doc, minus Conduite) */
  matieresUsed: string[]
}

export function runPreflight(input: GenerationInput): PreflightResult {
  const issues: PreflightIssue[] = []

  // 1. The matières we care about = the keys in coefficients EXCEPT Conduite
  //    (Conduite is auto-included as one weighted line per élève)
  const matieresUsed = Object.keys(input.coefficients).filter(
    (m) => m !== CONDUITE_KEY
  )
  if (matieresUsed.length === 0) {
    issues.push({
      severity: 'error',
      message:
        "Aucun coefficient défini pour ce niveau. Demandez à l'administration de configurer les coefficients dans Année → Coefficients.",
    })
  }

  // 2. Conduite coefficient must exist
  const coeffConduite = input.coefficients[CONDUITE_KEY]
  if (typeof coeffConduite !== 'number' || coeffConduite <= 0) {
    issues.push({
      severity: 'error',
      message:
        "Coefficient Conduite manquant ou nul. Définissez-le dans Année → Coefficients.",
    })
  }

  // 3. baseConduite must be set
  if (
    typeof input.baseConduite !== 'number' ||
    input.baseConduite <= 0
  ) {
    issues.push({
      severity: 'error',
      message:
        "Note de conduite de base non configurée. Définissez-la dans Année → Paramètres des bulletins.",
    })
  }

  // 4. Per-élève completeness check
  const perEleveSummary: PreflightResult['perEleveSummary'] = []
  for (const eleve of input.eleves) {
    let closedCount = 0
    let abandonedCount = 0
    let missingCount = 0
    for (const matiere of matieresUsed) {
      const note = input.notesByMatiereByEleve[matiere]?.[eleve.id]
      if (!note) {
        missingCount++
        issues.push({
          severity: 'error',
          eleveId: eleve.id,
          matiere,
          message: `${eleve.nom} : aucune note pour ${matiere}. Demandez au professeur de clôturer.`,
        })
      } else if (note.abandonne === true) {
        abandonedCount++
      } else if (note.estCloture === true) {
        closedCount++
        // Sanity check: closed but no moyenne
        if (note.moyenneMatiere === null || note.moyenneMatiere === undefined) {
          issues.push({
            severity: 'warning',
            eleveId: eleve.id,
            matiere,
            message: `${eleve.nom} : ${matiere} clôturée mais moyenne vide. Sera traitée comme 0.`,
          })
        }
      } else {
        missingCount++
        issues.push({
          severity: 'error',
          eleveId: eleve.id,
          matiere,
          message: `${eleve.nom} : ${matiere} pas encore clôturée par le professeur.`,
        })
      }
    }
    perEleveSummary.push({
      eleveId: eleve.id,
      closedCount,
      abandonedCount,
      missingCount,
    })
  }

  // 5. Class size sanity
  if (input.eleves.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Aucun élève dans cette classe.',
    })
  }

  return {
    issues,
    canProceed: issues.every((i) => i.severity !== 'error'),
    perEleveSummary,
    matieresUsed,
  }
}

// ─── Compute (pure, no I/O) ─────────────────────────────────

export interface BulletinComputed {
  eleveId: string
  bulletin: Bulletin
}

export function computeBulletins(
  input: GenerationInput
): BulletinComputed[] {
  const matieresUsed = Object.keys(input.coefficients).filter(
    (m) => m !== CONDUITE_KEY
  )
  const coeffConduite = input.coefficients[CONDUITE_KEY] ?? 0

  // First pass: compute moyenneGenerale per élève
  const intermediate = input.eleves.map((eleve) => {
    const closedSubjects: ClosedSubject[] = []
    for (const matiere of matieresUsed) {
      const note = input.notesByMatiereByEleve[matiere]?.[eleve.id]
      const coeff = input.coefficients[matiere] ?? 0
      // Skip abandoned matières entirely
      if (!note || note.abandonne === true || coeff <= 0) continue
      const mm = note.moyenneMatiere ?? 0
      closedSubjects.push({ matiere, moyenneMatiere: mm, coeff })
    }

    const colles = input.collesByEleve[eleve.id] ?? []
    const totalHeuresColle = totalHeuresForPeriode(colles, input.periode)
    const conduite = noteConduite(input.baseConduite, totalHeuresColle)

    const result = moyenneGenerale({
      closedSubjects,
      noteConduite: conduite,
      coeffConduite,
    })

    return {
      eleveId: eleve.id,
      genre: eleve.genre,
      conduite,
      totalHeuresColle,
      moyenne: result.moyenneGenerale,
      totalPoints: result.totalPoints,
      totalCoeffs: result.totalCoeffs,
    }
  })

  // Second pass: compute ranking
  const rankInput: RankInput[] = intermediate.map((x) => ({
    id: x.eleveId,
    moyenneGenerale: x.moyenne,
    genre: x.genre,
  }))
  const ranking = computeRanking(rankInput)
  const rankByEleve = new Map(ranking.map((r) => [r.id, r]))

  // Build bulletin docs
  return intermediate.map((x) => ({
    eleveId: x.eleveId,
    bulletin: {
      periode: input.periode,
      moyenneGenerale: x.moyenne,
      totalPoints: x.totalPoints,
      totalCoeffs: x.totalCoeffs,
      noteConduite: x.conduite,
      totalHeuresColle: x.totalHeuresColle,
      coeffConduite,
      estVerrouille: true,
      dateCalcul: new Date().toISOString(),
      rang: rankByEleve.get(x.eleveId)?.rang,
    },
  }))
}

// ─── Write (Firestore I/O) ──────────────────────────────────

export interface GenerationWriteResult {
  successCount: number
  errorCount: number
  errors: { eleveId: string; message: string }[]
}

/**
 * Writes one Bulletin doc per élève. Doc id = period name (so it's
 * idempotent — re-running overwrites).
 *
 * Uses a single Firestore batched write. A class of up to ~500 élèves
 * fits in one batch. For larger classes we'd need to chunk; currently
 * not a concern.
 */
export async function writeBulletins(
  input: GenerationInput,
  computed: BulletinComputed[]
): Promise<GenerationWriteResult> {
  const result: GenerationWriteResult = {
    successCount: 0,
    errorCount: 0,
    errors: [],
  }

  if (computed.length === 0) return result

  try {
    const batch = writeBatch(db)
    for (const c of computed) {
      const path = `${bulletinsCol(input.classeId, c.eleveId)}/${c.bulletin.periode}`
      batch.set(doc(db, path), {
        ...c.bulletin,
        // Override dateCalcul with serverTimestamp for consistency
        dateCalcul: c.bulletin.dateCalcul, // keep as ISO string per Bulletin type
        _writtenAt: serverTimestamp(),
      })
    }
    await batch.commit()
    result.successCount = computed.length
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errorCount = computed.length
    result.errors.push({ eleveId: '*', message })
  }

  return result
}

/** Convenience: preflight + (if ok) compute + write. */
export async function generatePeriodBulletins(input: GenerationInput): Promise<{
  preflight: PreflightResult
  write?: GenerationWriteResult
}> {
  const preflight = runPreflight(input)
  if (!preflight.canProceed) return { preflight }
  const computed = computeBulletins(input)
  const write = await writeBulletins(input, computed)
  return { preflight, write }
}

/**
 * Fetch colles for every élève of a class in parallel.
 * Used by the BulletinsMode dashboard before generation.
 */
export async function fetchAllCollesForClass(
  classeId: string,
  eleveIds: string[]
): Promise<Record<string, Colle[]>> {
  const result: Record<string, Colle[]> = {}
  const promises = eleveIds.map(async (eid) => {
    const snap = await getDocs(collection(db, collesCol(classeId, eid)))
    result[eid] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Colle, 'id'>),
    }))
  })
  await Promise.all(promises)
  return result
}

// ─── Unlock bulletins for a period ──────────────────────────

import { deleteDoc, doc as fsDoc2 } from 'firebase/firestore'

/**
 * Delete the Bulletin docs for a (class, period). Used by the PP after
 * unlocking matières, so they can fix data and regenerate.
 *
 * Idempotent — deleting a non-existent doc is a no-op in Firestore.
 */
export async function unlockBulletinsForPeriod(args: {
  classeId: string
  periode: Periode
  eleveIds: string[]
}): Promise<{ deletedCount: number; errors: string[] }> {
  const errors: string[] = []
  let deletedCount = 0
  // Done sequentially to keep error reporting simple. Class sizes are small.
  for (const eid of args.eleveIds) {
    try {
      const path = `${bulletinsCol(args.classeId, eid)}/${args.periode}`
      await deleteDoc(fsDoc2(db, path))
      deletedCount++
    } catch (err) {
      errors.push(`${eid}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { deletedCount, errors }
}

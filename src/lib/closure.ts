/**
 * RT-SC · Closure intelligence helpers (Phase 4c-i — Layer A).
 *
 * Pure functions used by the per-matière closure modal to classify each
 * élève's state and let the prof / PP make explicit decisions before
 * locking the period.
 *
 * Layer A — per-matière completeness check:
 *   - "Complet"   : at least one interro AND at least one devoir
 *   - "Incomplet" : some data but missing interros or devoirs
 *   - "Vide"      : no interros AND no devoirs
 *
 * For Vide and Incomplet élèves, the prof must explicitly resolve before
 * close: either mark them as "abandonné" (skips the matière in their
 * bulletin) or "continue anyway" (locks with whatever data is there) or
 * "retour saisie" (cancels close).
 *
 * Layer B (mode-based outlier detection across the class) lives in
 * Phase 4c-ii.
 */

export type EleveCompleteness = 'complet' | 'incomplet' | 'vide'

export interface EleveClassificationInput {
  eleveId: string
  interrosCount: number      // count of non-null interros
  hasAnyDevoir: boolean      // devoir1 OR devoir2 has a value
}

export interface EleveClassification {
  eleveId: string
  state: EleveCompleteness
}

export function classifyEleves(
  inputs: EleveClassificationInput[]
): EleveClassification[] {
  return inputs.map((i) => ({
    eleveId: i.eleveId,
    state: classifyOne(i.interrosCount, i.hasAnyDevoir),
  }))
}

export function classifyOne(
  interrosCount: number,
  hasAnyDevoir: boolean
): EleveCompleteness {
  if (interrosCount === 0 && !hasAnyDevoir) return 'vide'
  if (interrosCount === 0 || !hasAnyDevoir) return 'incomplet'
  return 'complet'
}

/** Resolution decision for a non-Complet élève made during the closure modal. */
export type ResolutionAction = 'continuer' | 'abandonner' | 'retour'

export interface CompletionCounts {
  complet: number
  incomplet: number
  vide: number
  total: number
}

export function countByCompleteness(
  classifications: EleveClassification[]
): CompletionCounts {
  const c = { complet: 0, incomplet: 0, vide: 0, total: classifications.length }
  for (const x of classifications) {
    if (x.state === 'complet') c.complet++
    else if (x.state === 'incomplet') c.incomplet++
    else c.vide++
  }
  return c
}

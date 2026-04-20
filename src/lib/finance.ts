/**
 * RT-SC · Finance computations.
 * Pure logic for school fees + gratuité filles.
 */

import type { FinancesConfig, Genre } from '@/types/models'
import { detectIsSecondCycle, isFille } from './benin'

// ─────────────────────────────────────────────────────────────
// Target (cible) computation
// ─────────────────────────────────────────────────────────────

export interface CibleInput {
  genre: Genre | string
  /** Either niveau ("3ème", "Terminale") or rendered class name ("Tle D1") */
  classeName: string | undefined
}

/**
 * Compute total amount due for a student.
 *
 * Rule from legacy:
 *   cible = fraisAnnexes
 *   if NOT (fille AND gratuiteFor[cycle]) → cible += scolarite
 *
 * In other words:
 *   - Every student pays fraisAnnexes.
 *   - Boys always pay scolarite + fraisAnnexes.
 *   - Girls pay only fraisAnnexes IF gratuité is enabled for their cycle.
 */
export function calculerCibleFinanciere(
  config: FinancesConfig,
  eleve: CibleInput
): number {
  const isSecond = detectIsSecondCycle(eleve.classeName)
  const gratuite = isSecond ? config.gratuiteFilles2nd : config.gratuiteFilles1er

  let cible = Number(config.fraisAnnexes) || 0
  if (!isFille(eleve.genre) || !gratuite) {
    cible += Number(config.scolarite) || 0
  }
  return cible
}

// ─────────────────────────────────────────────────────────────
// Payment status
// ─────────────────────────────────────────────────────────────

export type PaiementStatut = 'solde' | 'partiel' | 'rien'

export interface PaiementBilan {
  totalPaye: number
  cible: number
  reste: number
  pourcentage: number  // 0–100
  statut: PaiementStatut
}

export function calculerBilanPaiements(totalPaye: number, cible: number): PaiementBilan {
  const reste = Math.max(0, cible - totalPaye)
  const pourcentage = cible > 0 ? Math.min(100, Math.round((totalPaye / cible) * 100)) : 0
  let statut: PaiementStatut
  if (cible === 0 || (totalPaye >= cible && cible > 0)) statut = 'solde'
  else if (totalPaye > 0) statut = 'partiel'
  else statut = 'rien'

  return { totalPaye, cible, reste, pourcentage, statut }
}

// ─────────────────────────────────────────────────────────────
// FCFA formatting
// ─────────────────────────────────────────────────────────────

export function formatFCFA(amount: number | undefined | null): string {
  const n = Number(amount ?? 0)
  return n.toLocaleString('fr-FR') + ' F'
}

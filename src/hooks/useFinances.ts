/**
 * RT-SC · Finances config — read + write hooks.
 *
 * Config lives at /ecole/finances as a single doc:
 *   {
 *     scolarite: number,         // FCFA, applies to most élèves
 *     fraisAnnexes: number,      // optional extra fixed fees per élève
 *     gratuiteFilles1er: bool,   // filles in 6è–3è: exempt from scolarité
 *     gratuiteFilles2nd: bool,   // filles in 2nde–Tle: exempt from scolarité
 *   }
 *
 * The gratuité booleans reflect Béninois government subsidies for
 * filles in public secondary schools. When enabled, the expected cible
 * for affected élèves drops to just fraisAnnexes (scolarité = 0).
 *
 * Read is cached 10min. Writes are optimistic.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { ecoleFinancesDoc } from '@/lib/firestore-keys'
import type { FinancesConfig } from '@/types/models'

const TEN_MIN = 10 * 60_000

const DEFAULT_CONFIG: FinancesConfig = {
  scolarite: 0,
  fraisAnnexes: 0,
  gratuiteFilles1er: false,
  gratuiteFilles2nd: false,
}

export function useFinancesConfig() {
  return useQuery<FinancesConfig>({
    queryKey: ['finances', 'config'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, ecoleFinancesDoc()))
      if (!snap.exists()) return DEFAULT_CONFIG
      const data = snap.data() as Partial<FinancesConfig>
      return {
        scolarite: Number(data.scolarite) || 0,
        fraisAnnexes: Number(data.fraisAnnexes) || 0,
        gratuiteFilles1er: !!data.gratuiteFilles1er,
        gratuiteFilles2nd: !!data.gratuiteFilles2nd,
      }
    },
    staleTime: TEN_MIN,
  })
}

export function useUpdateFinancesConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<FinancesConfig>) => {
      await setDoc(
        doc(db, ecoleFinancesDoc()),
        {
          scolarite: Number(patch.scolarite) || 0,
          fraisAnnexes: Number(patch.fraisAnnexes) || 0,
          gratuiteFilles1er: !!patch.gratuiteFilles1er,
          gratuiteFilles2nd: !!patch.gratuiteFilles2nd,
        },
        { merge: true }
      )
    },
    onSuccess: () => {
      // Financial config changes immediately affect cible calculations
      // for every élève. Use refetch (not just invalidate) so the next
      // computation uses fresh numbers — critical for correct balance
      // display in Terminal de caisse + Bilan.
      void qc.refetchQueries({ queryKey: ['finances', 'config'] })
      // Bilan's cached computation is now wrong — drop it entirely.
      qc.removeQueries({ queryKey: ['finances', 'bilan'] })
    },
  })
}

/**
 * Compute the expected "cible" (target amount owed) for an élève given
 * their genre + niveau + the finances config.
 */
export function calculerCible(
  genre: string | undefined,
  niveau: string | undefined,
  cfg: FinancesConfig
): number {
  let cible = Number(cfg.fraisAnnexes) || 0
  const isFille = (genre ?? '').toUpperCase().startsWith('F')

  const niveauLower = (niveau ?? '').toLowerCase()
  const isSecondCycle = ['2nde', '1ère', '1ere', 'terminale', 'tle'].some((l) =>
    niveauLower.includes(l)
  )

  const exempt = isFille && (isSecondCycle ? cfg.gratuiteFilles2nd : cfg.gratuiteFilles1er)
  if (!exempt) cible += Number(cfg.scolarite) || 0

  return cible
}

// ─────────────────────────────────────────────────────────────
// Payment status — three precise terms
// ─────────────────────────────────────────────────────────────

/**
 * Three (and only three) payment states. Replaces the legacy ambiguous
 * "à jour" / "en retard" terminology.
 */
export type EtatPaiement = 'aucun' | 'partiel' | 'solde'

export interface EtatPaiementInfo {
  etat: EtatPaiement
  /** Display label, e.g. "Aucun paiement" */
  label: string
  /** Badge variant matching the design system. */
  variant: 'danger' | 'warning' | 'success'
}

/**
 * Compute the precise payment state from totals.
 *
 * Rules (as confirmed by Ludosky):
 *   - paye = 0           → 'aucun'    (Aucun paiement)
 *   - 0 < paye < cible   → 'partiel'  (Paiement partiel)
 *   - paye >= cible      → 'solde'    (Soldé)
 *
 * If cible is 0 (no scolarité configured), we still return 'aucun' for
 * paye=0 and 'solde' for paye>0, since there's nothing to owe.
 */
export function getEtatPaiement(paye: number, cible: number): EtatPaiementInfo {
  if (paye <= 0) {
    return { etat: 'aucun', label: 'Aucun paiement', variant: 'danger' }
  }
  if (cible > 0 && paye < cible) {
    return { etat: 'partiel', label: 'Paiement partiel', variant: 'warning' }
  }
  return { etat: 'solde', label: 'Soldé', variant: 'success' }
}

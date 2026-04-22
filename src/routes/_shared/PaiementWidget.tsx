/**
 * RT-SC · PaiementWidget — live Accueil tile for parents.
 *
 * Replaces the "Bientôt" Paiement PreviewWidget that was previously
 * on the Parent Accueil. Shows at-a-glance financial status with
 * three visual states:
 *
 *   LOADING: skeleton
 *   SOLDÉ: green success tile ("Soldé intégralement")
 *   DUE: navy tile with reste-à-payer amount + % progress chip
 *
 * Tap → parent navigates to the Paiement tab for the full detail.
 *
 * Reads via existing hooks (useElevePaiements, useFinancesConfig,
 * useEleves, useClasse) so we share the cache with the full Paiement
 * tab — no duplicate round-trips.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Wallet, CheckCircle2, ChevronRight } from 'lucide-react'
import { useElevePaiements, totalPaiements, formatFCFA } from '@/hooks/usePaiements'
import { useFinancesConfig, calculerCible } from '@/hooks/useFinances'
import { useEleves } from '@/hooks/useEleves'
import { useClasse } from '@/hooks/useClasses'
import { cn } from '@/lib/cn'

interface Props {
  classeId: string
  eleveId: string
  /** Tap callback — hook up to the ParentApp's tab navigator */
  onOpen?: () => void
}

export function PaiementWidget({ classeId, eleveId, onOpen }: Props) {
  const { data: paiements = [], isLoading: loadingPaiements } = useElevePaiements(
    classeId,
    eleveId
  )
  const { data: financesConfig, isLoading: loadingConfig } = useFinancesConfig()
  const { data: eleves = [], isLoading: loadingEleves } = useEleves(classeId)
  const { data: classe } = useClasse(classeId)

  const eleve = useMemo(() => eleves.find((e) => e.id === eleveId), [eleves, eleveId])

  const loading = loadingPaiements || loadingConfig || loadingEleves

  const summary = useMemo(() => {
    if (!financesConfig || !eleve) return null
    const cible = calculerCible(eleve.genre, classe?.niveau, financesConfig)
    const paye = totalPaiements(paiements)
    const reste = Math.max(0, cible - paye)
    const solde = reste <= 0 && cible > 0
    const pct = cible > 0 ? Math.min(100, Math.round((paye / cible) * 100)) : 0
    return { cible, paye, reste, solde, pct }
  }, [financesConfig, eleve, classe?.niveau, paiements])

  // Loading skeleton — same height as the real widget to avoid layout jitter
  if (loading || !summary) {
    return (
      <div className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-ink-100 animate-pulse" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-3.5 w-32 bg-ink-100 rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-ink-50 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // Edge case — school hasn't configured fees yet. Don't clutter the
  // Accueil with a "0 FCFA" tile; fall back to a quiet explainer.
  if (summary.cible <= 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-bg text-navy/60 ring-1 ring-navy/10">
            <Wallet className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
              Paiement de scolarité
            </p>
            <p className="text-[0.75rem] text-ink-500 mt-0.5 leading-snug">
              Les frais seront publiés par l'administration.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const solde = summary.solde

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={onOpen ? { scale: 0.99 } : undefined}
      className={cn(
        'w-full text-left rounded-xl px-4 py-3.5 transition-colors',
        'shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]',
        solde
          ? 'bg-success-bg/50 ring-1 ring-success/25 hover:ring-success/45'
          : 'bg-white ring-1 ring-ink-100 hover:ring-navy/30',
        !onOpen && 'cursor-default'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1',
            solde
              ? 'bg-success/15 text-success-dark ring-success/30'
              : 'bg-info-bg text-navy ring-navy/15'
          )}
        >
          {solde ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          ) : (
            <Wallet className="h-5 w-5" aria-hidden />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
              Paiement de scolarité
            </p>
            {!solde && (
              <span className="shrink-0 text-[0.65rem] font-bold text-navy/70 bg-gold-pale ring-1 ring-gold/30 rounded-full px-1.5 py-0.5">
                {summary.pct}%
              </span>
            )}
          </div>

          {solde ? (
            <p className="text-[0.78rem] text-success-dark font-semibold mt-0.5 leading-snug">
              Soldé intégralement · {formatFCFA(summary.paye)}
            </p>
          ) : (
            <p className="text-[0.78rem] text-ink-600 mt-0.5 leading-snug">
              Reste{' '}
              <span className="font-display font-bold text-navy">
                {formatFCFA(summary.reste)}
              </span>{' '}
              à verser
            </p>
          )}
        </div>

        {onOpen && (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-ink-300"
            aria-hidden
          />
        )}
      </div>
    </motion.button>
  )
}

/**
 * RT-SC · Parent Paiement tab (read-only view of child's finances).
 *
 * Shows the parent:
 *   1. Summary hero card — cible (total due), payé (total paid),
 *      reste (remaining), SOLDÉ badge if fully paid
 *   2. Progress bar visualizing % paid
 *   3. Historical paiements list (date, montant, caissier, method, note)
 *
 * This mirrors the data the caissier/admin sees in their finances
 * module, but without any write capabilities. Parents see a read-only
 * statement of their child's account.
 *
 * The "cible" (target amount) uses the same `calculerCible` helper
 * used across the app, which accounts for:
 *   - Base scolarite from ecole/finances
 *   - Frais annexes
 *   - Gratuité filles (1er/2nd cycle)
 *   - Per-eleve exemption flag
 *
 * Real-time updates: usePaiements hook uses onSnapshot under the
 * hood, so the moment the caissier records a payment in their
 * terminal, the parent's view reflects it.
 */

import { useMemo } from 'react'
import {
  Wallet,
  CheckCircle2,
  Clock,
  Receipt,
  User2,
  Calendar,
  Info,
} from 'lucide-react'
import { useElevePaiements, totalPaiements, tsToDate, formatFCFA } from '@/hooks/usePaiements'
import { useFinancesConfig, calculerCible } from '@/hooks/useFinances'
import { useEleves } from '@/hooks/useEleves'
import { useClasse } from '@/hooks/useClasses'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'

interface Props {
  classeId: string
  eleveId: string
  eleveName: string
}

export function ParentPaiementTab({ classeId, eleveId, eleveName }: Props) {
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
    const solde = reste <= 0
    const pct = cible > 0 ? Math.min(100, Math.round((paye / cible) * 100)) : 0

    return { cible, paye, reste, solde, pct }
  }, [financesConfig, eleve, classe?.niveau, paiements])

  if (loading) {
    return (
      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12">
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Information indisponible"
          description="Les informations de paiement ne peuvent pas être chargées pour le moment. Réessayez plus tard."
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-5">
      {/* Summary hero */}
      <Section>
        <SectionHeader
          title="État financier"
          description={`Suivi des frais de scolarité de ${eleveName}.`}
        />

        <div
          className={cn(
            'rounded-xl border-[1.5px] overflow-hidden',
            summary.solde
              ? 'bg-success-bg/40 border-success/30'
              : 'bg-white border-ink-100'
          )}
        >
          {/* Status badge row */}
          <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400 leading-none">
                Reste à payer
              </p>
              <p
                className={cn(
                  'font-display font-bold leading-tight mt-1.5',
                  summary.solde
                    ? 'text-success-dark text-[1.35rem]'
                    : 'text-navy text-[1.5rem]'
                )}
              >
                {summary.solde ? 'Soldé intégralement' : formatFCFA(summary.reste)}
              </p>
            </div>
            <SoldeBadge solde={summary.solde} />
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-3 pt-1">
            <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  summary.solde ? 'bg-success' : 'bg-navy'
                )}
                style={{ width: `${summary.pct}%` }}
              />
            </div>
            <p className="text-[0.72rem] text-ink-500 mt-1.5 font-semibold">
              {summary.pct}% versé
            </p>
          </div>

          {/* Payé / Total breakdown */}
          <div className="grid grid-cols-2 border-t border-ink-100/60 bg-white/40">
            <div className="px-4 py-3 border-r border-ink-100/60">
              <p className="text-[0.68rem] uppercase tracking-widest font-bold text-ink-400 leading-none">
                Déjà versé
              </p>
              <p className="font-display text-[1.1rem] font-bold text-success-dark leading-tight mt-1">
                {formatFCFA(summary.paye)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.68rem] uppercase tracking-widest font-bold text-ink-400 leading-none">
                Total dû
              </p>
              <p className="font-display text-[1.1rem] font-bold text-navy leading-tight mt-1">
                {formatFCFA(summary.cible)}
              </p>
            </div>
          </div>
        </div>

        {/* Explainer */}
        <div className="mt-3 rounded-md bg-info-bg/60 border border-navy/15 px-3.5 py-2.5 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-navy shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.75rem] text-ink-600 leading-snug">
            Pour régler les frais de scolarité, adressez-vous à la caisse
            de l'école. Les paiements sont enregistrés immédiatement et
            vous les retrouverez dans l'historique ci-dessous.
          </p>
        </div>
      </Section>

      {/* History */}
      <Section>
        <SectionHeader
          title="Historique des paiements"
          description={
            paiements.length === 0
              ? 'Aucun paiement enregistré pour le moment.'
              : `${paiements.length} versement${paiements.length > 1 ? 's' : ''} enregistré${paiements.length > 1 ? 's' : ''}.`
          }
        />

        {paiements.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title="Aucun paiement"
            description="Lorsqu'un versement sera enregistré par la caisse, il apparaîtra ici."
          />
        ) : (
          <ol className="space-y-2">
            {paiements.map((p, idx) => (
              <PaiementRow
                key={p.id}
                montant={p.montant}
                date={tsToDate(p.date)}
                caissier={p.caissier}
                methode={p.methode}
                note={p.note}
                tranche={paiements.length - idx}
              />
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SoldeBadge({ solde }: { solde: boolean }) {
  if (solde) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success text-white px-2.5 py-1 text-[0.75rem] font-bold shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Soldé
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-warning text-white px-2.5 py-1 text-[0.75rem] font-bold shrink-0">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      En cours
    </span>
  )
}

interface PaiementRowProps {
  montant: number
  date: Date | null
  caissier?: string
  methode?: string
  note?: string
  tranche: number
}

function PaiementRow({ montant, date, caissier, methode, note, tranche }: PaiementRowProps) {
  return (
    <li className="rounded-lg bg-white border-[1.5px] border-ink-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.7rem] uppercase tracking-wider font-bold text-ink-400">
            Tranche n° {tranche}
          </p>
          <p className="font-display text-[1.05rem] font-bold text-success-dark mt-0.5 leading-tight">
            + {formatFCFA(montant)}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 text-[0.72rem] text-ink-500 flex-wrap">
            {date && (
              <>
                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                <span>{formatDate(date)}</span>
              </>
            )}
            {caissier && (
              <>
                <span className="text-ink-300">·</span>
                <User2 className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">Enregistré par {caissier}</span>
              </>
            )}
            {methode && (
              <>
                <span className="text-ink-300">·</span>
                <span className="font-semibold">{methode}</span>
              </>
            )}
          </div>
          {note && (
            <p className="text-[0.72rem] text-ink-500 mt-1.5 italic leading-snug">
              « {note} »
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

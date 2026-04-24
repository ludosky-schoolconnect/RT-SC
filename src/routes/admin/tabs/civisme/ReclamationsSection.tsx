/**
 * RT-SC · Civisme — Réclamations sub-section (admin).
 *
 * The queue of pending reward claims. Admin sees them ordered by
 * demandeeLe desc, with statut filter tabs (En attente / Honorées /
 * Annulées / Toutes).
 *
 * Per-row actions on pending reclamations:
 *   - ✅ Honorer (atomic debit + history entry)
 *   - ❌ Annuler (with optional reason)
 *
 * Visible info per row: eleve, classe, récompense, coût, date, ticket code.
 * Non-pending rows show their final state + who fulfilled/cancelled.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Gift,
  CheckCircle2,
  XCircle,
  Hourglass,
  Coins,
  Ticket as TicketIcon,
  Inbox,
  Plus,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import {
  useAllReclamations,
  useFulfillReclamation,
  useCancelReclamation,
} from '@/hooks/useReclamations'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { NouvelleReclamationModal } from './NouvelleReclamationModal'
import { cn } from '@/lib/cn'
import type { Reclamation, ReclamationStatut } from '@/types/models'

type FilterId = 'pending' | 'fulfilled' | 'cancelled' | 'all'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'pending', label: 'En attente' },
  { id: 'fulfilled', label: 'Honorées' },
  { id: 'cancelled', label: 'Annulées' },
  { id: 'all', label: 'Toutes' },
]

export function ReclamationsSection() {
  const profil = useAuthStore((s) => s.profil)
  const [filter, setFilter] = useState<FilterId>('pending')
  const [newOpen, setNewOpen] = useState(false)
  const { data: reclamations = [], isLoading } = useAllReclamations()

  const filtered = useMemo(() => {
    if (filter === 'all') return reclamations
    const target: ReclamationStatut =
      filter === 'pending'
        ? 'demandee'
        : filter === 'fulfilled'
          ? 'fulfillee'
          : 'annulee'
    return reclamations.filter((r) => r.statut === target)
  }, [reclamations, filter])

  // Badge counts per filter for the tab strip
  const counts = useMemo(() => {
    return {
      pending: reclamations.filter((r) => r.statut === 'demandee').length,
      fulfilled: reclamations.filter((r) => r.statut === 'fulfillee').length,
      cancelled: reclamations.filter((r) => r.statut === 'annulee').length,
      all: reclamations.length,
    }
  }, [reclamations])

  return (
    <Section>
      <SectionHeader
        title="Réclamations de récompenses"
        description="Les élèves réclament des récompenses avec leurs points. Honorez-les après remise physique."
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => setNewOpen(true)}
            disabled={!profil}
          >
            Nouvelle
          </Button>
        }
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
        {FILTERS.map((f) => {
          const isActive = f.id === filter
          const count = counts[f.id]
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.78rem] font-bold transition-all border-[1.5px] min-h-[36px]',
                isActive
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-navy/30 hover:text-navy'
              )}
            >
              <span>{f.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full text-[0.6rem] font-black px-1.5 min-w-[16px] h-[16px]',
                    isActive
                      ? 'bg-white/20 text-white'
                      : f.id === 'pending'
                        ? 'bg-warning text-white'
                        : 'bg-ink-100 text-ink-700'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title={
            filter === 'pending'
              ? 'Aucune demande en attente'
              : filter === 'fulfilled'
                ? 'Aucune réclamation honorée'
                : filter === 'cancelled'
                  ? 'Aucune réclamation annulée'
                  : 'Aucune réclamation'
          }
          description={
            filter === 'pending'
              ? "Les demandes des élèves apparaîtront ici. Vous verrez le solde de l'élève et pourrez honorer la réclamation une fois l'objet remis."
              : 'Rien à afficher dans cette catégorie.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <ReclamationRow key={r.id} reclamation={r} />
          ))}
        </div>
      )}

      {profil && (
        <NouvelleReclamationModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          adminUid={profil.id}
          adminNom={profil.nom}
        />
      )}
    </Section>
  )
}

// ─── Per-row ───────────────────────────────────────────────

function ReclamationRow({ reclamation: r }: { reclamation: Reclamation }) {
  const profil = useAuthStore((s) => s.profil)
  const fulfillMut = useFulfillReclamation()
  const cancelMut = useCancelReclamation()
  const confirm = useConfirm()
  const toast = useToast()
  const isPending = r.statut === 'demandee'

  const demandeeLe = (r.demandeeLe as { toDate?: () => Date })?.toDate?.()

  async function handleFulfill() {
    if (!profil) return
    const ok = await confirm({
      title: `Honorer pour ${r.eleveNom} ?`,
      message: `Confirmez que vous avez remis "${r.recompenseNom}" à l'élève. ${r.pointsCout} pts seront déduits de son solde.`,
      confirmLabel: 'Honorer',
      variant: 'warning',
    })
    if (!ok) return

    try {
      await fulfillMut.mutateAsync({
        reclamationId: r.id,
        fulfilleeParUid: profil.id,
        fulfilleeParNom: profil.nom,
      })
      toast.success('Récompense remise. Réclamation honorée.')
    } catch (err) {
      console.error('[ReclamationRow] fulfill failed:', err)
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'honoration."
      )
    }
  }

  async function handleCancel() {
    if (!profil) return
    const ok = await confirm({
      title: `Annuler la réclamation ?`,
      message: `${r.eleveNom} ne recevra pas « ${r.recompenseNom} ». Ses ${r.pointsCout} pts seront remboursés immédiatement.`,
      confirmLabel: 'Annuler',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await cancelMut.mutateAsync({
        reclamationId: r.id,
        cancelledByUid: profil.id,
        cancelledByNom: profil.nom,
      })
      toast.success('Réclamation annulée.')
    } catch (err) {
      console.error('[ReclamationRow] cancel failed:', err)
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'annulation."
      )
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white rounded-lg border-[1.5px] px-4 py-3',
        isPending ? 'border-warning/40' : 'border-ink-100'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
              {r.eleveNom}
            </p>
            <span className="text-[0.72rem] text-ink-500 font-semibold">
              · {r.classeNom}
            </span>
            <StatutPill statut={r.statut} />
          </div>
          <p className="text-[0.88rem] text-ink-700 mt-1 leading-snug">
            Demande : <strong className="text-navy">{r.recompenseNom}</strong>
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[0.7rem]">
            <span className="inline-flex items-center gap-1 rounded-md bg-navy text-white px-2 py-0.5 font-bold">
              <Coins className="h-3 w-3" aria-hidden />
              {r.pointsCout} pts
            </span>
            <span className="inline-flex items-center gap-1 text-ink-500">
              <TicketIcon className="h-3 w-3" aria-hidden />
              <span className="font-mono">{r.ticketCode}</span>
            </span>
            {demandeeLe && (
              <span className="text-ink-500">
                {demandeeLe.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <span className="text-ink-500 capitalize">
              · par {labelForActor(r)}
            </span>
          </div>

          {/* Audit trail line for non-pending */}
          {r.statut === 'fulfillee' && r.fulfilleeLe && (
            <p className="text-[0.68rem] text-success-dark italic mt-1.5">
              Honorée le{' '}
              {(r.fulfilleeLe as { toDate?: () => Date })
                ?.toDate?.()
                ?.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              {r.fulfilleeParNom && ` par ${r.fulfilleeParNom}`}
            </p>
          )}
          {r.statut === 'annulee' && (
            <p className="text-[0.68rem] text-danger italic mt-1.5">
              Annulée{r.annuleeParNom && ` par ${r.annuleeParNom}`}
              {r.annulationReason && ` — "${r.annulationReason}"`}
            </p>
          )}
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleFulfill}
            loading={fulfillMut.isPending}
            leadingIcon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            className="flex-1"
          >
            Honorer
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={fulfillMut.isPending || cancelMut.isPending}
            leadingIcon={<XCircle className="h-4 w-4" aria-hidden />}
          >
            Annuler
          </Button>
        </div>
      )}
    </motion.div>
  )
}

function StatutPill({ statut }: { statut: ReclamationStatut }) {
  if (statut === 'demandee') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg text-warning-dark px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ring-1 ring-warning/30">
        <Hourglass className="h-2.5 w-2.5" aria-hidden />
        En attente
      </span>
    )
  }
  if (statut === 'fulfillee') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success text-white px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider">
        <Gift className="h-2.5 w-2.5" aria-hidden />
        Honorée
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 text-ink-600 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider">
      <XCircle className="h-2.5 w-2.5" aria-hidden />
      Annulée
    </span>
  )
}

function labelForActor(r: Reclamation): string {
  if (r.demandeeParType === 'eleve') return "l'élève"
  if (r.demandeeParType === 'prof') return r.demandeeParNom ?? 'un enseignant'
  return r.demandeeParNom ?? "l'administration"
}

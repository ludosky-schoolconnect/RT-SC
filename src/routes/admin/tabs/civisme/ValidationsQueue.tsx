/**
 * RT-SC · Civisme — Validations queue (flat, cross-quest).
 *
 * A single list of every pending claim across all quests, sorted
 * oldest-first (FIFO). Admin can validate or reject each claim
 * without having to expand individual quest cards.
 */

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ListChecks,
  Check,
  X,
  Coins,
  Clock,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import {
  useAllPendingClaims,
  useValidateClaim,
  useRejectClaim,
} from '@/hooks/useQuetes'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import type { QueteClaim } from '@/types/models'

export function ValidationsQueue() {
  const { data: claims = [], isLoading } = useAllPendingClaims()

  // Oldest first — FIFO processing order
  const sorted = useMemo(
    () =>
      [...claims].sort((a, b) => {
        const aMs = (a.claimedAt as { toMillis?: () => number })?.toMillis?.() ?? 0
        const bMs = (b.claimedAt as { toMillis?: () => number })?.toMillis?.() ?? 0
        return aMs - bMs
      }),
    [claims]
  )

  return (
    <Section>
      <SectionHeader
        title="File de validation"
        description={
          isLoading
            ? 'Chargement…'
            : sorted.length === 0
              ? 'Aucune participation en attente'
              : `${sorted.length} participation${sorted.length > 1 ? 's' : ''} en attente`
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="File vide"
          description="Toutes les participations ont été traitées. Revenez après que des élèves auront soumis de nouvelles quêtes."
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sorted.map((claim) => (
              <ClaimQueueRow key={claim.id} claim={claim} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  )
}

// ─── Per-claim row ──────────────────────────────────────────

function ClaimQueueRow({ claim }: { claim: QueteClaim }) {
  const validateMut = useValidateClaim()
  const rejectMut = useRejectClaim()
  const toast = useToast()
  const confirm = useConfirm()
  const profil = useAuthStore((s) => s.profil)

  const claimedAt = (claim.claimedAt as { toDate?: () => Date })?.toDate?.()
  const submitting = validateMut.isPending || rejectMut.isPending

  async function handleValidate() {
    if (!profil) return
    try {
      const result = await validateMut.mutateAsync({
        queteId: claim.queteId,
        claimId: claim.id,
        validatedByUid: profil.id,
        validatedByNom: profil.nom,
      })
      toast.success(`+${claim.pointsRecompense} pts attribués à ${claim.eleveNom} (solde : ${result.newBalance} pts)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation impossible.')
    }
  }

  async function handleReject() {
    if (!profil) return
    const ok = await confirm({
      title: `Rejeter la participation de ${claim.eleveNom} ?`,
      message: `Le créneau sera libéré et l'élève ne recevra pas les ${claim.pointsRecompense} pts pour « ${claim.queteTitre} ».`,
      confirmLabel: 'Rejeter',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await rejectMut.mutateAsync({ queteId: claim.queteId, claimId: claim.id })
      toast.success('Participation rejetée.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejet impossible.')
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="bg-white rounded-lg border-[1.5px] border-warning/30 px-4 py-3"
    >
      {/* Top row: student + quest context */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-[0.95rem] font-bold text-navy leading-tight truncate">
              {claim.eleveNom}
            </p>
            <span className="text-[0.72rem] text-ink-500 font-semibold shrink-0">
              {claim.classeNom}
            </span>
          </div>
          <p className="text-[0.82rem] text-ink-700 mt-0.5 leading-snug truncate">
            {claim.queteTitre}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[0.68rem] text-ink-500 flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold text-success-dark">
              <Coins className="h-3 w-3" aria-hidden />
              +{claim.pointsRecompense} pts
            </span>
            {claimedAt && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden />
                  {claimedAt.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </>
            )}
            {claim.claimedByNom && (
              <>
                <span>·</span>
                <span>par {claim.claimedByNom}</span>
              </>
            )}
          </div>
        </div>
        <span className="font-mono text-[0.68rem] font-semibold text-ink-400 shrink-0 mt-0.5">
          {claim.ticketCode}
        </span>
      </div>

      {/* Action buttons */}
      <div className={cn('flex gap-2 mt-3', submitting && 'opacity-60 pointer-events-none')}>
        <button
          type="button"
          onClick={handleValidate}
          disabled={submitting}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-success/40 bg-success-bg px-3 py-1.5 text-[0.78rem] font-bold text-success-dark hover:bg-success/15 transition-colors disabled:cursor-not-allowed"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          Valider +{claim.pointsRecompense} pts
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={submitting}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-danger/25 bg-danger-bg/50 px-3 py-1.5 text-[0.78rem] font-bold text-danger hover:bg-danger/15 transition-colors disabled:cursor-not-allowed"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Rejeter
        </button>
      </div>
    </motion.div>
  )
}

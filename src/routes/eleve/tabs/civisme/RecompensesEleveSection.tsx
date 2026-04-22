/**
 * RT-SC · Récompenses — student-facing section.
 *
 * Student browses the reward catalog with affordability-aware UI:
 *   - Affordable rewards (solde >= pointsRequis) have a bright
 *     "Réclamer" CTA
 *   - Unaffordable ones are greyed with "Il vous manque N pts"
 *   - Unavailable ones (admin disabled) don't appear at all
 *
 * On claim: opens confirm modal → creates Reclamation with ticket
 * code → ticket modal pops up with the code to show to admin.
 *
 * A "Mes réclamations" sub-section below shows last 5 with statut:
 *   - En attente (warning color, shows ticket code)
 *   - Honorée (success, with fulfilled-by info)
 *   - Annulée (grey)
 *
 * Student can re-open the ticket modal by tapping a pending row.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Gift,
  Coins,
  Sparkles,
  Lock,
  Hourglass,
  CheckCircle2,
  XCircle,
  Ticket as TicketIcon,
} from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/stores/toast'
import { useRecompenses } from '@/hooks/useRecompenses'
import {
  useMyReclamations,
  useCreateReclamation,
} from '@/hooks/useReclamations'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import {
  TicketCard,
  type TicketCardData,
} from '@/routes/_shared/civisme/TicketCard'
import { cn } from '@/lib/cn'
import type { Recompense, Reclamation, ReclamationStatut } from '@/types/models'

interface Props {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  studentUid: string
  /** Current solde — used for affordability checks */
  currentBalance: number
}

export function RecompensesEleveSection({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  studentUid,
  currentBalance,
}: Props) {
  const { data: recompenses = [], isLoading: loadingCatalog } =
    useRecompenses()
  const { data: myReclamations = [], isLoading: loadingMine } =
    useMyReclamations(eleveId)
  const { data: ecoleConfig } = useEcoleConfig()

  const [requesting, setRequesting] = useState<Recompense | null>(null)
  const [ticketData, setTicketData] = useState<TicketCardData | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const createMut = useCreateReclamation()
  const toast = useToast()

  // Filter out unavailable; sort by affordability (affordable first), then cost asc
  const visibleRewards = useMemo(() => {
    return recompenses
      .filter((r) => r.disponible)
      .sort((a, b) => {
        const aAfford = a.pointsRequis <= currentBalance
        const bAfford = b.pointsRequis <= currentBalance
        if (aAfford && !bAfford) return -1
        if (!aAfford && bAfford) return 1
        return a.pointsRequis - b.pointsRequis
      })
  }, [recompenses, currentBalance])

  // Block double-requesting the SAME reward while the prior is still pending
  const pendingRewardIds = useMemo(
    () =>
      new Set(
        myReclamations
          .filter((r) => r.statut === 'demandee')
          .map((r) => r.recompenseId)
      ),
    [myReclamations]
  )

  async function handleConfirmRequest() {
    if (!requesting) return
    try {
      const result = await createMut.mutateAsync({
        eleveId,
        eleveNom: eleveName,
        classeId,
        classeNom,
        recompenseId: requesting.id,
        recompenseNom: requesting.nom,
        pointsCout: requesting.pointsRequis,
        demandeeParType: 'eleve',
        demandeeParUid: studentUid,
        currentBalance,
      })

      const ticket: TicketCardData = {
        ticketCode: result.ticketCode,
        queteTitre: '',
        eleveNom: eleveName,
        classeNom,
        pointsRecompense: requesting.pointsRequis,
        claimedAt: new Date(),
        claimedByLabel: 'Vous-même',
        schoolName: ecoleConfig?.nom,
        kind: 'redemption',
        redemptionLabel: requesting.nom,
      }
      setRequesting(null)
      setTimeout(() => {
        setTicketData(ticket)
        setTicketOpen(true)
      }, 0)
      toast.success('Demande envoyée. Présentez le ticket à l\'administration.')
    } catch (err) {
      console.error('[RecompensesEleveSection] request failed:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossible de faire cette demande.'
      )
      setRequesting(null)
    }
  }

  function reopenTicketFor(r: Reclamation) {
    const demandeeLe = (r.demandeeLe as { toDate?: () => Date })?.toDate?.()
    setTicketData({
      ticketCode: r.ticketCode,
      queteTitre: '',
      eleveNom: r.eleveNom,
      classeNom: r.classeNom,
      pointsRecompense: r.pointsCout,
      claimedAt: demandeeLe ?? new Date(),
      claimedByLabel: 'Vous-même',
      schoolName: ecoleConfig?.nom,
      kind: 'redemption',
      redemptionLabel: r.recompenseNom,
    })
    setTicketOpen(true)
  }

  return (
    <>
      {/* ─── Catalog ───────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeading
          icon={<Gift className="h-4 w-4" aria-hidden />}
          title="Récompenses disponibles"
          subtitle={`Solde actuel : ${currentBalance} pts`}
        />

        {loadingCatalog ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : visibleRewards.length === 0 ? (
          <EmptyState
            icon={<Gift className="h-8 w-8" />}
            title="Catalogue vide"
            description="L'administration n'a pas encore ajouté de récompenses au catalogue. Revenez bientôt."
          />
        ) : (
          <div className="space-y-2">
            {visibleRewards.map((r) => {
              const canAfford = r.pointsRequis <= currentBalance
              const hasPending = pendingRewardIds.has(r.id)
              return (
                <RewardCard
                  key={r.id}
                  recompense={r}
                  canAfford={canAfford}
                  hasPending={hasPending}
                  currentBalance={currentBalance}
                  onRequest={() => setRequesting(r)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Mes réclamations ─────────────────────── */}
      <div className="space-y-3 mt-6">
        <SectionHeading
          icon={<TicketIcon className="h-4 w-4" aria-hidden />}
          title="Mes demandes"
          subtitle="Vos réclamations récentes"
        />

        {loadingMine ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : myReclamations.length === 0 ? (
          <EmptyState
            icon={<TicketIcon className="h-7 w-7" />}
            title="Aucune demande"
            description="Vos demandes de récompenses apparaîtront ici."
          />
        ) : (
          <div className="space-y-2">
            {myReclamations.slice(0, 5).map((r) => (
              <ReclamationRow
                key={r.id}
                reclamation={r}
                onReopenTicket={() => reopenTicketFor(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Confirm request modal ────────────────── */}
      <Modal
        open={Boolean(requesting)}
        onClose={() => setRequesting(null)}
        size="sm"
      >
        {requesting && (
          <>
            <ModalHeader>
              <ModalTitle>Réclamer cette récompense ?</ModalTitle>
              <ModalDescription>
                Un ticket sera émis. Présentez-le à l'administration pour
                récupérer votre récompense. Les points seront déduits au
                moment de la remise.
              </ModalDescription>
            </ModalHeader>
            <ModalBody>
              <div className="rounded-lg border-[1.5px] border-ink-100 bg-ink-50/40 px-4 py-3 space-y-2">
                <p className="font-display text-[1rem] font-bold text-navy">
                  {requesting.nom}
                </p>
                {requesting.description && (
                  <p className="text-[0.82rem] text-ink-600 leading-snug">
                    {requesting.description}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1 text-[0.78rem]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-navy text-white px-2 py-0.5 font-bold">
                    <Coins className="h-3 w-3" aria-hidden />
                    {requesting.pointsRequis} pts
                  </span>
                  <span className="text-ink-500">
                    Solde après : {currentBalance - requesting.pointsRequis} pts
                  </span>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="ghost"
                onClick={() => setRequesting(null)}
                disabled={createMut.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmRequest}
                loading={createMut.isPending}
                leadingIcon={<Sparkles className="h-4 w-4" aria-hidden />}
              >
                Réclamer
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* ─── Ticket display ───────────────────────── */}
      <TicketCard
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        data={ticketData}
      />
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-6 w-6 mt-0.5 items-center justify-center rounded-md bg-navy/10 text-navy ring-1 ring-navy/15">
        {icon}
      </div>
      <div>
        <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
          {title}
        </p>
        {subtitle && (
          <p className="text-[0.72rem] text-ink-500 mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

function RewardCard({
  recompense: r,
  canAfford,
  hasPending,
  currentBalance,
  onRequest,
}: {
  recompense: Recompense
  canAfford: boolean
  hasPending: boolean
  currentBalance: number
  onRequest: () => void
}) {
  const shortfall = r.pointsRequis - currentBalance
  const disabled = !canAfford || hasPending

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border-[1.5px] px-4 py-3',
        canAfford
          ? 'bg-white border-gold/30'
          : 'bg-ink-50/40 border-ink-100'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1',
            canAfford
              ? 'bg-gold-pale text-gold-dark ring-gold/30'
              : 'bg-ink-100 text-ink-400 ring-ink-200'
          )}
        >
          {canAfford ? (
            <Sparkles className="h-5 w-5" aria-hidden />
          ) : (
            <Lock className="h-5 w-5" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={cn(
                'font-display text-[0.95rem] font-bold leading-tight truncate',
                canAfford ? 'text-navy' : 'text-ink-500'
              )}
            >
              {r.nom}
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full text-[0.68rem] font-bold px-2 py-0.5 shrink-0',
                canAfford
                  ? 'bg-navy text-white'
                  : 'bg-ink-200 text-ink-600'
              )}
            >
              <Coins className="h-3 w-3" aria-hidden />
              {r.pointsRequis} pts
            </span>
          </div>
          {r.description && (
            <p
              className={cn(
                'text-[0.78rem] mt-1 leading-snug',
                canAfford ? 'text-ink-600' : 'text-ink-400'
              )}
            >
              {r.description}
            </p>
          )}
          {!canAfford && (
            <p className="text-[0.7rem] text-ink-500 italic mt-1">
              Il vous manque {shortfall} pt{shortfall > 1 ? 's' : ''}.
            </p>
          )}
          {hasPending && canAfford && (
            <p className="text-[0.7rem] text-warning-dark italic mt-1">
              Une demande en attente existe déjà pour cette récompense.
            </p>
          )}
        </div>
      </div>

      <Button
        variant={disabled ? 'secondary' : 'primary'}
        size="sm"
        onClick={onRequest}
        disabled={disabled}
        className="w-full mt-3"
        leadingIcon={
          hasPending ? (
            <Hourglass className="h-4 w-4" aria-hidden />
          ) : canAfford ? (
            <Sparkles className="h-4 w-4" aria-hidden />
          ) : (
            <Lock className="h-4 w-4" aria-hidden />
          )
        }
      >
        {hasPending
          ? 'Demande en attente'
          : canAfford
            ? 'Réclamer'
            : 'Verrouillée'}
      </Button>
    </motion.div>
  )
}

function ReclamationRow({
  reclamation: r,
  onReopenTicket,
}: {
  reclamation: Reclamation
  onReopenTicket: () => void
}) {
  const demandeeLe = (r.demandeeLe as { toDate?: () => Date })?.toDate?.()
  const isPending = r.statut === 'demandee'

  return (
    <button
      type="button"
      onClick={isPending ? onReopenTicket : undefined}
      className={cn(
        'w-full text-left bg-white rounded-lg border-[1.5px] border-ink-100 px-4 py-3',
        isPending
          ? 'hover:border-navy/30 transition-colors'
          : 'cursor-default'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.92rem] font-bold text-navy leading-tight truncate">
            {r.recompenseNom}
          </p>
          <p className="text-[0.7rem] text-ink-500 mt-0.5 leading-snug">
            <span className="font-mono font-semibold">{r.ticketCode}</span>
            {demandeeLe && (
              <>
                {' · '}
                {demandeeLe.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </>
            )}
          </p>
        </div>
        <StatusPill statut={r.statut} pointsCout={r.pointsCout} />
      </div>
    </button>
  )
}

function StatusPill({
  statut,
  pointsCout,
}: {
  statut: ReclamationStatut
  pointsCout: number
}) {
  if (statut === 'demandee') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg text-warning-dark px-2 py-0.5 text-[0.68rem] font-bold ring-1 ring-warning/30 shrink-0">
        <Hourglass className="h-3 w-3" aria-hidden />
        En attente
      </span>
    )
  }
  if (statut === 'fulfillee') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success text-white px-2 py-0.5 text-[0.68rem] font-bold shrink-0">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        -{pointsCout} pts
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 text-ink-600 px-2 py-0.5 text-[0.68rem] font-bold shrink-0">
      <XCircle className="h-3 w-3" aria-hidden />
      Annulée
    </span>
  )
}

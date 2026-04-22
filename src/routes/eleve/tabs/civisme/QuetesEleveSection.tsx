/**
 * RT-SC · Quêtes — student-facing section.
 *
 * Two halves:
 *   1. "Quêtes ouvertes" — quests the student can claim, filtered to
 *      their class (or unrestricted). Tap a card → Confirmer modal →
 *      claim is created → ticket modal pops up.
 *   2. "Mes réclamations" — last 5 claims by this student with their
 *      current statut. Tap any to re-display the ticket.
 *
 * Multi-slot quests show "X / Y créneaux" so students see scarcity.
 *
 * Cooperation with phoneless students:
 *   This section assumes the student is in-app. Phoneless students go
 *   through the prof flow (separate tab in ProfDashboard). Both flows
 *   use the same useClaimQuete mutation under the hood.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ListChecks,
  Coins,
  Users,
  CheckCircle2,
  XCircle,
  Hourglass,
  Ticket as TicketIcon,
  Calendar,
  Sparkles,
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
import {
  useOpenQuetesForEleve,
  useMyClaims,
  useClaimQuete,
} from '@/hooks/useQuetes'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { TicketCard, type TicketCardData } from '@/routes/_shared/civisme/TicketCard'
import { cn } from '@/lib/cn'
import type { Quete, QueteClaim, ClaimStatut } from '@/types/models'

interface Props {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  /** Firebase anon UID for the student session — captured at claim time */
  studentUid: string
}

export function QuetesEleveSection({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  studentUid,
}: Props) {
  const { data: ouvertes = [], isLoading: loadingOuvertes } =
    useOpenQuetesForEleve(classeId)
  const { data: myClaims = [], isLoading: loadingMine } = useMyClaims(eleveId)
  const { data: ecoleConfig } = useEcoleConfig()

  const [confirmingQuete, setConfirmingQuete] = useState<Quete | null>(null)
  const [ticketData, setTicketData] = useState<TicketCardData | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const claimMut = useClaimQuete()
  const toast = useToast()

  // Block re-engaging on the SAME quest while a claim is still
  // pending validation. Once the prior claim is validated (done) or
  // rejected, and if slots are still open, the student can re-engage.
  const pendingQuestIds = new Set(
    myClaims.filter((c) => c.statut === 'pending').map((c) => c.queteId)
  )

  async function handleConfirmClaim() {
    if (!confirmingQuete) return
    try {
      const result = await claimMut.mutateAsync({
        queteId: confirmingQuete.id,
        queteTitre: confirmingQuete.titre,
        pointsRecompense: confirmingQuete.pointsRecompense,
        eleveId,
        eleveNom: eleveName,
        classeId,
        classeNom,
        claimedBy: 'eleve',
        claimedByUid: studentUid,
      })

      const ticket: TicketCardData = {
        ticketCode: result.ticketCode,
        queteTitre: confirmingQuete.titre,
        eleveNom: eleveName,
        classeNom,
        pointsRecompense: confirmingQuete.pointsRecompense,
        claimedAt: new Date(),
        claimedByLabel: 'Vous-même',
        schoolName: ecoleConfig?.nom,
      }
      setConfirmingQuete(null)
      // Defer ticket modal to next tick to let confirm modal exit
      // cleanly. Same race fix as the prof flow — two AnimatePresence
      // modals can't enter/exit in the same tick without crashing.
      setTimeout(() => {
        setTicketData(ticket)
        setTicketOpen(true)
      }, 0)
      toast.success('Quête réclamée. Bonne chance !')
    } catch (err) {
      console.error('[QuetesEleveSection] claim failed:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossible de prendre cette quête.'
      )
      setConfirmingQuete(null)
    }
  }

  function reopenTicketFor(claim: QueteClaim) {
    setTicketData({
      ticketCode: claim.ticketCode,
      queteTitre: claim.queteTitre,
      eleveNom: claim.eleveNom,
      classeNom: claim.classeNom,
      pointsRecompense: claim.pointsRecompense,
      claimedAt:
        claim.claimedAt instanceof Date
          ? claim.claimedAt
          : (claim.claimedAt as { toDate?: () => Date }).toDate?.() ?? new Date(),
      claimedByLabel:
        claim.claimedBy === 'eleve'
          ? 'Vous-même'
          : claim.claimedByNom ?? (claim.claimedBy === 'prof' ? 'Un enseignant' : "L'administration"),
      schoolName: ecoleConfig?.nom,
    })
    setTicketOpen(true)
  }

  return (
    <>
      {/* ─── Quêtes ouvertes ──────────────────────────── */}
      <div className="space-y-3">
        <SectionHeading
          icon={<ListChecks className="h-4 w-4" aria-hidden />}
          title="Quêtes ouvertes"
          subtitle="Missions à prendre pour gagner des points"
        />

        {loadingOuvertes ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : ouvertes.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            title="Aucune quête disponible"
            description="Aucune mission n'est ouverte pour votre classe pour le moment. Repassez bientôt — l'administration en publie régulièrement."
          />
        ) : (
          <div className="space-y-2">
            {ouvertes.map((q) => {
              const hasPendingClaim = pendingQuestIds.has(q.id)
              return (
                <QueteCard
                  key={q.id}
                  quete={q}
                  hasPendingClaim={hasPendingClaim}
                  onClaim={() => setConfirmingQuete(q)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Mes quêtes ──────────────────────────────── */}
      <div className="space-y-3 mt-6">
        <SectionHeading
          icon={<TicketIcon className="h-4 w-4" aria-hidden />}
          title="Mes quêtes"
          subtitle="Vos prises de quête récentes"
        />

        {loadingMine ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : myClaims.length === 0 ? (
          <EmptyState
            icon={<TicketIcon className="h-7 w-7" />}
            title="Aucune réclamation"
            description="Quand vous prendrez une quête, elle apparaîtra ici."
          />
        ) : (
          <div className="space-y-2">
            {myClaims.slice(0, 5).map((c) => (
              <ClaimRow key={c.id} claim={c} onReopenTicket={() => reopenTicketFor(c)} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Confirm claim modal ───────────────────────── */}
      <Modal
        open={Boolean(confirmingQuete)}
        onClose={() => setConfirmingQuete(null)}
        size="sm"
      >
        {confirmingQuete && (
          <>
            <ModalHeader>
              <ModalTitle>Prendre cette quête ?</ModalTitle>
              <ModalDescription>
                Vous vous engagez à accomplir cette mission. Vous recevrez
                un ticket à présenter à l'administration après accomplissement.
              </ModalDescription>
            </ModalHeader>
            <ModalBody>
              <div className="rounded-lg border-[1.5px] border-ink-100 bg-ink-50/40 px-4 py-3 space-y-2">
                <p className="font-display text-[1rem] font-bold text-navy leading-tight">
                  {confirmingQuete.titre}
                </p>
                {confirmingQuete.description && (
                  <p className="text-[0.82rem] text-ink-600 leading-snug">
                    {confirmingQuete.description}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 rounded-md bg-success text-white px-2 py-1 text-[0.78rem] font-bold">
                    <Coins className="h-3 w-3" aria-hidden />+
                    {confirmingQuete.pointsRecompense} pts
                  </span>
                  <span className="inline-flex items-center gap-1 text-[0.72rem] text-ink-500">
                    <Users className="h-3 w-3" aria-hidden />
                    {confirmingQuete.slotsTotal - confirmingQuete.slotsTaken} créneau
                    {confirmingQuete.slotsTotal - confirmingQuete.slotsTaken > 1 ? 'x' : ''} restant
                    {confirmingQuete.slotsTotal - confirmingQuete.slotsTaken > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmingQuete(null)}
                disabled={claimMut.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmClaim}
                loading={claimMut.isPending}
                leadingIcon={<Sparkles className="h-4 w-4" aria-hidden />}
              >
                Je m'engage
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* ─── Ticket display ────────────────────────────── */}
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

function QueteCard({
  quete,
  hasPendingClaim,
  onClaim,
}: {
  quete: Quete
  hasPendingClaim: boolean
  onClaim: () => void
}) {
  const slotsRemaining = quete.slotsTotal - quete.slotsTaken
  const isLastSlot = slotsRemaining === 1 && quete.slotsTotal > 1
  const echeance = quete.echeance
    ? (quete.echeance as { toDate?: () => Date }).toDate?.()
    : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-lg border-[1.5px] border-ink-100 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.98rem] font-bold text-navy leading-tight">
            {quete.titre}
          </p>
          {quete.description && (
            <p className="text-[0.78rem] text-ink-600 mt-1 leading-snug line-clamp-2">
              {quete.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-success text-white px-2 py-0.5 text-[0.72rem] font-bold">
              <Coins className="h-3 w-3" aria-hidden />+
              {quete.pointsRecompense} pts
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[0.7rem] font-semibold rounded-full px-2 py-0.5',
                isLastSlot
                  ? 'bg-warning-bg text-warning-dark ring-1 ring-warning/30'
                  : 'bg-ink-50 text-ink-600'
              )}
            >
              <Users className="h-3 w-3" aria-hidden />
              {slotsRemaining}/{quete.slotsTotal}
            </span>
            {echeance && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-500">
                <Calendar className="h-3 w-3" aria-hidden />
                {formatRelativeDate(echeance)}
              </span>
            )}
          </div>
        </div>
      </div>

      <Button
        variant={hasPendingClaim ? 'secondary' : 'primary'}
        size="sm"
        onClick={onClaim}
        disabled={hasPendingClaim}
        className="w-full mt-3"
        leadingIcon={
          hasPendingClaim ? (
            <Hourglass className="h-4 w-4" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )
        }
      >
        {hasPendingClaim
          ? 'En attente de validation'
          : "Je m'engage"}
      </Button>
    </motion.div>
  )
}

function ClaimRow({
  claim,
  onReopenTicket,
}: {
  claim: QueteClaim
  onReopenTicket: () => void
}) {
  const claimedAt =
    claim.claimedAt instanceof Date
      ? claim.claimedAt
      : (claim.claimedAt as { toDate?: () => Date }).toDate?.()

  return (
    <button
      type="button"
      onClick={onReopenTicket}
      className="w-full text-left bg-white rounded-lg border-[1.5px] border-ink-100 px-4 py-3 hover:border-navy/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.92rem] font-bold text-navy leading-tight truncate">
            {claim.queteTitre}
          </p>
          <p className="text-[0.7rem] text-ink-500 mt-0.5 leading-snug">
            <span className="font-mono font-semibold">{claim.ticketCode}</span>
            {claimedAt && (
              <>
                {' · '}
                {claimedAt.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </>
            )}
          </p>
        </div>
        <ClaimStatutPill statut={claim.statut} points={claim.pointsRecompense} />
      </div>
    </button>
  )
}

function ClaimStatutPill({
  statut,
  points,
}: {
  statut: ClaimStatut
  points: number
}) {
  if (statut === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg text-warning-dark px-2 py-0.5 text-[0.68rem] font-bold ring-1 ring-warning/30 shrink-0">
        <Hourglass className="h-3 w-3" aria-hidden />
        En attente
      </span>
    )
  }
  if (statut === 'validated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success text-white px-2 py-0.5 text-[0.68rem] font-bold shrink-0">
        <CheckCircle2 className="h-3 w-3" aria-hidden />+{points} pts
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 text-ink-600 px-2 py-0.5 text-[0.68rem] font-bold shrink-0">
      <XCircle className="h-3 w-3" aria-hidden />
      Refusée
    </span>
  )
}

function formatRelativeDate(d: Date): string {
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return 'Échue'
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  if (days < 7) return `Dans ${days}j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

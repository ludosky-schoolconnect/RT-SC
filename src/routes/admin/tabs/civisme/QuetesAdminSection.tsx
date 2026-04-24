/**
 * RT-SC · Civisme — Quêtes admin sub-section.
 *
 * Layout:
 *   1. "Demandes en attente" callout at top (count of all
 *      pending claims across all quests, surfaces what needs admin
 *      action right now)
 *   2. "+ Publier une quête" button
 *   3. Status filter pills (Toutes / Ouvertes / Complètes / Annulées)
 *   4. List of quests (most recent first), each tappable to expand
 *      its claims for validation
 *
 * The expanded claims sub-list shows each pending claim with
 * "Valider (+X pts)" and "Rejeter" buttons. Validated/rejected
 * claims show greyed out for context.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  ListChecks,
  Coins,
  Users,
  Edit3,
  Trash2,
  X,
  Check,
  CheckCheck,
  ChevronDown,
  AlertCircle,
  Calendar,
  School as SchoolIcon,
  Clock,
  Archive,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import {
  useAllQuetes,
  useQueteClaims,
  useDeleteQuete,
  useValidateClaim,
  useRejectClaim,
  useValidateAllPendingClaims,
  usePendingClaimsCount,
} from '@/hooks/useQuetes'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { QueteFormModal } from './QueteFormModal'
import { cn } from '@/lib/cn'
import type { Quete, QueteClaim, QueteStatut } from '@/types/models'

const STATUT_SORT_ORDER: Record<QueteStatut, number> = {
  ouverte: 0,
  complete: 1,  // "Pleine" — still needs admin validation
  cloturee: 2,
  annulee: 3,
}

export function QuetesAdminSection() {
  const profil = useAuthStore((s) => s.profil)
  const { data: quetes = [], isLoading } = useAllQuetes()
  const { data: pendingCount = 0 } = usePendingClaimsCount()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Quete | undefined>(undefined)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [archivesOpen, setArchivesOpen] = useState(false)

  // Two partitions: actives (ouverte + pleine) and archivées (cloturee).
  // Annulée is no longer a possibility — admin deletes quests outright.
  // Within each group, sort: ouverte before pleine before cloturee, and
  // within a single statut, most recent first.
  const { actives, archivees } = useMemo(() => {
    const actives: Quete[] = []
    const archivees: Quete[] = []
    for (const q of quetes) {
      if (q.statut === 'cloturee' || q.statut === 'annulee') {
        archivees.push(q)
      } else {
        actives.push(q)
      }
    }
    const bySort = (a: Quete, b: Quete) => {
      const statutDiff =
        STATUT_SORT_ORDER[a.statut] - STATUT_SORT_ORDER[b.statut]
      if (statutDiff !== 0) return statutDiff
      const aTime =
        (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0
      const bTime =
        (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0
      return bTime - aTime
    }
    actives.sort(bySort)
    archivees.sort(bySort)
    return { actives, archivees }
  }, [quetes])

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(q: Quete) {
    setEditing(q)
    setFormOpen(true)
  }

  return (
    <Section>
      <SectionHeader
        title="Quêtes"
        description="Publiez des missions concrètes et validez le travail accompli."
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={openAdd}
            disabled={!profil}
          >
            Publier
          </Button>
        }
      />

      {/* Pending callout — only when quêtes exist; orphaned claims from
          deleted quêtes are handled by the À valider tab instead */}
      {pendingCount > 0 && quetes.length > 0 && (
        <div className="mb-4 rounded-lg bg-warning-bg/70 border-[1.5px] border-warning/30 px-3.5 py-3 flex items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/20">
            <Clock className="h-4 w-4 text-warning-dark" aria-hidden />
          </div>
          <div className="flex-1 min-w-0 text-[0.82rem]">
            <p className="font-bold text-warning-dark leading-tight">
              {pendingCount === 1
                ? '1 demande de quête en attente de validation'
                : `${pendingCount} demandes de quête en attente de validation`}
            </p>
            <p className="text-ink-600 mt-0.5 leading-snug">
              Ouvrez les quêtes ci-dessous pour valider ou rejeter chaque participation.
            </p>
          </div>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : actives.length === 0 && archivees.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="Aucune quête"
          description="Publiez votre première quête pour engager les élèves dans la vie de l'école."
        />
      ) : (
        <>
          {/* ─── Actives ─────────────────────────────────── */}
          <SubsectionHeader
            label="Actives"
            count={actives.length}
            helper={
              actives.length === 0
                ? 'Aucune quête active.'
                : 'Quêtes en cours — ouvertes ou en attente de validation.'
            }
          />
          {actives.length === 0 ? (
            <div className="mb-5 rounded-md border border-ink-100 bg-ink-50/40 px-4 py-3 text-[0.78rem] text-ink-500 italic">
              Aucune quête active. Cliquez sur « Publier » ci-dessus pour en créer une.
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {actives.map((q) => (
                <QueteCard
                  key={q.id}
                  quete={q}
                  expanded={expandedId === q.id}
                  onToggleExpand={() =>
                    setExpandedId((prev) => (prev === q.id ? null : q.id))
                  }
                  onEdit={() => openEdit(q)}
                />
              ))}
            </div>
          )}

          {/* ─── Archivées (collapsible) ─────────────────── */}
          {archivees.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setArchivesOpen((p) => !p)}
                className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2.5 bg-ink-50/40 hover:bg-ink-100/60 transition-colors border-[1.5px] border-ink-100"
              >
                <span className="inline-flex items-center gap-2">
                  <Archive className="h-3.5 w-3.5 text-ink-600" aria-hidden />
                  <span className="font-display text-[0.85rem] font-bold text-ink-700">
                    Archivées
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-ink-100 text-ink-600 text-[0.62rem] font-black px-1.5 min-w-[18px] h-[18px]">
                    {archivees.length}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-ink-500 transition-transform',
                    archivesOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
              </button>

              {archivesOpen && (
                <div className="space-y-2 mt-2">
                  {archivees.map((q) => (
                    <QueteCard
                      key={q.id}
                      quete={q}
                      expanded={expandedId === q.id}
                      onToggleExpand={() =>
                        setExpandedId((prev) => (prev === q.id ? null : q.id))
                      }
                      onEdit={() => openEdit(q)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {profil && (
        <QueteFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          existing={editing}
          currentUserUid={profil.id}
        />
      )}
    </Section>
  )
}

// ─── Subsection label for Actives / Archivées ───────────────

function SubsectionHeader({
  label,
  count,
  helper,
}: {
  label: string
  count: number
  helper: string
}) {
  return (
    <div className="mb-2.5 mt-1">
      <div className="flex items-center gap-2">
        <p className="text-[0.7rem] uppercase tracking-[0.15em] font-bold text-ink-500">
          {label}
        </p>
        <span className="inline-flex items-center justify-center rounded-full bg-ink-100 text-ink-600 text-[0.62rem] font-black px-1.5 min-w-[18px] h-[18px]">
          {count}
        </span>
      </div>
      <p className="text-[0.72rem] text-ink-500 mt-0.5 leading-snug">
        {helper}
      </p>
    </div>
  )
}

// ─── Quete card ─────────────────────────────────────────────

function QueteCard({
  quete: q,
  expanded,
  onToggleExpand,
  onEdit,
}: {
  quete: Quete
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
}) {
  const deleteMut = useDeleteQuete()
  const validateAllMut = useValidateAllPendingClaims()
  const toast = useToast()
  const confirm = useConfirm()
  const profil = useAuthStore((s) => s.profil)

  const slotsRemaining = q.slotsTotal - q.slotsTaken
  const pendingCount = q.slotsTaken - q.slotsValidated

  async function handleValidateAll() {
    if (!profil) return
    const ok = await confirm({
      title: `Valider toutes les participations ?`,
      message: `${pendingCount} participation${pendingCount > 1 ? 's' : ''} en attente seront validées et les points attribués immédiatement. Cette action est irréversible.`,
      confirmLabel: `Valider les ${pendingCount}`,
      variant: 'info',
    })
    if (!ok) return
    try {
      const result = await validateAllMut.mutateAsync({
        queteId: q.id,
        validatedByUid: profil.id,
        validatedByNom: profil.nom,
      })
      toast.success(`${result.count} participation${result.count > 1 ? 's' : ''} validée${result.count > 1 ? 's' : ''} — points attribués.`)
    } catch (err) {
      console.error('[QueteCard] validate-all failed:', err)
      toast.error(err instanceof Error ? err.message : 'Validation impossible.')
    }
  }

  async function handleDelete() {
    // Build context-aware confirm message based on what's at stake.
    let message: string
    if (q.slotsTaken === 0) {
      message = 'Aucun élève n\'a encore participé. Cette suppression est définitive.'
    } else if (q.slotsValidated === 0) {
      message = `${q.slotsTaken} élève(s) attendent une validation. Leur participation sera annulée et ils ne recevront pas de points. Cette action est définitive.`
    } else if (q.slotsValidated < q.slotsTaken) {
      const pending = q.slotsTaken - q.slotsValidated
      message = `${q.slotsValidated} validation(s) déjà effectuée(s) — les élèves conservent leurs points. ${pending} participation(s) en attente seront perdues. L'historique des points est préservé. Cette action est définitive.`
    } else {
      message = `${q.slotsValidated} élève(s) ont été validés et conservent leurs points. L'historique de chaque élève est préservé. Cette action est définitive.`
    }

    const ok = await confirm({
      title: `Supprimer "${q.titre}" ?`,
      message,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(q.id)
      toast.success('Quête supprimée.')
    } catch (err) {
      console.error('[QuetesAdminSection] delete failed:', err)
      const msg = err instanceof Error ? err.message : 'Suppression impossible.'
      toast.error(msg)
    }
  }

  return (
    <motion.div
      layout
      className={cn(
        'bg-white rounded-lg border-[1.5px] overflow-hidden',
        q.statut === 'annulee' && 'opacity-70',
        q.statut === 'ouverte' ? 'border-ink-100' : 'border-ink-100'
      )}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-ink-50/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-display text-[0.98rem] font-bold text-navy leading-tight">
              {q.titre}
            </p>
            <StatutPill statut={q.statut} />
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning text-white text-[0.62rem] font-bold uppercase tracking-wider px-1.5 py-0.5">
                <Clock className="h-2.5 w-2.5" aria-hidden />
                {pendingCount} en attente
              </span>
            )}
          </div>
          {q.description && (
            <p className="text-[0.78rem] text-ink-600 mt-1 leading-snug">
              {q.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[0.72rem] text-ink-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3" aria-hidden />
              <strong className="text-success-dark">+{q.pointsRecompense} pts</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden />
              {q.slotsTaken} / {q.slotsTotal} créneaux
              {slotsRemaining > 0 && q.statut === 'ouverte' && (
                <span className="text-success-dark">
                  ({slotsRemaining} libre{slotsRemaining > 1 ? 's' : ''})
                </span>
              )}
            </span>
            {q.classeNomFilter && (
              <span className="inline-flex items-center gap-1">
                <SchoolIcon className="h-3 w-3" aria-hidden />
                {q.classeNomFilter}
              </span>
            )}
            {q.echeance && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden />
                {q.echeance.toDate().toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-ink-400 shrink-0 mt-1 transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {/* Expanded — claims list + admin actions */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-ink-100 bg-ink-50/30"
          >
            <div className="px-4 py-3 space-y-3">
              <ClaimsList queteId={q.id} />

              {/* Admin actions row */}
              {q.statut !== 'annulee' && (
                <div className="flex items-center gap-2 pt-2 border-t border-ink-100/60 flex-wrap">
                  {pendingCount > 0 && (
                    <button
                      type="button"
                      onClick={handleValidateAll}
                      disabled={validateAllMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success-bg px-2.5 py-1.5 text-[0.75rem] font-bold text-success-dark hover:bg-success/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCheck className="h-3 w-3" aria-hidden />
                      Valider les {pendingCount}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[0.75rem] font-bold text-ink-700 hover:border-navy/30 hover:text-navy transition-colors"
                  >
                    <Edit3 className="h-3 w-3" aria-hidden />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-bg/40 px-2.5 py-1.5 text-[0.75rem] font-bold text-danger hover:bg-danger/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Statut pill ────────────────────────────────────────────

function StatutPill({ statut }: { statut: QueteStatut }) {
  const styles: Record<QueteStatut, string> = {
    ouverte: 'bg-success-bg text-success-dark ring-1 ring-success/30',
    complete: 'bg-info-bg text-navy ring-1 ring-navy/20',
    cloturee: 'bg-ink-100 text-ink-600',
    annulee: 'bg-danger-bg text-danger ring-1 ring-danger/30',
  }
  const label: Record<QueteStatut, string> = {
    ouverte: 'Ouverte',
    complete: 'Pleine',
    cloturee: 'Clôturée',
    annulee: 'Annulée',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider shrink-0',
        styles[statut]
      )}
    >
      {label[statut]}
    </span>
  )
}

// ─── Claims list (expanded under each quete) ───────────────

function ClaimsList({ queteId }: { queteId: string }) {
  const { data: claims = [], isLoading } = useQueteClaims(queteId)

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    )
  }

  if (claims.length === 0) {
    return (
      <p className="text-[0.78rem] text-ink-500 italic">
        Aucune participation pour cette quête. Les élèves la verront dans leur Civisme.
      </p>
    )
  }

  // Sort: pending first (oldest first within), then validated, then rejected
  const sorted = [...claims].sort((a, b) => {
    const order = { pending: 0, validated: 1, rejected: 2 }
    return order[a.statut] - order[b.statut]
  })

  return (
    <div className="space-y-1.5">
      {sorted.map((claim) => (
        <ClaimRow key={claim.id} claim={claim} queteId={queteId} />
      ))}
    </div>
  )
}

function ClaimRow({
  claim,
  queteId,
}: {
  claim: QueteClaim
  queteId: string
}) {
  const validateMut = useValidateClaim()
  const rejectMut = useRejectClaim()
  const toast = useToast()
  const confirm = useConfirm()
  const profil = useAuthStore((s) => s.profil)

  async function handleValidate() {
    if (!profil) return
    try {
      const result = await validateMut.mutateAsync({
        queteId,
        claimId: claim.id,
        validatedByUid: profil.id,
        validatedByNom: profil.nom,
      })
      toast.success(
        `+${claim.pointsRecompense} pts attribués à ${claim.eleveNom} (solde: ${result.newBalance})`
      )
    } catch (err) {
      console.error('[ClaimRow] validate failed:', err)
      const msg = err instanceof Error ? err.message : 'Validation impossible.'
      toast.error(msg)
    }
  }

  async function handleReject() {
    if (!profil) return
    const ok = await confirm({
      title: `Rejeter la participation de ${claim.eleveNom} ?`,
      message:
        "Le créneau sera libéré et l'élève ne recevra pas de points pour cette quête.",
      confirmLabel: 'Rejeter',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await rejectMut.mutateAsync({
        queteId,
        claimId: claim.id,
      })
      toast.success('Participation rejetée.')
    } catch (err) {
      console.error('[ClaimRow] reject failed:', err)
      const msg = err instanceof Error ? err.message : 'Rejet impossible.'
      toast.error(msg)
    }
  }

  const isPending = claim.statut === 'pending'
  const submitting = validateMut.isPending || rejectMut.isPending

  return (
    <div
      className={cn(
        'rounded-md border bg-white px-3 py-2 flex items-center gap-3',
        isPending ? 'border-warning/30' : 'border-ink-100',
        claim.statut === 'validated' && 'bg-success-bg/30',
        claim.statut === 'rejected' && 'opacity-60'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-display text-[0.85rem] font-bold text-navy leading-tight">
            {claim.eleveNom}
          </p>
          <span className="text-[0.7rem] text-ink-500">·</span>
          <p className="text-[0.72rem] text-ink-500">{claim.classeNom}</p>
          {claim.claimedBy !== 'eleve' && claim.claimedByNom && (
            <span className="text-[0.6rem] font-semibold text-ink-400 italic">
              (par {claim.claimedByNom})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[0.68rem] text-ink-400">
          <span className="font-mono font-bold">{claim.ticketCode}</span>
          <span>·</span>
          <span>
            {claim.claimedAt && 'toDate' in claim.claimedAt
              ? claim.claimedAt.toDate().toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '...'}
          </span>
          {claim.statut === 'validated' && (
            <>
              <span>·</span>
              <span className="text-success-dark font-bold">Validée</span>
            </>
          )}
          {claim.statut === 'rejected' && (
            <>
              <span>·</span>
              <span className="text-danger font-bold">Rejetée</span>
            </>
          )}
        </div>
        {claim.rejectionReason && (
          <p className="text-[0.68rem] text-danger-dark italic mt-1">
            « {claim.rejectionReason} »
          </p>
        )}
      </div>

      {isPending && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleReject}
            disabled={submitting}
            aria-label={`Rejeter ${claim.eleveNom}`}
            title="Rejeter la participation"
            className="flex items-center justify-center w-9 h-9 rounded-md border border-danger/30 bg-danger-bg text-danger hover:bg-danger/15 disabled:opacity-40 transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleValidate}
            disabled={submitting}
            aria-label={`Valider ${claim.eleveNom}`}
            title={`Attribuer +${claim.pointsRecompense} pts`}
            className="flex items-center justify-center w-9 h-9 rounded-md border border-success/30 bg-success-bg text-success-dark hover:bg-success/15 disabled:opacity-40 transition-colors"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

// Suppress unused-import warnings for icons that may be used by
// inlined logic later (keep tree-shake friendly)
void AlertCircle

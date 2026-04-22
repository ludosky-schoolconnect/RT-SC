/**
 * RT-SC · Danger zone card (Année).
 *
 * Single entry point for the annual rollover. The OLD UX had two
 * separate rows (Transition + Archiver) that admin clicked in
 * sequence — that's been consolidated into ONE button: "Clôturer
 * l'année". Clicking it always opens the Transition modal, which
 * auto-chains into the Archive modal once all classes have been
 * processed (delay + handoff logic lives in ModalTransitionEleves).
 *
 * State-driven UI:
 *   - Idle (fresh):      "Clôturer l'année" button, neutral description
 *   - In progress:       "Reprendre la clôture" button, live progress
 *   - Archive pending:   "Finaliser et archiver" button, amber emphasis
 *   - Just archived:     green success card (no button for 7 days)
 *
 * Admin can't accidentally archive twice:
 *   - UI primary: success card hides the button for 7 days post-archive
 *   - Backend failsafe: executeFinalArchive refuses if archive metadata
 *     already exists for the year (in rollover.ts)
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ModalTransitionEleves } from './ModalTransitionEleves'
import { ModalArchiveAnnee } from './ModalArchiveAnnee'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useClasses } from '@/hooks/useClasses'
import { cn } from '@/lib/cn'

/**
 * Recency window during which we show the "just archived" success card.
 * After this many days, the DangerZone reverts to its normal state so
 * admin can kick off the NEXT year's rollover when its time comes.
 */
const ARCHIVED_SUCCESS_DAYS = 7

function toMillis(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'object' && value !== null) {
    const v = value as {
      toMillis?: () => number
      toDate?: () => Date
      seconds?: number
    }
    if (typeof v.toMillis === 'function') return v.toMillis()
    if (typeof v.toDate === 'function') return v.toDate().getTime()
    if (typeof v.seconds === 'number') return v.seconds * 1000
  }
  if (value instanceof Date) return value.getTime()
  return null
}

type Phase = 'idle' | 'in-progress' | 'archive-pending' | 'archived'

export function DangerZoneCard() {
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const { data: config } = useEcoleConfig()
  const { data: classes = [] } = useClasses()

  const transitionInProgress = Boolean(config?.transitionInProgress)
  const transitionedSet = new Set(config?.classesTransitioned ?? [])
  const classesTransitionedCount = classes.filter((c) =>
    transitionedSet.has(c.id)
  ).length
  const totalClasses = classes.length
  const allClassesDone =
    totalClasses > 0 && classesTransitionedCount === totalClasses

  // Archived-success recency check
  const lastArchivedMs = toMillis(config?.lastArchivedAt)
  const now = Date.now()
  const graceMs = ARCHIVED_SUCCESS_DAYS * 24 * 60 * 60 * 1000
  const withinGrace =
    lastArchivedMs !== null && now - lastArchivedMs < graceMs
  // Only show success state when no new rollover has started since
  const showArchivedSuccess = withinGrace && !transitionInProgress

  // Phase derivation — drives the single CTA's label and visuals
  const phase: Phase = showArchivedSuccess
    ? 'archived'
    : transitionInProgress && allClassesDone
      ? 'archive-pending'
      : transitionInProgress
        ? 'in-progress'
        : 'idle'

  function handleRequestArchiveFromTransition() {
    // Close the transition modal first, then open the archive modal on
    // the next tick. Without the delay, both modals' mount/unmount
    // cycles can overlap and cause flicker.
    setTransitionOpen(false)
    setTimeout(() => setArchiveOpen(true), 60)
  }

  function handlePrimaryClick() {
    // If all classes are already transitioned, jump straight to archive
    // (skip the transition modal entirely — they've done that work).
    // Otherwise start from transition.
    if (phase === 'archive-pending') {
      setArchiveOpen(true)
    } else {
      setTransitionOpen(true)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
    >
      <Card className="border-danger/25 bg-danger-bg/30" accent={false}>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-5 w-5" aria-hidden />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Clôture de fin d'année scolaire — action irréversible.
            </CardDescription>
          </div>
        </CardHeader>

        {phase === 'archived' ? (
          <ArchivedSuccessCard
            archivedAnnee={config?.lastArchivedAnnee ?? ''}
            activeAnnee={config?.anneeActive ?? ''}
          />
        ) : (
          <ActionPanel
            phase={phase}
            classesTransitionedCount={classesTransitionedCount}
            totalClasses={totalClasses}
            onStart={handlePrimaryClick}
          />
        )}
      </Card>

      <ModalTransitionEleves
        open={transitionOpen}
        onClose={() => setTransitionOpen(false)}
        onRequestArchive={handleRequestArchiveFromTransition}
      />
      <ModalArchiveAnnee
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
    </motion.div>
  )
}

// ─── Archived success card ──────────────────────────────────

function ArchivedSuccessCard({
  archivedAnnee,
  activeAnnee,
}: {
  archivedAnnee: string
  activeAnnee: string
}) {
  return (
    <div className="rounded-md border-[1.5px] bg-success-bg border-success/30 p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/20 text-success-dark">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-[0.95rem] font-bold text-success-dark leading-tight">
          Année {archivedAnnee} archivée avec succès
        </p>
        <p className="text-[0.8rem] text-ink-700 mt-1 leading-snug">
          La nouvelle année <strong>{activeAnnee}</strong> est active.
          Les données de l'année précédente sont consultables dans <em>Archives</em> ci-dessous.
        </p>
        <p className="text-[0.72rem] text-ink-500 mt-2 italic">
          La clôture redeviendra disponible à la fin de l'année en cours.
        </p>
      </div>
    </div>
  )
}

// ─── Action panel — single button with phase-driven state ───

function ActionPanel({
  phase,
  classesTransitionedCount,
  totalClasses,
  onStart,
}: {
  phase: Phase
  classesTransitionedCount: number
  totalClasses: number
  onStart: () => void
}) {
  const isInProgress = phase === 'in-progress'
  const isArchivePending = phase === 'archive-pending'
  const isLive = isInProgress || isArchivePending

  // Progression banner (only when a rollover is active)
  const banner = !isLive ? null : (
    <div
      className={cn(
        'mb-3 rounded-md border-[1.5px] px-3.5 py-3 flex items-start gap-2.5',
        isArchivePending
          ? 'bg-warning-bg border-warning/40'
          : 'bg-info-bg border-navy/20'
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          isArchivePending
            ? 'bg-warning/20 text-warning-dark'
            : 'bg-navy/10 text-navy'
        )}
      >
        {isArchivePending ? (
          <AlertTriangle className="h-4 w-4" aria-hidden />
        ) : (
          <CalendarCheck className="h-4 w-4" aria-hidden />
        )}
      </div>
      <div className="flex-1 min-w-0 text-[0.82rem]">
        <p
          className={cn(
            'font-bold leading-tight',
            isArchivePending ? 'text-warning-dark' : 'text-navy'
          )}
        >
          {isArchivePending
            ? 'Archivage requis pour finaliser'
            : `Transition en cours · ${classesTransitionedCount}/${totalClasses} classes`}
        </p>
        <p className="text-ink-700 mt-0.5 leading-snug">
          {isArchivePending
            ? "Toutes les classes ont été traitées. Lancez l'archivage pour finaliser et démarrer la nouvelle année."
            : "Votre progression est sauvegardée. Reprenez quand vous voulez — la clôture peut se faire en plusieurs sessions."}
        </p>
      </div>
    </div>
  )

  // Phase-driven button props
  const ctaLabel = isArchivePending
    ? "Finaliser et archiver l'année"
    : isInProgress
      ? 'Reprendre la clôture'
      : "Clôturer l'année"

  const ctaDescription = isArchivePending
    ? "Lance l'archivage final. Les données seront copiées dans /archive, les classes réinitialisées et la nouvelle année démarrée."
    : isInProgress
      ? `Continuez avec les ${totalClasses - classesTransitionedCount} classe(s) restante(s). L'archivage démarrera automatiquement à la fin.`
      : "Processus unique qui transitionne chaque classe (admis / échoué / abandonné) puis archive l'année et démarre la nouvelle."

  return (
    <div>
      {banner}
      <div
        className={cn(
          'rounded-md bg-white border p-4',
          isArchivePending
            ? 'border-danger/50 ring-2 ring-danger/20 shadow-[0_0_0_3px_rgba(185,28,28,0.08)]'
            : 'border-danger/20'
        )}
      >
        <p className="text-[0.78rem] text-ink-600 leading-snug mb-3">
          {ctaDescription}
        </p>
        <Button
          variant="danger"
          onClick={onStart}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  )
}

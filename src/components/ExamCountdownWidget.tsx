/**
 * RT-SC · Exam countdown widget.
 *
 * Displays upcoming national-exam countdowns relevant to the viewer:
 *   - Élève mode: pass `eleveLevel` (derived from their class). Shows
 *     only countdowns whose cible matches (or 'tous').
 *   - Prof mode: pass `classLevels` (the niveaux of the classes they
 *     teach). Shows countdowns matching ANY exam-eligible class.
 *
 * Hidden entirely (returns null) if:
 *   - The viewer has no exam-eligible classes
 *   - There are no configured countdowns
 *   - All countdowns are in the past
 *
 * Color-coded by urgency: red (≤7 days) · amber (≤30 days) · teal (beyond).
 * Sorted soonest-first. No interaction beyond viewing.
 */

import { motion } from 'framer-motion'
import { Hourglass } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useExamens } from '@/hooks/useExamens'
import {
  daysRemainingLabel,
  upcomingRelevantCountdowns,
  upcomingRelevantCountdownsForProf,
  urgencyTier,
  cibleLabel,
} from '@/lib/exam-utils'
import type { ExamCountdown } from '@/types/models'

type ExamCountdownWidgetProps =
  | {
      mode: 'eleve'
      /** The student's exam level, or null if not in an exam class. */
      eleveLevel: '3eme' | 'terminale' | null
    }
  | {
      mode: 'prof'
      /** All niveaux the prof teaches. Widget hides if none are exam levels. */
      classLevels: string[]
    }

export function ExamCountdownWidget(props: ExamCountdownWidgetProps) {
  const { data: examens, isLoading } = useExamens()

  if (isLoading || !examens || examens.length === 0) return null

  const upcoming =
    props.mode === 'eleve'
      ? upcomingRelevantCountdowns(examens, props.eleveLevel)
      : upcomingRelevantCountdownsForProf(examens, props.classLevels)

  if (upcoming.length === 0) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      aria-label="Examens à venir"
    >
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-danger animate-pulse"
        />
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-500">
          Examens à venir
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {upcoming.map((e) => (
          <ExamCard key={e.id} exam={e} />
        ))}
      </div>
    </motion.section>
  )
}

// ────────────────────────────────────────────────────────────

interface ExamCardProps {
  exam: ExamCountdown & { joursRestants: number }
}

function ExamCard({ exam }: ExamCardProps) {
  const tier = urgencyTier(exam.joursRestants)

  const styles = {
    critical: {
      ring: 'ring-danger/30',
      bg: 'bg-danger-bg/60',
      iconText: 'text-danger-dark',
      badge: 'bg-danger text-white',
    },
    warning: {
      ring: 'ring-warning/30',
      bg: 'bg-warning-bg/60',
      iconText: 'text-warning',
      badge: 'bg-warning text-white',
    },
    calm: {
      ring: 'ring-success/25',
      bg: 'bg-success-bg/50',
      iconText: 'text-success-dark',
      badge: 'bg-success text-white',
    },
  }[tier]

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1',
        styles.ring,
        styles.bg
      )}
    >
      <div
        className={cn(
          'shrink-0 w-10 h-10 rounded-full bg-white/70 flex items-center justify-center',
          styles.iconText
        )}
        aria-hidden
      >
        <Hourglass className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-ink-800 text-[0.9rem] leading-tight truncate">
            {exam.label}
          </span>
          <span className="shrink-0 text-[0.62rem] font-semibold tracking-wider uppercase text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded">
            {cibleLabel(exam.cible)}
          </span>
        </div>
        <div
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold',
            styles.badge
          )}
        >
          {daysRemainingLabel(exam.joursRestants)}
        </div>
      </div>
    </div>
  )
}

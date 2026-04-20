/**
 * RT-SC · Cours du jour widget (Accueil).
 *
 * Live status of the student's class schedule for today, displayed as a
 * single tappable card. Three states:
 *
 *   1. EN COURS         — A séance is currently running.
 *                         Shows matière + prof + remaining time
 *                         ("se termine dans 23 min") with a pulsing green
 *                         dot.
 *
 *   2. PROCHAIN         — No séance running, but more coming today.
 *                         Shows next matière + prof + countdown
 *                         ("dans 1h12" or "à 14:00" if > 2h away).
 *
 *   3. TERMINÉ          — All séances for today are done.
 *                         "Plus de cours aujourd'hui."
 *
 *   4. JOURNÉE LIBRE    — No séances scheduled today (Sunday or off-day).
 *                         "Pas de cours ce dimanche / lundi / etc."
 *
 *   5. PAS D'EMPLOI     — Class has zero séances total.
 *                         "L'emploi du temps n'est pas encore publié."
 *
 * The widget re-derives state from the cached /seances on every render
 * but doesn't tick — interactions or natural re-renders will recompute.
 * For pixel-perfect minute-level accuracy we'd add a 60s interval; not
 * worth the cost for this widget (the next user interaction refreshes it
 * naturally).
 *
 * Tap the card → navigates to the full Emploi tab.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, ChevronRight, Hourglass, Sparkles } from 'lucide-react'

import { useAllSeances } from '@/hooks/useSeances'
import { useProfs } from '@/hooks/useProfs'
import {
  currentJour,
  currentMinutes,
  isSeanceNow,
  parseHHMM,
} from '@/lib/seances'
import { cn } from '@/lib/cn'
import type { Seance } from '@/types/models'

interface Props {
  classeId: string
  /** Tab navigation hook from the dashboard parent. */
  onOpenEmploi?: () => void
}

type WidgetState =
  | { kind: 'enCours'; seance: Seance; remainingMin: number }
  | { kind: 'prochain'; seance: Seance; minutesUntil: number }
  | { kind: 'termine' }
  | { kind: 'journeeLibre'; jourLabel: string }
  | { kind: 'pasEmploi' }

function computeState(seances: Seance[], now: Date = new Date()): WidgetState {
  const today = currentJour(now)
  const todayLabel = today ?? 'dimanche'

  if (seances.length === 0) {
    return { kind: 'pasEmploi' }
  }

  const todays = today
    ? seances
        .filter((s) => s.jour === today)
        .sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
    : []

  if (todays.length === 0) {
    return { kind: 'journeeLibre', jourLabel: todayLabel.toLowerCase() }
  }

  const nowMin = currentMinutes(now)

  // En cours?
  const current = todays.find((s) => isSeanceNow(s, now))
  if (current) {
    const remaining = parseHHMM(current.heureFin) - nowMin
    return { kind: 'enCours', seance: current, remainingMin: Math.max(1, remaining) }
  }

  // Prochain?
  const upcoming = todays.find((s) => parseHHMM(s.heureDebut) > nowMin)
  if (upcoming) {
    const minutesUntil = parseHHMM(upcoming.heureDebut) - nowMin
    return { kind: 'prochain', seance: upcoming, minutesUntil }
  }

  // All done
  return { kind: 'termine' }
}

function formatRemaining(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

export function CoursDuJourWidget({ classeId, onOpenEmploi }: Props) {
  const { data: allSeances = [] } = useAllSeances()
  const { data: profs = [] } = useProfs()

  const seances = useMemo(
    () => allSeances.filter((s) => s.classeId === classeId),
    [allSeances, classeId]
  )

  const state = useMemo(() => computeState(seances), [seances])

  const profName = (profId: string) =>
    profs.find((p) => p.id === profId)?.nom ?? '—'

  const clickable = !!onOpenEmploi

  // ── Render-state-specific content ────────────────────────────
  let icon: React.ReactNode
  let iconBg: string
  let title: React.ReactNode
  let body: React.ReactNode

  switch (state.kind) {
    case 'enCours': {
      icon = (
        <div className="relative">
          <CalendarClock className="h-5 w-5" aria-hidden />
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-success animate-pulse ring-2 ring-white"
          />
        </div>
      )
      iconBg = 'bg-success-bg text-success ring-success/20'
      title = (
        <>
          <span className="text-success">En cours</span>
          <span className="text-ink-400 mx-1">·</span>
          <span className="text-navy">{state.seance.matiere}</span>
        </>
      )
      body = (
        <>
          {profName(state.seance.profId)} · se termine dans{' '}
          <span className="font-semibold text-ink-700">
            {formatRemaining(state.remainingMin)}
          </span>
        </>
      )
      break
    }
    case 'prochain': {
      icon = <Hourglass className="h-5 w-5" aria-hidden />
      iconBg = 'bg-warning-bg text-warning ring-warning/20'
      title = (
        <>
          <span className="text-warning">Prochain cours</span>
          <span className="text-ink-400 mx-1">·</span>
          <span className="text-navy">{state.seance.matiere}</span>
        </>
      )
      body = (
        <>
          {profName(state.seance.profId)} ·{' '}
          {state.minutesUntil <= 120 ? (
            <>
              dans{' '}
              <span className="font-semibold text-ink-700">
                {formatRemaining(state.minutesUntil)}
              </span>
            </>
          ) : (
            <>
              à{' '}
              <span className="font-semibold text-ink-700 font-mono">
                {state.seance.heureDebut}
              </span>
            </>
          )}
        </>
      )
      break
    }
    case 'termine': {
      icon = <Sparkles className="h-5 w-5" aria-hidden />
      iconBg = 'bg-info-bg text-navy ring-navy/20'
      title = <span className="text-navy">Plus de cours aujourd'hui</span>
      body = <>Bonne fin de journée — repos bien mérité.</>
      break
    }
    case 'journeeLibre': {
      icon = <Sparkles className="h-5 w-5" aria-hidden />
      iconBg = 'bg-ink-50 text-ink-500 ring-ink-200'
      title = <span className="text-navy">Journée libre</span>
      body = <>Pas de cours ce {state.jourLabel}.</>
      break
    }
    case 'pasEmploi': {
      icon = <CalendarClock className="h-5 w-5" aria-hidden />
      iconBg = 'bg-ink-50 text-ink-500 ring-ink-200'
      title = <span className="text-navy">Emploi du temps</span>
      body = <>Pas encore publié par la direction.</>
      break
    }
  }

  return (
    <motion.button
      type="button"
      onClick={onOpenEmploi}
      disabled={!clickable}
      whileTap={clickable ? { scale: 0.99 } : undefined}
      className={cn(
        'w-full text-left rounded-xl bg-white ring-1 ring-ink-100 px-4 py-3.5',
        'shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]',
        'transition-all',
        clickable
          ? 'hover:ring-navy/30 hover:bg-info-bg/20 cursor-pointer'
          : 'cursor-default'
      )}
      aria-label={
        state.kind === 'enCours'
          ? `Cours en cours: ${state.seance.matiere}, ouvre l'emploi du temps`
          : "Voir l'emploi du temps"
      }
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'shrink-0 flex h-10 w-10 items-center justify-center rounded-lg ring-1',
            iconBg
          )}
          aria-hidden
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.92rem] font-semibold leading-tight truncate">
            {title}
          </div>
          <div className="text-[0.78rem] text-ink-500 mt-0.5 truncate">
            {body}
          </div>
        </div>
        {clickable && (
          <ChevronRight
            className="h-4 w-4 text-ink-300 shrink-0"
            aria-hidden
          />
        )}
      </div>
    </motion.button>
  )
}

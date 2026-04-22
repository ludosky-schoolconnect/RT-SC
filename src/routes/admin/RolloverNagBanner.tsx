/**
 * RT-SC · RolloverNagBanner — site-wide admin banner.
 *
 * Shown at the top of AdminDashboard whenever ecole/config has
 * transitionInProgress === true. Persists across tabs so admin sees
 * the reminder even if they're browsing Classes or Élèves instead of
 * Année.
 *
 * Two visual tones:
 *   - "in progress" (navy tint): some classes still need transition
 *   - "archive required" (warning amber): all classes transitioned,
 *     only archive remains
 *
 * Tapping the CTA jumps admin to the Année tab via the parent-supplied
 * onJumpToAnnee callback. AdminDashboard controls the active tab
 * state so the switch is clean.
 */

import { AlertTriangle, Users, ArrowRight } from 'lucide-react'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useClasses } from '@/hooks/useClasses'
import { cn } from '@/lib/cn'

interface Props {
  onJumpToAnnee: () => void
}

export function RolloverNagBanner({ onJumpToAnnee }: Props) {
  const { data: config } = useEcoleConfig()
  const { data: classes = [] } = useClasses()

  const transitionInProgress = Boolean(config?.transitionInProgress)
  if (!transitionInProgress) return null

  const transitionedSet = new Set(config?.classesTransitioned ?? [])
  const classesDone = classes.filter((c) => transitionedSet.has(c.id)).length
  const total = classes.length
  const allDone = total > 0 && classesDone === total

  return (
    <div
      className={cn(
        'mb-4 rounded-md border-[1.5px] px-3.5 py-3 flex items-center gap-3 flex-wrap',
        allDone
          ? 'bg-warning-bg border-warning/40'
          : 'bg-info-bg border-navy/20'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          allDone
            ? 'bg-warning/20 text-warning-dark'
            : 'bg-navy/10 text-navy'
        )}
      >
        {allDone ? (
          <AlertTriangle className="h-4 w-4" aria-hidden />
        ) : (
          <Users className="h-4 w-4" aria-hidden />
        )}
      </div>
      <div className="flex-1 min-w-[180px]">
        <p
          className={cn(
            'text-[0.82rem] font-bold leading-tight',
            allDone ? 'text-warning-dark' : 'text-navy'
          )}
        >
          {allDone
            ? "Archivage requis pour finaliser l'année"
            : `Transition d'année en cours · ${classesDone}/${total} classes`}
        </p>
        <p className="text-[0.72rem] text-ink-700 mt-0.5 leading-snug">
          {allDone
            ? "Toutes les classes ont été traitées. Lancez l'archivage pour démarrer la nouvelle année."
            : 'Continuez pour les classes restantes, puis archivez pour finaliser.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onJumpToAnnee}
        className={cn(
          'shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.78rem] font-bold transition-colors',
          allDone
            ? 'bg-warning-dark text-white hover:bg-warning-dark/90'
            : 'bg-navy text-white hover:bg-navy/90'
        )}
      >
        Aller à Année
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

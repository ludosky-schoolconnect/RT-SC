/**
 * RT-SC · Séance card (shared).
 *
 * Renders one séance as a touch-friendly card. Used in:
 *   - Admin emploi tab (with edit/delete actions)
 *   - Prof "Mon emploi" read view
 *   - Élève/Parent "Emploi du temps" read view
 *
 * Left column: time range + duration.
 * Right column: matière (big), prof/class name, salle, optional "en cours" badge.
 * Actions (if any) render on the right edge.
 */

import { type ReactNode } from 'react'
import { Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { formatDuree, parseHHMM, seanceDurationMinutes } from '@/lib/seances'
import type { Seance } from '@/types/models'

interface Props {
  seance: Seance
  /** Secondary caption line under the matière (e.g. prof name for élève view, classe name for prof view). */
  subtitle?: string
  /** Show "En cours" badge (caller computes isSeanceNow). */
  isNow?: boolean
  /** Slot for right-edge actions (edit/delete, etc). */
  actions?: ReactNode
  className?: string
  onClick?: () => void
}

export function SeanceCard({
  seance,
  subtitle,
  isNow,
  actions,
  className,
  onClick,
}: Props) {
  const duree = seanceDurationMinutes(seance)
  const clickable = !!onClick

  return (
    <div
      className={cn(
        'relative flex items-stretch gap-3 rounded-lg border bg-white p-3 pr-3',
        'transition-colors',
        isNow
          ? 'border-success/40 bg-success-bg/40 ring-1 ring-success/30'
          : 'border-ink-100',
        clickable && 'cursor-pointer hover:border-navy/40 hover:bg-ink-50/40',
        className
      )}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
    >
      {/* Time pillar */}
      <div
        className={cn(
          'shrink-0 flex flex-col items-center justify-center rounded-md px-3 py-2 text-center',
          'min-w-[4.25rem]',
          isNow ? 'bg-success/10 text-success' : 'bg-ink-50 text-ink-800'
        )}
        aria-hidden
      >
        <div className="font-mono text-[0.95rem] font-bold leading-tight">
          {seance.heureDebut}
        </div>
        <div className="mt-0.5 h-px w-5 bg-current opacity-20" />
        <div className="mt-0.5 font-mono text-[0.85rem] leading-tight">
          {seance.heureFin}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[0.95rem] font-semibold text-ink-900 truncate">
            {seance.matiere}
          </h4>
          {isNow && (
            <Badge variant="success" size="sm">
              En cours
            </Badge>
          )}
        </div>

        {subtitle && (
          <p className="mt-0.5 text-[0.82rem] text-ink-500 truncate">
            {subtitle}
          </p>
        )}

        <div className="mt-1 flex items-center gap-3 text-[0.72rem] text-ink-400 flex-wrap">
          {duree > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {formatDuree(duree)}
            </span>
          )}
          {seance.salle && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              Salle {seance.salle}
            </span>
          )}
        </div>
      </div>

      {actions && (
        <div
          className="shrink-0 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  )
}

// Re-exported for consumers who want their own sorting
export { parseHHMM }

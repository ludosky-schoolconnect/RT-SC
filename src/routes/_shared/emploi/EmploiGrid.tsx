/**
 * RT-SC · Emploi grid (shared).
 *
 * Day-grouped stack of séances. Today's jour gets a visual emphasis; the
 * séance currently running (if any) gets a green "En cours" badge via
 * SeanceCard.
 *
 * Layout:
 *   - Mobile + default: vertical stack (Jour header → cards → next jour …)
 *   - We intentionally don't build a multi-column horizontal grid — on
 *     desktop the vertical stack centered at ~640px is more scannable
 *     than a 6-column smash, and it keeps feature parity between admin
 *     and read surfaces.
 *
 * renderActions: callback giving the consumer a slot for per-seance
 * actions (edit/delete). Called only if provided; no-op for read-only
 * surfaces.
 */

import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { currentJour, groupByJour, isSeanceNow } from '@/lib/seances'
import { JOURS_ORDRE } from '@/types/models'
import type { Jour, Seance } from '@/types/models'
import { SeanceCard } from './SeanceCard'

interface Props {
  seances: Seance[]
  /** Subtitle for each seance card (e.g. prof name for class view, classe name for prof view). */
  subtitleFor?: (s: Seance) => string | undefined
  /** Actions slot rendered on each card. Return null for none. */
  renderActions?: (s: Seance) => ReactNode
  /** Click handler on a card (opens detail / compose in edit). */
  onSeanceClick?: (s: Seance) => void
  /** Highlights today in the jour headers (default true). */
  highlightToday?: boolean
  /** Text shown under a day when it has no séance (null = hide empty days). */
  emptyDayText?: string | null
  className?: string
}

export function EmploiGrid({
  seances,
  subtitleFor,
  renderActions,
  onSeanceClick,
  highlightToday = true,
  emptyDayText = null,
  className,
}: Props) {
  const today = currentJour()
  const grouped = useMemo(() => groupByJour(seances), [seances])

  // If emptyDayText is null, we hide days that have no séance AND aren't
  // today. (Today always renders so users see "rien prévu aujourd'hui".)
  const daysToRender: Jour[] = JOURS_ORDRE.filter((j) => {
    if (grouped[j].length > 0) return true
    if (emptyDayText !== null) return true
    return j === today
  })

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {daysToRender.map((jour) => {
        const list = grouped[jour]
        const isToday = jour === today
        return (
          <section key={jour}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3
                className={cn(
                  'text-[0.85rem] font-semibold uppercase tracking-wider',
                  isToday && highlightToday
                    ? 'text-navy'
                    : 'text-ink-400'
                )}
              >
                {jour}
              </h3>
              {isToday && highlightToday && (
                <span className="inline-flex items-center rounded-full bg-navy/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-navy">
                  Aujourd'hui
                </span>
              )}
              <span className="ml-auto text-[0.72rem] text-ink-400">
                {list.length > 0 ? `${list.length} cours` : null}
              </span>
            </div>

            {list.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-100 bg-ink-50/40 px-4 py-5 text-center text-[0.82rem] text-ink-400">
                {emptyDayText ?? 'Journée libre.'}
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: Math.min(i * 0.02, 0.2) },
                    }}
                  >
                    <SeanceCard
                      seance={s}
                      subtitle={subtitleFor?.(s)}
                      isNow={isSeanceNow(s)}
                      actions={renderActions?.(s)}
                      onClick={onSeanceClick ? () => onSeanceClick(s) : undefined}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * RT-SC · Civisme admin — Maintenance card (status).
 *
 * Previously a "Purger" action button that admin clicked periodically.
 * The purge now runs server-side every month via the scheduled Cloud
 * Function `monthlyCivismePurge` (Session C) — no admin action
 * required. This card reassures them the maintenance is happening
 * automatically and shows when the next run is scheduled.
 *
 * The date shown is computed client-side (next 1st of month at 01:00
 * Africa/Porto-Novo). It's informational; the actual schedule lives
 * in `functions/src/scheduled/monthlyCivismePurge.ts`.
 */

import { useMemo } from 'react'
import { Archive, Info } from 'lucide-react'
import { serverNow } from '@/lib/serverTime'

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

/** Next 1st of month, at or after today, formatted as "1er juin 2026". */
function nextPurgeDateFr(now: Date): string {
  // Start with the 1st of the current month at 01:00 local time
  const candidate = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0)
  // If today is already past that (i.e. we're on the 2nd or later), next is the 1st of next month
  if (now.getTime() >= candidate.getTime()) {
    candidate.setMonth(candidate.getMonth() + 1)
  }
  const day = candidate.getDate() === 1 ? '1er' : `${candidate.getDate()}`
  return `${day} ${MOIS_FR[candidate.getMonth()]} ${candidate.getFullYear()}`
}

export function MaintenanceCard() {
  const nextDate = useMemo(() => nextPurgeDateFr(serverNow()), [])

  return (
    <div className="mt-8 rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 bg-ink-50/40 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy/10 ring-1 ring-navy/20">
          <Archive className="h-3.5 w-3.5 text-navy" aria-hidden />
        </div>
        <p className="font-display text-[0.9rem] font-bold text-navy leading-tight">
          Maintenance automatique
        </p>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-[0.78rem] text-ink-600 leading-snug">
          Les quêtes clôturées ou annulées et les réclamations honorées
          ou annulées de plus de 1 mois sont automatiquement supprimées
          chaque mois pour libérer de l'espace de stockage. L'historique
          des points de chaque élève est préservé.
        </p>

        <div className="rounded-md bg-info-bg/60 border border-navy/15 px-3 py-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-navy shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.72rem] text-ink-700 leading-snug">
            <span className="font-bold">Prochaine purge :</span> {nextDate}
          </p>
        </div>
      </div>
    </div>
  )
}

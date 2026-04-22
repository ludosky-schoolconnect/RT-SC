/**
 * RT-SC · Civisme — Historique section (student or parent view).
 *
 * Shows recent civismeHistory entries with icons, motif, delta
 * badges, and soldeApres snapshot. Used on the student civisme tab
 * and reused in the parent Accueil widget (compact mode).
 *
 * Live-updating via useCivismeHistory. Rendering is read-only —
 * no interactions, no edits (admin is the only actor that writes
 * history, via the mutating hooks upstream).
 */

import {
  Award,
  Gift,
  AlertTriangle,
  Hand,
  History,
  Plus,
  Minus,
} from 'lucide-react'
import { useCivismeHistory } from '@/hooks/useCivismeHistory'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import type { CivismeHistoryEntry, CivismeHistoryRaison } from '@/types/models'

interface Props {
  classeId: string
  eleveId: string
  /** Max rows to show. Full view shows 10, compact parent widget 3. */
  maxRows?: number
  /** Compact mode for the parent widget — slimmer rows, no header */
  compact?: boolean
}

export function HistoriqueSection({
  classeId,
  eleveId,
  maxRows = 10,
  compact = false,
}: Props) {
  const { data: entries = [], isLoading } = useCivismeHistory(
    classeId,
    eleveId,
    maxRows
  )

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className={compact ? 'h-12 w-full rounded-md' : 'h-16 w-full rounded-lg'} />
        <Skeleton className={compact ? 'h-12 w-full rounded-md' : 'h-16 w-full rounded-lg'} />
      </div>
    )
  }

  if (entries.length === 0) {
    if (compact) {
      return (
        <p className="text-[0.78rem] text-ink-500 italic py-2 text-center">
          Aucune activité pour le moment.
        </p>
      )
    }
    return (
      <EmptyState
        icon={<History className="h-7 w-7" />}
        title="Aucune activité"
        description="L'historique apparaîtra ici à chaque gain ou dépense de points."
      />
    )
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {entries.map((e) => (
        <HistoryRow key={e.id} entry={e} compact={compact} />
      ))}
    </div>
  )
}

// ─── Per-row ───────────────────────────────────────────────

function HistoryRow({
  entry: e,
  compact,
}: {
  entry: CivismeHistoryEntry
  compact: boolean
}) {
  const date = (e.date as { toDate?: () => Date })?.toDate?.()
  const meta = RAISON_META[e.raison]
  const isGain = e.delta > 0

  return (
    <div
      className={cn(
        'bg-white rounded-lg border-[1.5px] border-ink-100 flex items-start gap-3',
        compact ? 'px-3 py-2' : 'px-4 py-3'
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md ring-1',
          compact ? 'h-8 w-8' : 'h-10 w-10',
          meta.iconTone
        )}
      >
        <meta.Icon
          className={compact ? 'h-4 w-4' : 'h-5 w-5'}
          aria-hidden
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={cn(
              'font-display font-bold text-navy leading-tight',
              compact ? 'text-[0.82rem]' : 'text-[0.92rem]'
            )}
          >
            {labelFor(e)}
          </p>
          <DeltaPill delta={e.delta} compact={compact} />
        </div>
        {e.motif && !compact && (
          <p className="text-[0.78rem] text-ink-600 mt-1 italic leading-snug">
            "{e.motif}"
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[0.68rem] text-ink-500 flex-wrap">
          {date && (
            <span>
              {date.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {!compact && e.parNom && (
            <>
              <span>·</span>
              <span>par {e.parNom}</span>
            </>
          )}
          <span>·</span>
          <span className="font-semibold">Solde : {e.soldeApres} pts</span>
        </div>
      </div>

      {isGain && !compact && (
        <Plus className="h-3.5 w-3.5 text-success shrink-0 mt-1" aria-hidden />
      )}
      {!isGain && !compact && (
        <Minus className="h-3.5 w-3.5 text-danger shrink-0 mt-1" aria-hidden />
      )}
    </div>
  )
}

function DeltaPill({ delta, compact }: { delta: number; compact: boolean }) {
  const isGain = delta > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-bold shrink-0',
        compact ? 'text-[0.62rem] px-1.5 py-0' : 'text-[0.68rem] px-2 py-0.5',
        isGain ? 'bg-success text-white' : 'bg-danger text-white'
      )}
    >
      {isGain ? '+' : ''}
      {delta} pts
    </span>
  )
}

// ─── Raison metadata (icon + label + color) ───────────────

const RAISON_META: Record<
  CivismeHistoryRaison,
  {
    Icon: typeof Award
    iconTone: string
  }
> = {
  quete: {
    Icon: Award,
    iconTone: 'bg-success-bg text-success-dark ring-success/30',
  },
  reclamation: {
    Icon: Gift,
    iconTone: 'bg-gold-pale text-gold-dark ring-gold/30',
  },
  incident: {
    Icon: AlertTriangle,
    iconTone: 'bg-danger-bg text-danger ring-danger/30',
  },
  ajustement_manuel: {
    Icon: Hand,
    iconTone: 'bg-ink-50 text-ink-600 ring-ink-200',
  },
}

function labelFor(e: CivismeHistoryEntry): string {
  if (e.raison === 'quete') {
    return e.reference?.label
      ? `Quête accomplie : ${e.reference.label}`
      : 'Quête accomplie'
  }
  if (e.raison === 'reclamation') {
    return e.reference?.label
      ? `Récompense : ${e.reference.label}`
      : 'Récompense réclamée'
  }
  if (e.raison === 'incident') {
    return 'Incident signalé'
  }
  return e.delta > 0 ? 'Ajustement (+)' : 'Ajustement (-)'
}

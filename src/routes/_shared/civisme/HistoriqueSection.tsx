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
  RotateCcw,
} from 'lucide-react'
import { useCivismeHistory } from '@/hooks/useCivismeHistory'
import { useUndoIncident } from '@/hooks/useIncident'
import { useConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import type { CivismeHistoryEntry, CivismeHistoryRaison } from '@/types/models'

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000

interface Props {
  classeId: string
  eleveId: string
  /** Max rows to show. Full view shows 10, compact parent widget 3. */
  maxRows?: number
  /** Compact mode for the parent widget — slimmer rows, no header */
  compact?: boolean
  /** When provided, incident rows within 24 h show an undo button (admin only) */
  adminUid?: string
  adminNom?: string
}

export function HistoriqueSection({
  classeId,
  eleveId,
  maxRows = 10,
  compact = false,
  adminUid,
  adminNom,
}: Props) {
  const { data: entries = [], isLoading } = useCivismeHistory(
    classeId,
    eleveId,
    maxRows
  )
  const undoMut = useUndoIncident()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleUndo(entry: CivismeHistoryEntry) {
    const ok = await confirm({
      title: 'Annuler cet incident ?',
      message: `Les ${Math.abs(entry.delta)} pts retirés à ${entry.parNom ? `(par ${entry.parNom})` : ''} seront remboursés et l'entrée supprimée.`,
      confirmLabel: 'Annuler l\'incident',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await undoMut.mutateAsync({
        classeId,
        eleveId,
        historyEntryId: entry.id,
        undoneByUid: adminUid!,
        undoneByNom: adminNom,
      })
      toast.success(`Incident annulé. +${Math.abs(entry.delta)} pts remboursés (solde : ${result.newBalance} pts).`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d\'annuler cet incident.')
    }
  }

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
      {entries.map((e) => {
        const canUndo =
          !compact &&
          !!adminUid &&
          e.raison === 'incident' &&
          isWithin24h(e)
        return (
          <HistoryRow
            key={e.id}
            entry={e}
            compact={compact}
            onUndo={canUndo ? () => handleUndo(e) : undefined}
            undoing={undoMut.isPending}
          />
        )
      })}
    </div>
  )
}

function isWithin24h(entry: CivismeHistoryEntry): boolean {
  const ts = entry.date as { toMillis?: () => number }
  return typeof ts?.toMillis === 'function'
    ? Date.now() - ts.toMillis() < UNDO_WINDOW_MS
    : false
}

// ─── Per-row ───────────────────────────────────────────────

function HistoryRow({
  entry: e,
  compact,
  onUndo,
  undoing,
}: {
  entry: CivismeHistoryEntry
  compact: boolean
  onUndo?: () => void
  undoing?: boolean
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

      {/* Trailing indicator / undo button */}
      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoing}
          title="Annuler cet incident (24 h)"
          className="shrink-0 mt-0.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.68rem] font-semibold text-danger hover:bg-danger-bg transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Annuler
        </button>
      ) : (
        <>
          {isGain && !compact && (
            <Plus className="h-3.5 w-3.5 text-success shrink-0 mt-1" aria-hidden />
          )}
          {!isGain && !compact && (
            <Minus className="h-3.5 w-3.5 text-danger shrink-0 mt-1" aria-hidden />
          )}
        </>
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

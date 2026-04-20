/**
 * RT-SC · AbsencesClasseView (shared, staff-side).
 *
 * Renders a class's absences as a per-élève list. Each row shows the
 * élève's name + counts (marked / declared) + last absence date. Tap a
 * row → expand to show the chronological timeline (declared events +
 * appel-marked events merged).
 *
 * Per-row admin actions render only when `canManage=true`:
 *   - On a declared absence in 'en attente' → Valider / Refuser buttons
 *   - On any declared absence → Supprimer (with confirm)
 *
 * Used by:
 *   - Vie scolaire tab (admin + prof) with class picker above
 *   - Mes-classes inline drill-in (any prof tapping a class card)
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, ChevronDown, ChevronRight, ClipboardCheck,
  CalendarOff, CheckCircle2, XCircle, Hourglass, Clock,
  FileText, Trash2,
} from 'lucide-react'

import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

import { useEleves } from '@/hooks/useEleves'
import { useEleveAbsences } from '@/hooks/useEleveAbsences'
import {
  useClasseMarkedRollup,
  useEleveAbsencesUnified,
  type AbsenceCountRow,
  type UnifiedAbsence,
} from '@/hooks/useClasseAbsences'
import {
  useUpdateAbsenceStatut,
  useDeleteAbsence,
} from '@/hooks/useAbsenceManageMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { cn } from '@/lib/cn'
import type { StatutAbsence } from '@/types/models'

interface Props {
  classeId: string
  /** True for admin → renders Valider / Refuser / Supprimer actions. */
  canManage?: boolean
}

export function AbsencesClasseView({ classeId, canManage = false }: Props) {
  const { data: eleves = [], isLoading: loadingEleves } = useEleves(classeId)
  const { rollup, isLoading: loadingPresences } = useClasseMarkedRollup(classeId)

  // Build the per-élève base list. Even élèves with zero marked
  // absences may have declared absences — so we don't filter-down by
  // rollup; we render every élève and surface counts inline.
  const rows = useMemo(() => {
    const byId = new Map<string, AbsenceCountRow>()
    rollup.forEach((r) => byId.set(r.eleveId, r))
    return eleves.map((e) => {
      const rolled = byId.get(e.id)
      return {
        eleveId: e.id,
        eleveNom: e.nom,
        markedCount: rolled?.markedCount ?? 0,
        lastDate: rolled?.lastDate ?? null,
      }
    })
  }, [eleves, rollup])

  // Sort: élèves with marked absences first (by recency), then alpha
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.markedCount && !b.markedCount) return -1
      if (b.markedCount && !a.markedCount) return 1
      if (a.lastDate && b.lastDate) {
        return b.lastDate.getTime() - a.lastDate.getTime()
      }
      return a.eleveNom.localeCompare(b.eleveNom)
    })
  }, [rows])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const totalMarked = useMemo(
    () => rows.reduce((sum, r) => sum + r.markedCount, 0),
    [rows]
  )

  if (loadingEleves || loadingPresences) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (eleves.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOff className="h-10 w-10" />}
        title="Aucun élève"
        description="Cette classe n'a pas encore d'élèves enregistrés."
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="rounded-lg bg-ink-50/60 ring-1 ring-ink-100 px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="text-[0.78rem] text-ink-600">
          <span className="font-semibold text-ink-800">{eleves.length}</span> élèves
        </div>
        <div className="text-[0.78rem] text-ink-600">
          <span className="font-semibold text-ink-800">{totalMarked}</span> absences marquées
        </div>
        <div className="text-[0.78rem] text-ink-600">
          <span className="font-semibold text-ink-800">
            {rows.filter((r) => r.markedCount > 0).length}
          </span>{' '}
          élèves concernés
        </div>
      </div>

      {/* Per-élève rows */}
      <div className="space-y-2">
        {sorted.map((row) => (
          <EleveAbsenceRow
            key={row.eleveId}
            classeId={classeId}
            row={row}
            canManage={canManage}
            expanded={expandedId === row.eleveId}
            onToggle={() =>
              setExpandedId((cur) => (cur === row.eleveId ? null : row.eleveId))
            }
          />
        ))}
      </div>
    </div>
  )
}

// ─── Élève row + expansion ─────────────────────────────────────

function EleveAbsenceRow({
  classeId,
  row,
  canManage,
  expanded,
  onToggle,
}: {
  classeId: string
  row: { eleveId: string; eleveNom: string; markedCount: number; lastDate: Date | null }
  canManage: boolean
  expanded: boolean
  onToggle: () => void
}) {
  // Lazy-fetch declared absences only when expanded
  const { data: declared = [] } = useEleveAbsences(
    expanded ? classeId : null,
    expanded ? row.eleveId : null
  )
  const timeline = useEleveAbsencesUnified(
    expanded ? classeId : null,
    expanded ? row.eleveId : null,
    declared
  )

  const declaredCount = expanded ? declared.length : null
  const initials = row.eleveNom.charAt(0).toUpperCase()

  return (
    <div className="rounded-lg border border-ink-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-ink-50/40 transition-colors min-h-touch"
        aria-expanded={expanded}
      >
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.85rem]">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.92rem] font-semibold text-ink-900 truncate">
            {row.eleveNom}
          </div>
          <div className="text-[0.72rem] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {row.markedCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3" aria-hidden />
                <span className="font-semibold text-danger">{row.markedCount}</span>{' '}
                marquée{row.markedCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-ink-400">Aucune absence marquée</span>
            )}
            {declaredCount !== null && declaredCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" aria-hidden />
                <span className="font-semibold">{declaredCount}</span>{' '}
                déclarée{declaredCount > 1 ? 's' : ''}
              </span>
            )}
            {row.lastDate && (
              <span className="inline-flex items-center gap-1 text-ink-400">
                <Calendar className="h-3 w-3" aria-hidden />
                {formatShortDate(row.lastDate)}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" aria-hidden />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-ink-100 bg-ink-50/30"
          >
            <div className="p-3 space-y-2">
              {timeline.length === 0 ? (
                <p className="text-[0.82rem] text-ink-500 text-center py-4">
                  Aucune absence enregistrée pour cet élève.
                </p>
              ) : (
                timeline.map((entry) => (
                  <UnifiedAbsenceCard
                    key={entry.id}
                    entry={entry}
                    classeId={classeId}
                    canManage={canManage}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Single timeline card ─────────────────────────────────────

function UnifiedAbsenceCard({
  entry,
  classeId,
  canManage,
}: {
  entry: UnifiedAbsence
  classeId: string
  canManage: boolean
}) {
  const updateMut = useUpdateAbsenceStatut()
  const deleteMut = useDeleteAbsence()
  const toast = useToast()
  const confirm = useConfirm()

  async function approve() {
    if (entry.kind !== 'declared') return
    try {
      await updateMut.mutateAsync({
        classeId,
        eleveId: entry.eleveId,
        absenceId: entry.id,
        statut: 'validée',
      })
      toast.success('Absence validée.')
    } catch (err) {
      console.error('[approve] error:', err)
      toast.error('Échec de la validation.')
    }
  }

  async function refuse() {
    if (entry.kind !== 'declared') return
    try {
      await updateMut.mutateAsync({
        classeId,
        eleveId: entry.eleveId,
        absenceId: entry.id,
        statut: 'refusée',
      })
      toast.success('Absence refusée.')
    } catch (err) {
      console.error('[refuse] error:', err)
      toast.error('Échec du refus.')
    }
  }

  async function remove() {
    if (entry.kind !== 'declared') return
    const ok = await confirm({
      title: "Supprimer la déclaration ?",
      message: `« ${entry.raison.slice(0, 80)}${entry.raison.length > 80 ? '…' : ''} » sera supprimée définitivement.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({
        classeId,
        eleveId: entry.eleveId,
        absenceId: entry.id,
      })
      toast.success('Déclaration supprimée.')
    } catch (err) {
      console.error('[delete] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  const isMarked = entry.kind === 'marked'

  return (
    <article
      className={cn(
        'rounded-md border bg-white p-3',
        isMarked
          ? 'border-danger/30 bg-danger-bg/15'
          : 'border-warning/25 bg-warning-bg/10'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'shrink-0 flex h-8 w-8 items-center justify-center rounded-md ring-1',
            isMarked
              ? 'bg-danger-bg text-danger ring-danger/30'
              : 'bg-warning-bg text-warning ring-warning/30'
          )}
        >
          {isMarked ? (
            <ClipboardCheck className="h-4 w-4" aria-hidden />
          ) : (
            <FileText className="h-4 w-4" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="text-[0.85rem] font-semibold text-navy">
              {formatLongDate(entry.date)}
            </div>
            {entry.kind === 'declared' && <StatutBadge statut={entry.statut} />}
            {isMarked && (
              <Badge variant="danger" size="sm">
                Marquée par prof
              </Badge>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-[0.72rem] text-ink-500 flex-wrap">
            {entry.kind === 'declared' && (entry.heureDebut || entry.heureFin) && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                <span className="font-mono">
                  {entry.heureDebut ?? '?'}–{entry.heureFin ?? '?'}
                </span>
              </span>
            )}
            {entry.kind === 'marked' && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden />
                  <span className="font-mono">{entry.heure}</span>
                </span>
                <span>· {entry.matiereSlug.replace(/-/g, ' ')}</span>
                <span>· par {entry.prisPar}</span>
              </>
            )}
            {entry.kind === 'declared' && (
              <span>
                · source : {entry.source === 'parent' ? 'parent' : 'élève'}
              </span>
            )}
          </div>

          {entry.kind === 'declared' && entry.raison && (
            <p className="mt-2 text-[0.82rem] text-ink-700 whitespace-pre-wrap break-words">
              {entry.raison}
            </p>
          )}
          {isMarked && entry.raison && (
            <p className="mt-2 text-[0.82rem] text-ink-700 italic">
              Note : {entry.raison}
            </p>
          )}

          {/* Admin actions — declared only */}
          {canManage && entry.kind === 'declared' && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {entry.statut === 'en attente' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={approve}
                    loading={updateMut.isPending}
                  >
                    Valider
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon={<XCircle className="h-4 w-4" />}
                    onClick={refuse}
                    loading={updateMut.isPending}
                  >
                    Refuser
                  </Button>
                </>
              )}
              <IconButton
                variant="danger"
                aria-label="Supprimer la déclaration"
                onClick={remove}
                disabled={deleteMut.isPending}
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// ─── Statut badge ──────────────────────────────────────────────

function StatutBadge({ statut }: { statut: StatutAbsence }) {
  if (statut === 'validée') {
    return (
      <Badge variant="success" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" />}>
        Validée
      </Badge>
    )
  }
  if (statut === 'refusée') {
    return (
      <Badge variant="danger" size="sm" leadingIcon={<XCircle className="h-3 w-3" />}>
        Refusée
      </Badge>
    )
  }
  return (
    <Badge variant="warning" size="sm" leadingIcon={<Hourglass className="h-3 w-3" />}>
      En attente
    </Badge>
  )
}

// ─── Date helpers ──────────────────────────────────────────────

function formatLongDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return d.toString()
  }
}

function formatShortDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
    }).format(d)
  } catch {
    return d.toString()
  }
}

/**
 * RT-SC · AbsencesEcoleView (admin triage).
 *
 * Flat list of every declared absence in the school, sorted by date desc.
 * Replaces the legacy admin "absences globales" table with proper search,
 * filters, and one-tap Valider/Refuser/Supprimer actions per row.
 *
 * Two filter dimensions:
 *   - Search bar — élève name, classe label, raison
 *   - Statut tabs — Toutes / À traiter (en attente) / Validées / Refusées
 *
 * Rows render as cards (mobile-friendly) with action buttons. Tapping
 * Valider/Refuser is a single Firestore write per click.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarOff, Search, Hourglass, CheckCircle2, XCircle, Clock,
  User, Trash2, FileText,
} from 'lucide-react'

import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'

import { useSchoolAbsences, type SchoolAbsence } from '@/hooks/useSchoolAbsences'
import { useClasses } from '@/hooks/useClasses'
import {
  useUpdateAbsenceStatut,
  useDeleteAbsence,
} from '@/hooks/useAbsenceManageMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { StatutAbsence } from '@/types/models'

type StatutFilter = 'all' | 'pending' | 'validated' | 'refused'

export function AbsencesEcoleView() {
  const { data: absences = [], isLoading } = useSchoolAbsences()
  const { data: classes = [] } = useClasses()

  const classeNomById = useMemo(() => {
    const m = new Map<string, string>()
    classes.forEach((c) => m.set(c.id, nomClasse(c)))
    return m
  }, [classes])

  const [searchQ, setSearchQ] = useState('')
  const [filter, setFilter] = useState<StatutFilter>('pending')

  // Apply filters
  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return absences.filter((a) => {
      // Statut filter
      if (filter === 'pending' && a.statut !== 'en attente') return false
      if (filter === 'validated' && a.statut !== 'validée') return false
      if (filter === 'refused' && a.statut !== 'refusée') return false
      // Search
      if (!q) return true
      const haystack = [
        a.eleveNom,
        a.classeNom,
        classeNomById.get(a.classeId) ?? '',
        a.raison,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [absences, filter, searchQ, classeNomById])

  // Counters per statut (always computed off the unfiltered set)
  const counts = useMemo(() => {
    let pending = 0,
      validated = 0,
      refused = 0
    for (const a of absences) {
      if (a.statut === 'en attente') pending++
      else if (a.statut === 'validée') validated++
      else if (a.statut === 'refusée') refused++
    }
    return { pending, validated, refused, total: absences.length }
  }, [absences])

  if (isLoading && absences.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <FilterChip
          active={filter === 'pending'}
          label="À traiter"
          count={counts.pending}
          tone="warning"
          onClick={() => setFilter('pending')}
        />
        <FilterChip
          active={filter === 'all'}
          label="Toutes"
          count={counts.total}
          tone="neutral"
          onClick={() => setFilter('all')}
        />
        <FilterChip
          active={filter === 'validated'}
          label="Validées"
          count={counts.validated}
          tone="success"
          onClick={() => setFilter('validated')}
        />
        <FilterChip
          active={filter === 'refused'}
          label="Refusées"
          count={counts.refused}
          tone="danger"
          onClick={() => setFilter('refused')}
        />
      </div>

      {/* Search */}
      {absences.length > 5 && (
        <Input
          type="search"
          placeholder="Rechercher élève, classe ou motif…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          leading={<Search className="h-4 w-4 text-ink-400" />}
        />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-10 w-10" />}
          title={
            filter === 'pending'
              ? "Rien à traiter"
              : searchQ
                ? "Aucun résultat"
                : "Aucune déclaration"
          }
          description={
            filter === 'pending'
              ? "Toutes les déclarations ont été traitées."
              : searchQ
                ? `Aucune absence ne correspond à « ${searchQ} ».`
                : "Les déclarations apparaîtront ici dès qu'un élève ou parent en soumet une."
          }
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { delay: Math.min(i * 0.012, 0.12) },
                }}
                exit={{ opacity: 0, scale: 0.96 }}
                layout
              >
                <AbsenceTriageCard
                  absence={a}
                  classeNom={classeNomById.get(a.classeId) ?? a.classeNom}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ─── Filter chip ──────────────────────────────────────────────

function FilterChip({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  tone: 'warning' | 'neutral' | 'success' | 'danger'
  onClick: () => void
}) {
  const activeTone = {
    warning: 'bg-warning text-white ring-warning',
    neutral: 'bg-navy text-white ring-navy',
    success: 'bg-success text-white ring-success',
    danger: 'bg-danger text-white ring-danger',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.78rem] font-semibold ring-1 transition-all',
        active
          ? activeTone + ' shadow-sm'
          : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50'
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.7rem] font-bold',
          active ? 'bg-white/20' : 'bg-ink-100 text-ink-700'
        )}
      >
        {count}
      </span>
    </button>
  )
}

// ─── Triage card ──────────────────────────────────────────────

function AbsenceTriageCard({
  absence,
  classeNom,
}: {
  absence: SchoolAbsence
  classeNom: string
}) {
  const updateMut = useUpdateAbsenceStatut()
  const deleteMut = useDeleteAbsence()
  const toast = useToast()
  const confirm = useConfirm()

  async function setStatut(statut: 'validée' | 'refusée') {
    try {
      await updateMut.mutateAsync({
        classeId: absence.classeId,
        eleveId: absence.eleveId,
        absenceId: absence.id,
        statut,
      })
      toast.success(`Absence ${statut}.`)
    } catch (err) {
      console.error('[setStatut] error:', err)
      toast.error('Échec du changement de statut.')
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Supprimer la déclaration ?',
      message: `« ${absence.raison.slice(0, 80)}${absence.raison.length > 80 ? '…' : ''} » sera supprimée définitivement.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({
        classeId: absence.classeId,
        eleveId: absence.eleveId,
        absenceId: absence.id,
      })
      toast.success('Déclaration supprimée.')
    } catch (err) {
      console.error('[remove] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  const dateStr = formatLongDate(absence.date)
  const sourceLabel =
    absence.source === 'parent'
      ? 'Parent'
      : absence.source === 'appel_prof'
        ? 'Prof'
        : 'Élève'

  return (
    <article
      className={cn(
        'rounded-lg border bg-white p-3.5 shadow-sm',
        absence.statut === 'en attente'
          ? 'border-warning/30'
          : 'border-ink-100'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.85rem]">
          {absence.eleveNom.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h4 className="font-display text-[0.95rem] font-semibold text-navy leading-tight truncate">
                {absence.eleveNom}
              </h4>
              <p className="text-[0.72rem] text-ink-500 mt-0.5 truncate">
                {classeNom}
              </p>
            </div>
            <StatutBadge statut={absence.statut} />
          </div>

          <div className="mt-2 flex items-center gap-2 text-[0.72rem] text-ink-500 flex-wrap">
            <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
              {dateStr}
            </span>
            {(absence.heureDebut || absence.heureFin) && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                <span className="font-mono">
                  {absence.heureDebut ?? '?'}–{absence.heureFin ?? '?'}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" aria-hidden />
              {sourceLabel}
            </span>
          </div>

          {absence.raison && (
            <p className="mt-2 text-[0.85rem] text-ink-700 whitespace-pre-wrap break-words">
              {absence.raison}
            </p>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {absence.statut === 'en attente' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => setStatut('validée')}
                  loading={updateMut.isPending}
                >
                  Valider
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<XCircle className="h-4 w-4" />}
                  onClick={() => setStatut('refusée')}
                  loading={updateMut.isPending}
                >
                  Refuser
                </Button>
              </>
            )}
            {absence.statut !== 'en attente' && (
              <button
                type="button"
                onClick={() => setStatut('en attente' as never)}
                className="text-[0.72rem] text-ink-400 hover:text-navy underline transition-colors !min-h-0"
                disabled
                title="Réinitialisation manuelle non supportée"
              >
                {/* placeholder for potential 'reset' action */}
              </button>
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

// ─── Date helper ──────────────────────────────────────────────

function formatLongDate(ts: { toDate?: () => Date } | Date | undefined): string {
  if (!ts) return '—'
  try {
    const d =
      ts instanceof Date
        ? ts
        : typeof ts.toDate === 'function'
          ? ts.toDate()
          : new Date(ts as unknown as string)
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return '—'
  }
}

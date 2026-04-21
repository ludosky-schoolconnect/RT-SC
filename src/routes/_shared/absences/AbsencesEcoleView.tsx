/**
 * RT-SC · AbsencesEcoleView (admin triage — DECLARATIONS ONLY).
 *
 * Flat list of every self-DECLARED absence (élève or parent) in the
 * school. Appel-marked absences are a separate concept and live in
 * the "Appels du jour" view (today) + "Archive" view (past).
 *
 * Splitting them matters because:
 *   - Declarations are PROPOSALS admin reviews (validate/refuse/delete)
 *   - Marked absences are FACTS admin monitors (no review, only delete)
 *   - Mixing them confused the chip filters and cluttered the triage view
 *
 * Also: this view triggers the daily archive rollover (unchanged from
 * 5d.6) — admin's first visit to any Vie scolaire surface triggers
 * /presences/ cleanup.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarOff, Search, Hourglass, CheckCircle2, XCircle, Clock,
  User, Trash2,
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
import { cleanRaison, RAISON_PLACEHOLDER } from '@/lib/absences-display'
import type { StatutAbsence } from '@/types/models'

type Filter = 'pending' | 'today' | 'all' | 'validated' | 'refused'

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function tsToDate(ts: unknown): Date {
  if (!ts) return new Date(0)
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date }
  if (typeof t.toDate === 'function') return t.toDate()
  return new Date(0)
}

export function AbsencesEcoleView() {
  const { data: absences = [], isLoading } = useSchoolAbsences()
  const { data: classes = [] } = useClasses()

  const classeNomById = useMemo(() => {
    const m = new Map<string, string>()
    classes.forEach((c) => m.set(c.id, nomClasse(c)))
    return m
  }, [classes])

  const [searchQ, setSearchQ] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    const today = new Date()
    return absences.filter((a) => {
      const aDate = tsToDate(a.date)
      if (filter === 'today' && !isSameDay(aDate, today)) return false
      if (filter === 'pending' && a.statut !== 'en attente') return false
      if (filter === 'validated' && a.statut !== 'validée') return false
      if (filter === 'refused' && a.statut !== 'refusée') return false
      if (!q) return true
      const haystack = [
        a.eleveNom,
        classeNomById.get(a.classeId) ?? a.classeNom ?? '',
        a.raison,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [absences, filter, searchQ, classeNomById])

  // Counters per chip (computed on unfiltered set)
  const counts = useMemo(() => {
    const today = new Date()
    let todayCount = 0
    let pending = 0
    let validated = 0
    let refused = 0
    for (const a of absences) {
      if (isSameDay(tsToDate(a.date), today)) todayCount++
      if (a.statut === 'en attente') pending++
      else if (a.statut === 'validée') validated++
      else if (a.statut === 'refusée') refused++
    }
    return { today: todayCount, pending, validated, refused, total: absences.length }
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
      {/* Helper line to reinforce the scope change */}
      <div className="rounded-md bg-info-bg/40 border border-info/30 px-3 py-2 text-[0.78rem] text-ink-700">
        Cette vue ne présente que les <strong>déclarations</strong> d'élèves et parents.
        Pour les absences marquées par les profs, consultez{' '}
        <span className="font-semibold">Appels du jour</span> ou{' '}
        <span className="font-semibold">Archive</span>.
      </div>

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
          active={filter === 'today'}
          label="Aujourd'hui"
          count={counts.today}
          tone="navy"
          onClick={() => setFilter('today')}
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
          placeholder="Rechercher élève, classe, motif…"
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
              ? 'Rien à traiter'
              : searchQ
                ? 'Aucun résultat'
                : 'Aucune déclaration'
          }
          description={
            filter === 'pending'
              ? 'Toutes les déclarations ont été traitées.'
              : searchQ
                ? `Aucune déclaration ne correspond à « ${searchQ} ».`
                : "Les déclarations d'élèves et parents apparaîtront ici."
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
                <DeclaredCard
                  absence={a}
                  classeNom={classeNomById.get(a.classeId) ?? a.classeNom ?? '—'}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ─── FilterChip ───────────────────────────────────────────────

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
  tone: 'warning' | 'neutral' | 'success' | 'danger' | 'navy'
  onClick: () => void
}) {
  const activeTone: Record<string, string> = {
    warning: 'bg-warning text-white ring-warning',
    neutral: 'bg-ink-700 text-white ring-ink-700',
    success: 'bg-success text-white ring-success',
    danger: 'bg-danger text-white ring-danger',
    navy: 'bg-navy text-white ring-navy',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.78rem] font-semibold ring-1 transition-all',
        active
          ? activeTone[tone] + ' shadow-sm'
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

// ─── DeclaredCard ─────────────────────────────────────────────

function DeclaredCard({
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
  const cleanedRaison = cleanRaison(absence.raison)
  const date = tsToDate(absence.date)

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
    const what = cleanedRaison
      ? `« ${cleanedRaison.slice(0, 80)}${cleanedRaison.length > 80 ? '…' : ''} »`
      : `La déclaration de ${absence.eleveNom} (${formatDateFR(date)})`
    const ok = await confirm({
      title: 'Supprimer la déclaration ?',
      message: `${what} sera supprimée définitivement.`,
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
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Échec de la suppression : ${msg}`)
    }
  }

  return (
    <article
      className={cn(
        'rounded-lg border bg-white p-3.5 shadow-sm',
        absence.statut === 'en attente'
          ? 'border-warning/30'
          : 'border-ink-100'
      )}
    >
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
              {formatDateFR(date)}
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
              {absence.source === 'parent' ? 'Parent' : 'Élève'}
            </span>
          </div>

          {cleanedRaison ? (
            <p className="mt-2 text-[0.85rem] text-ink-700 whitespace-pre-wrap break-words">
              {cleanedRaison}
            </p>
          ) : (
            <p className="mt-2 text-[0.78rem] text-ink-400 italic">
              {RAISON_PLACEHOLDER}
            </p>
          )}

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
            <IconButton
              variant="danger"
              aria-label="Supprimer"
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

// ─── StatutBadge ───────────────────────────────────────────────

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

function formatDateFR(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return d.toString()
  }
}

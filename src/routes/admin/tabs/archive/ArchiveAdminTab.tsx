/**
 * RT-SC · Admin → Archive des absences marquées (grouped).
 *
 * Structure mirrors AppelsDuJourView but covers historical data:
 *   Date
 *     Class
 *       Matière (N/total absents)
 *         Élève list (expandable)
 *
 * This keeps the mental model consistent — admin reviews today's
 * appels in one place and yesterday's-or-older in the same visual
 * structure, just with an added top-level grouping by date.
 *
 * Filters:
 *   - Date range (default: last 30 days, mandatory)
 *   - Class (filters the grouped view)
 *   - Matière (filters within classes)
 *   - Élève name search
 *
 * Actions:
 *   - Supprimer (per élève row, admin only)
 *   - No bulk delete in this grouped view — admin wanting to nuke a
 *     date range should switch to the flat list (future alternative)
 *     or use the Firebase console. Bulk in a grouped list gets
 *     ergonomically weird.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Archive as ArchiveIcon, ChevronDown, ChevronRight,
  Clock, Search, Trash2, User,
} from 'lucide-react'

import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import { ExportMenu } from '@/components/ui/ExportMenu'

import { useClasses, useClasseEleveCount } from '@/hooks/useClasses'
import {
  useArchivedAbsences,
  type ArchiveRange,
} from '@/hooks/useArchivedAbsences'
import { useDeleteArchivedAbsence } from '@/hooks/useAbsenceManageMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { nomClasse } from '@/lib/benin'
import { cleanRaison } from '@/lib/absences-display'
import {
  exportAbsencesCSV,
  exportAbsencesPDF,
  rangeSubtitle,
  type AbsenceExportRow,
} from '@/lib/absence-export'
import { cn } from '@/lib/cn'
import { serverNow } from '@/lib/serverTime'
import type { ArchivedAbsence, Classe } from '@/types/models'

// ─── Date helpers ─────────────────────────────────────────────

function dateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function localStartOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function localEndOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function formatLongDate(dateISO: string): string {
  try {
    const d = new Date(dateISO + 'T12:00:00')
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return dateISO
  }
}

const DEFAULT_LOOKBACK_DAYS = 30

// ─── Component ────────────────────────────────────────────────

export function ArchiveAdminTab() {
  const { data: classes = [] } = useClasses()

  const [fromDateStr, setFromDateStr] = useState<string>(() => {
    const d = serverNow()
    d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS)
    return dateInputValue(d)
  })
  const [toDateStr, setToDateStr] = useState<string>(() =>
    dateInputValue(serverNow())
  )

  const range = useMemo<ArchiveRange>(() => {
    const from = localStartOfDay(new Date(fromDateStr + 'T12:00:00'))
    const to = localEndOfDay(new Date(toDateStr + 'T12:00:00'))
    return { from, to }
  }, [fromDateStr, toDateStr])

  const { data: archive = [], isLoading } = useArchivedAbsences(range)

  const classeNomById = useMemo(() => {
    const m = new Map<string, string>()
    classes.forEach((c) => m.set(c.id, nomClasse(c)))
    return m
  }, [classes])

  const classesById = useMemo(() => {
    const m = new Map<string, Classe>()
    classes.forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  const [classeFilter, setClasseFilter] = useState<string>('')
  const [matiereFilter, setMatiereFilter] = useState<string>('')
  const [searchQ, setSearchQ] = useState<string>('')

  const availableClasseFilter = useMemo(() => {
    const ids = new Set<string>()
    archive.forEach((a) => ids.add(a.classeId))
    return classes.filter((c) => ids.has(c.id))
  }, [archive, classes])

  const availableMatiereFilter = useMemo(() => {
    const slugs = new Map<string, string>()
    archive.forEach((a) => {
      if (classeFilter && a.classeId !== classeFilter) return
      slugs.set(a.matiereSlug, a.matiere || a.matiereSlug.replace(/-/g, ' '))
    })
    return Array.from(slugs.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [archive, classeFilter])

  useEffect(() => {
    if (matiereFilter && !availableMatiereFilter.some(([s]) => s === matiereFilter)) {
      setMatiereFilter('')
    }
  }, [availableMatiereFilter, matiereFilter])

  // Apply row filters
  const filteredFlat = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return archive.filter((a) => {
      if (classeFilter && a.classeId !== classeFilter) return false
      if (matiereFilter && a.matiereSlug !== matiereFilter) return false
      if (!q) return true
      const haystack = [
        a.eleveNom,
        classeNomById.get(a.classeId) ?? a.classeNom ?? '',
        a.matiere ?? '',
        a.raison ?? '',
        a.prisPar ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [archive, classeFilter, matiereFilter, searchQ, classeNomById])

  // Group: date → classeId → matiereSlug → entries
  const grouped = useMemo(() => {
    const byDate = new Map<
      string,
      Map<string, Map<string, ArchivedAbsence[]>>
    >()
    filteredFlat.forEach((a) => {
      if (!byDate.has(a.dateISO)) byDate.set(a.dateISO, new Map())
      const byClasse = byDate.get(a.dateISO)!
      if (!byClasse.has(a.classeId)) byClasse.set(a.classeId, new Map())
      const byMatiere = byClasse.get(a.classeId)!
      if (!byMatiere.has(a.matiereSlug)) byMatiere.set(a.matiereSlug, [])
      byMatiere.get(a.matiereSlug)!.push(a)
    })
    // Sort dates desc
    return Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredFlat])

  function setRangeLast(days: number) {
    const d = serverNow()
    d.setDate(d.getDate() - days)
    setFromDateStr(dateInputValue(d))
    setToDateStr(dateInputValue(serverNow()))
  }

  // Which preset (if any) matches the current range? A preset is active
  // when `from === today − N days` AND `to === today`. We check the
  // dates as strings (not millis) so DST/time-of-day don't matter.
  const activeDays = useMemo<number | null>(() => {
    const todayStr = dateInputValue(serverNow())
    if (toDateStr !== todayStr) return null
    for (const n of [7, 30, 90, 365]) {
      const d = serverNow()
      d.setDate(d.getDate() - n)
      if (dateInputValue(d) === fromDateStr) return n
    }
    return null
  }, [fromDateStr, toDateStr])

  // ── Export ──────────────────────────────────────────────────
  const exportToast = useToast()

  function toExportRows(list: ArchivedAbsence[]): AbsenceExportRow[] {
    return list.map((a) => ({
      dateISO: a.dateISO,
      classeNom: classeNomById.get(a.classeId) ?? a.classeNom ?? '',
      eleveNom: a.eleveNom,
      matiere: a.matiere || a.matiereSlug.replace(/-/g, ' '),
      heure: a.heure ?? '',
      prof: a.prisPar ?? '',
      raison: cleanRaison(a.raison) ?? '',
    }))
  }

  function handleExport(format: 'csv' | 'pdf') {
    try {
      const rows = toExportRows(filteredFlat)
      if (rows.length === 0) return
      const prefix = 'archive-absences'
      if (format === 'csv') {
        exportAbsencesCSV(rows, prefix)
        exportToast.success(`${rows.length} ligne${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''} en CSV.`)
      } else {
        exportAbsencesPDF(rows, {
          title: 'Archive des absences marquées',
          subtitle: rangeSubtitle(fromDateStr, toDateStr, rows.length),
          filenamePrefix: prefix,
        })
        exportToast.success('PDF généré.')
      }
    } catch (err) {
      console.error('[export] error:', err)
      exportToast.error("Échec de l'export.")
    }
  }

  return (
    <div>
      {/* Date range */}
      <div className="rounded-lg bg-ink-50/60 ring-1 ring-ink-100 px-3 py-3 space-y-3 mb-4">
        <p className="text-[0.7rem] uppercase tracking-[0.15em] font-bold text-ink-500">
          Période
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[0.72rem] font-semibold text-ink-500 mb-1">
              Du
            </label>
            <input
              type="date"
              value={fromDateStr}
              max={toDateStr}
              onChange={(e) => setFromDateStr(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[0.85rem] text-ink-800 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy/40"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[0.72rem] font-semibold text-ink-500 mb-1">
              Au
            </label>
            <input
              type="date"
              value={toDateStr}
              min={fromDateStr}
              onChange={(e) => setToDateStr(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[0.85rem] text-ink-800 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy/40"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <RangePreset label="7 j" active={activeDays === 7} onClick={() => setRangeLast(7)} />
          <RangePreset label="30 j" active={activeDays === 30} onClick={() => setRangeLast(30)} />
          <RangePreset label="90 j" active={activeDays === 90} onClick={() => setRangeLast(90)} />
          <RangePreset label="1 an" active={activeDays === 365} onClick={() => setRangeLast(365)} />
        </div>
      </div>

      {/* Filters */}
      {availableClasseFilter.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            value={classeFilter}
            onChange={(e) => setClasseFilter(e.target.value)}
            aria-label="Filtrer par classe"
            className="flex-1 min-w-[140px] rounded-md border border-ink-200 bg-white px-3 py-2 text-[0.85rem] text-ink-800 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy/40"
          >
            <option value="">Toutes les classes</option>
            {availableClasseFilter.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c)}
              </option>
            ))}
          </select>
          {availableMatiereFilter.length > 0 && (
            <select
              value={matiereFilter}
              onChange={(e) => setMatiereFilter(e.target.value)}
              aria-label="Filtrer par matière"
              className="flex-1 min-w-[140px] rounded-md border border-ink-200 bg-white px-3 py-2 text-[0.85rem] text-ink-800 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy/40"
            >
              <option value="">Toutes les matières</option>
              {availableMatiereFilter.map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {(classeFilter || matiereFilter) && (
            <button
              type="button"
              onClick={() => {
                setClasseFilter('')
                setMatiereFilter('')
              }}
              className="shrink-0 rounded-md px-3 py-2 text-[0.78rem] font-semibold text-ink-500 hover:text-navy hover:bg-ink-50 transition-colors"
            >
              Effacer
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {archive.length > 5 && (
        <div className="mb-3">
          <Input
            type="search"
            placeholder="Rechercher élève, classe, matière, motif…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            leading={<Search className="h-4 w-4 text-ink-400" />}
          />
        </div>
      )}

      {/* Summary + export */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[0.78rem] text-ink-600">
          {filteredFlat.length > 0 ? (
            <span>
              <span className="font-semibold text-ink-800">{filteredFlat.length}</span>
              {' '}absence{filteredFlat.length > 1 ? 's' : ''} marquée{filteredFlat.length > 1 ? 's' : ''}
              {filteredFlat.length !== archive.length && (
                <span className="text-ink-400"> / {archive.length} dans la période</span>
              )}
            </span>
          ) : (
            <span className="text-ink-400">Aucune absence à exporter</span>
          )}
        </div>
        <ExportMenu
          disabled={filteredFlat.length === 0}
          countLabel={`${filteredFlat.length} ligne${filteredFlat.length > 1 ? 's' : ''} à exporter`}
          onCsv={() => handleExport('csv')}
          onPdf={() => handleExport('pdf')}
        />
      </div>

      {/* Grouped list */}
      {isLoading && archive.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<ArchiveIcon className="h-10 w-10" />}
          title={
            archive.length === 0
              ? 'Aucune archive dans la période'
              : 'Aucun résultat'
          }
          description={
            archive.length === 0
              ? "Aucune absence marquée n'a été archivée entre ces deux dates."
              : searchQ || classeFilter || matiereFilter
                ? 'Aucune archive ne correspond aux filtres.'
                : ''
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateISO, classeMap]) => (
            <DateGroup
              key={dateISO}
              dateISO={dateISO}
              classeMap={classeMap}
              classesById={classesById}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Date group ───────────────────────────────────────────────

function DateGroup({
  dateISO,
  classeMap,
  classesById,
}: {
  dateISO: string
  classeMap: Map<string, Map<string, ArchivedAbsence[]>>
  classesById: Map<string, Classe>
}) {
  const classes = useMemo(
    () => Array.from(classeMap.entries()).sort(),
    [classeMap]
  )

  const totalOnDate = useMemo(
    () =>
      classes.reduce(
        (sum, [, matieres]) =>
          sum +
          Array.from(matieres.values()).reduce((s, arr) => s + arr.length, 0),
        0
      ),
    [classes]
  )

  return (
    <section>
      <div className="sticky top-0 z-[1] bg-ink-50 -mx-1 px-1 py-2 mb-2 flex items-baseline gap-2 border-b border-ink-100">
        <h3 className="font-display font-bold text-[0.92rem] text-navy">
          {formatLongDate(dateISO)}
        </h3>
        <span className="text-[0.72rem] text-ink-500">
          · {totalOnDate} absence{totalOnDate > 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-2">
        {classes.map(([classeId, matieres]) => {
          const classe = classesById.get(classeId)
          return (
            <ClasseCardArchive
              key={classeId}
              classe={classe ?? null}
              classeIdFallback={classeId}
              matieres={matieres}
            />
          )
        })}
      </div>
    </section>
  )
}

// ─── Classe card (archive variant) ────────────────────────────

function ClasseCardArchive({
  classe,
  classeIdFallback,
  matieres,
}: {
  classe: Classe | null
  classeIdFallback: string
  matieres: Map<string, ArchivedAbsence[]>
}) {
  const { data: totalEleves = 0 } = useClasseEleveCount(classe?.id ?? undefined)

  const matList = useMemo(
    () => Array.from(matieres.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    [matieres]
  )

  const totalMarked = useMemo(
    () => matList.reduce((sum, [, list]) => sum + list.length, 0),
    [matList]
  )

  const classeLabel = classe
    ? nomClasse(classe)
    : matList[0]?.[1][0]?.classeNom || classeIdFallback

  return (
    <article className="rounded-lg border border-ink-100 bg-white shadow-sm overflow-hidden">
      <header className="bg-navy/90 text-white px-3 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display font-bold text-[0.92rem] truncate">
            {classeLabel}
          </h4>
          <p className="text-[0.68rem] text-white/70 mt-0.5">
            {totalEleves > 0 && `${totalEleves} élèves · `}
            {totalMarked} absence{totalMarked > 1 ? 's' : ''}
          </p>
        </div>
      </header>
      <div className="divide-y divide-ink-100">
        {matList.map(([matiereSlug, entries]) => (
          <MatiereRowArchive
            key={matiereSlug}
            matiereSlug={matiereSlug}
            entries={entries}
            totalEleves={totalEleves}
          />
        ))}
      </div>
    </article>
  )
}

// ─── Matière row (archive variant) ────────────────────────────

function MatiereRowArchive({
  matiereSlug,
  entries,
  totalEleves,
}: {
  matiereSlug: string
  entries: ArchivedAbsence[]
  totalEleves: number
}) {
  const [expanded, setExpanded] = useState(false)
  const matiereLabel =
    entries[0]?.matiere || matiereSlug.replace(/-/g, ' ')
  const nbAbsent = entries.length
  const ratio = totalEleves > 0 ? nbAbsent / totalEleves : 0

  const countTone =
    ratio === 0
      ? 'text-ink-400'
      : ratio < 0.1
        ? 'text-warning'
        : 'text-danger'

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-ink-50/40 transition-colors min-h-touch"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[0.88rem] font-semibold text-navy">
              {matiereLabel}
            </span>
            {entries[0]?.prisPar && (
              <span className="inline-flex items-center gap-1 text-[0.68rem] text-ink-500">
                <User className="h-3 w-3" aria-hidden />
                {uniqueProfs(entries).join(', ')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1 text-[0.78rem]">
            <span className={cn('font-bold font-mono', countTone)}>
              {nbAbsent}
            </span>
            {totalEleves > 0 && (
              <>
                <span className="text-ink-400">/{totalEleves}</span>
              </>
            )}
            <span className="text-ink-500 ml-1">
              absent{nbAbsent > 1 ? 's' : ''}
            </span>
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
            className="overflow-hidden bg-ink-50/40"
          >
            <div className="px-3 py-2 space-y-1.5">
              {entries
                .slice()
                .sort((a, b) => a.eleveNom.localeCompare(b.eleveNom))
                .map((e) => (
                  <ArchivedEleveRow key={e.id} entry={e} />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function uniqueProfs(entries: ArchivedAbsence[]): string[] {
  const set = new Set<string>()
  entries.forEach((e) => {
    if (e.prisPar) set.add(e.prisPar)
  })
  return Array.from(set)
}

// ─── Archived élève row ───────────────────────────────────────

function ArchivedEleveRow({ entry }: { entry: ArchivedAbsence }) {
  const deleteMut = useDeleteArchivedAbsence()
  const toast = useToast()
  const confirm = useConfirm()
  const cleanedRaison = cleanRaison(entry.raison)
  const matiereLabel = entry.matiere || entry.matiereSlug.replace(/-/g, ' ')

  async function remove() {
    const ok = await confirm({
      title: "Supprimer l'entrée d'archive ?",
      message: `L'absence marquée pour ${entry.eleveNom} en ${matiereLabel} (${formatLongDate(entry.dateISO)}) sera supprimée définitivement de l'archive.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(entry.id)
      toast.success("Entrée d'archive supprimée.")
    } catch (err) {
      console.error('[remove archive] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  return (
    <div className="rounded-md bg-white ring-1 ring-ink-100 px-3 py-2 flex items-start gap-2.5">
      <Badge variant="danger" size="sm">
        Absent
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-[0.88rem] font-semibold text-ink-900 truncate">
          {entry.eleveNom}
        </div>
        <div className="text-[0.7rem] text-ink-500 flex items-center gap-2 flex-wrap mt-0.5">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            <span className="font-mono">{entry.heure || '—'}</span>
          </span>
          {entry.prisPar && <span>par {entry.prisPar}</span>}
        </div>
        {cleanedRaison ? (
          <p className="mt-1 text-[0.78rem] text-ink-700 italic">
            Note : {cleanedRaison}
          </p>
        ) : (
          <p className="mt-1 text-[0.72rem] text-ink-400 italic">
            Note : raison d'absence inconnue
          </p>
        )}
      </div>
      <IconButton
        variant="danger"
        aria-label="Supprimer cette entrée d'archive"
        onClick={remove}
        disabled={deleteMut.isPending}
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

// ─── Range preset ─────────────────────────────────────────────

function RangePreset({
  label,
  active = false,
  onClick,
}: {
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-colors !min-h-0 !min-w-0 ring-1',
        active
          ? 'bg-navy text-white ring-navy shadow-sm'
          : 'bg-white text-ink-600 ring-ink-200 hover:text-navy hover:ring-navy/40'
      )}
    >
      {label}
    </button>
  )
}

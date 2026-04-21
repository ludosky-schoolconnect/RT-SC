/**
 * RT-SC · Appels du jour view (today's attendance, grouped).
 *
 * Per-class × per-matière grid showing absent/total counts. Each
 * matière row expands to reveal the absent élèves inline.
 *
 * Shows ONLY appel-marked absences — declarations live in Triage école
 * (which is declarations-only as of 5d.8). The two are genuinely
 * different data models and deserve separate surfaces.
 *
 * Used by:
 *   - Admin Vie scolaire → "Appels du jour" mode (canManage=true,
 *     all classes)
 *   - Prof Vie scolaire → "Appels du jour" mode (canManage=false,
 *     only classes they teach)
 *
 * For the group-by-date-then-class-then-matière archive view, see
 * AppelsArchiveView — similar layout applied to historical data.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarOff, ChevronDown, ChevronRight, ClipboardCheck,
  Clock, Trash2, User,
} from 'lucide-react'

import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { ExportMenu } from '@/components/ui/ExportMenu'

import { useSchoolMarkedAbsences } from '@/hooks/useSchoolMarkedAbsences'
import { useEleves } from '@/hooks/useEleves'
import { useClasses, useClasseEleveCount } from '@/hooks/useClasses'
import { useDeleteMarkedAbsence } from '@/hooks/useAbsenceManageMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { nomClasse } from '@/lib/benin'
import { cleanRaison } from '@/lib/absences-display'
import {
  exportAbsencesCSV,
  exportAbsencesPDF,
  todaySubtitle,
  type AbsenceExportRow,
} from '@/lib/absence-export'
import { cn } from '@/lib/cn'
import type { Classe } from '@/types/models'

interface Props {
  /** Classes in scope — admin: all; prof: teaching classes only. */
  availableClasses: Classe[]
  /** True → show delete actions on individual élève rows. */
  canManage?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTodayLong(): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .format(new Date())
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return new Date().toLocaleDateString('fr-FR')
  }
}

// ─── Component ────────────────────────────────────────────────

export function AppelsDuJourView({
  availableClasses,
  canManage = false,
}: Props) {
  const { data: marked = [], isLoading } = useSchoolMarkedAbsences()

  // Group marked entries by class, then by matière
  const grouped = useMemo(() => {
    const byClasse = new Map<
      string,
      Map<string, typeof marked>
    >()
    const availableIds = new Set(availableClasses.map((c) => c.id))

    marked.forEach((m) => {
      if (!availableIds.has(m.classeId)) return // prof scope filter
      if (!byClasse.has(m.classeId)) byClasse.set(m.classeId, new Map())
      const byMatiere = byClasse.get(m.classeId)!
      if (!byMatiere.has(m.matiereSlug)) byMatiere.set(m.matiereSlug, [])
      byMatiere.get(m.matiereSlug)!.push(m)
    })

    return byClasse
  }, [marked, availableClasses])

  // Only render classes that actually have absences today. Empty classes
  // would clutter the view with rows of "0/X" that aren't actionable.
  const classesWithAbsences = useMemo(() => {
    return availableClasses.filter((c) => grouped.has(c.id))
  }, [availableClasses, grouped])

  // Flatten the grouped marked entries into row shape for export.
  // Scope-limited (already filtered by availableClasses during grouping).
  const classeNomById = useMemo(() => {
    const m = new Map<string, string>()
    availableClasses.forEach((c) => m.set(c.id, nomClasse(c)))
    return m
  }, [availableClasses])

  const scopedMarked = useMemo(() => {
    const out: AbsenceExportRow[] = []
    for (const [classeId, matieresMap] of grouped.entries()) {
      for (const [matiereSlug, entries] of matieresMap.entries()) {
        for (const e of entries) {
          out.push({
            dateISO: e.dateISO,
            classeNom: classeNomById.get(classeId) ?? '',
            eleveNom: e.eleveNom,
            matiere: matiereSlug.replace(/-/g, ' '),
            heure: e.heure ?? '',
            prof: e.prisPar ?? '',
            raison: cleanRaison(e.raison) ?? '',
          })
        }
      }
    }
    // Sort by classe then matière then élève for a nice export order
    out.sort((a, b) => {
      const c = a.classeNom.localeCompare(b.classeNom)
      if (c !== 0) return c
      const m = a.matiere.localeCompare(b.matiere)
      if (m !== 0) return m
      return a.eleveNom.localeCompare(b.eleveNom)
    })
    return out
  }, [grouped, classeNomById])

  const exportToast = useToast()

  function handleExport(format: 'csv' | 'pdf') {
    try {
      if (scopedMarked.length === 0) return
      const prefix = 'appels-du-jour'
      if (format === 'csv') {
        exportAbsencesCSV(scopedMarked, prefix)
        exportToast.success(
          `${scopedMarked.length} ligne${scopedMarked.length > 1 ? 's' : ''} exportée${scopedMarked.length > 1 ? 's' : ''} en CSV.`
        )
      } else {
        exportAbsencesPDF(scopedMarked, {
          title: 'Appels du jour — absences marquées',
          subtitle: todaySubtitle(scopedMarked.length),
          filenamePrefix: prefix,
        })
        exportToast.success('PDF généré.')
      }
    } catch (err) {
      console.error('[export appels] error:', err)
      exportToast.error("Échec de l'export.")
    }
  }

  if (isLoading && marked.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="rounded-lg bg-ink-50/60 ring-1 ring-ink-100 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardCheck className="h-4 w-4 text-ink-400" aria-hidden />
          <span className="text-[0.82rem] font-semibold text-ink-700">
            {formatTodayLong()}
          </span>
          <span className="text-[0.72rem] text-ink-500">
            ·{' '}
            <span className="font-semibold text-ink-700">{scopedMarked.length}</span>{' '}
            absence{scopedMarked.length > 1 ? 's' : ''} marquée{scopedMarked.length > 1 ? 's' : ''}
          </span>
        </div>
        <ExportMenu
          disabled={scopedMarked.length === 0}
          countLabel={`${scopedMarked.length} ligne${scopedMarked.length > 1 ? 's' : ''} à exporter`}
          onCsv={() => handleExport('csv')}
          onPdf={() => handleExport('pdf')}
        />
      </div>

      {classesWithAbsences.length === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-10 w-10" />}
          title="Aucune absence marquée aujourd'hui"
          description={
            marked.length === 0
              ? "Les appels du jour n'ont encore rien marqué, ou tous les élèves étaient présents."
              : "Aucune des classes que vous voyez n'a d'absence marquée aujourd'hui."
          }
        />
      ) : (
        <div className="space-y-3">
          {classesWithAbsences.map((classe) => (
            <ClasseCard
              key={classe.id}
              classe={classe}
              matieresMap={grouped.get(classe.id) ?? new Map()}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ClasseCard ───────────────────────────────────────────────

function ClasseCard({
  classe,
  matieresMap,
  canManage,
}: {
  classe: Classe
  matieresMap: Map<string, ReturnType<typeof useSchoolMarkedAbsences>['data'] extends (infer T)[] | undefined ? T : never[]>
  canManage: boolean
}) {
  const { data: totalEleves = 0 } = useClasseEleveCount(classe.id)

  // Sort matières alphabetically
  const matieres = useMemo(
    () =>
      Array.from(matieresMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      ),
    [matieresMap]
  )

  const totalMarked = useMemo(
    () => matieres.reduce((sum, [, list]) => sum + list.length, 0),
    [matieres]
  )

  return (
    <article className="rounded-lg border border-ink-100 bg-white shadow-sm overflow-hidden">
      {/* Class header */}
      <header className="bg-navy text-white px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-[0.98rem] truncate">
            {nomClasse(classe)}
          </h3>
          <p className="text-[0.68rem] text-white/70 mt-0.5">
            {totalEleves} élève{totalEleves > 1 ? 's' : ''} · {totalMarked} absence{totalMarked > 1 ? 's' : ''} marquée{totalMarked > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {/* Matière rows */}
      <div className="divide-y divide-ink-100">
        {matieres.map(([matiereSlug, entries]) => (
          <MatiereRow
            key={matiereSlug}
            matiereSlug={matiereSlug}
            entries={entries as import('@/hooks/useSchoolMarkedAbsences').SchoolMarkedAbsence[]}
            totalEleves={totalEleves}
            classeId={classe.id}
            canManage={canManage}
          />
        ))}
      </div>
    </article>
  )
}

// ─── MatiereRow ───────────────────────────────────────────────

function MatiereRow({
  matiereSlug,
  entries,
  totalEleves,
  classeId,
  canManage,
}: {
  matiereSlug: string
  entries: import('@/hooks/useSchoolMarkedAbsences').SchoolMarkedAbsence[]
  totalEleves: number
  classeId: string
  canManage: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const matiereLabel = matiereSlug.replace(/-/g, ' ')
  const nbAbsent = entries.length
  const ratio = totalEleves > 0 ? nbAbsent / totalEleves : 0

  // Intensity color based on absence ratio
  const countTone =
    ratio === 0
      ? 'text-ink-400'
      : ratio < 0.1
        ? 'text-warning'
        : 'text-danger'

  const canExpand = nbAbsent > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        className={cn(
          'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors min-h-touch',
          canExpand
            ? 'hover:bg-ink-50/40 cursor-pointer'
            : 'cursor-default'
        )}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[0.92rem] font-semibold text-navy">
              {matiereLabel}
            </span>
            {entries[0]?.prisPar && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-500">
                <User className="h-3 w-3" aria-hidden />
                {uniqueProfs(entries).join(', ')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-1 text-[0.82rem]">
            <span className={cn('font-bold font-mono', countTone)}>
              {nbAbsent}
            </span>
            <span className="text-ink-400">/{totalEleves}</span>
            <span className="text-ink-500 ml-1">
              absent{nbAbsent > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {canExpand &&
          (expanded ? (
            <ChevronDown className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" aria-hidden />
          ))}
      </button>

      <AnimatePresence initial={false}>
        {expanded && canExpand && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden bg-ink-50/40"
          >
            <div className="px-4 py-2 space-y-1.5">
              {entries
                .slice()
                .sort((a, b) => a.eleveNom.localeCompare(b.eleveNom))
                .map((e) => (
                  <EleveAbsentRow
                    key={e.id}
                    entry={e}
                    classeId={classeId}
                    matiereSlug={matiereSlug}
                    canManage={canManage}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function uniqueProfs(
  entries: import('@/hooks/useSchoolMarkedAbsences').SchoolMarkedAbsence[]
): string[] {
  const set = new Set<string>()
  entries.forEach((e) => {
    if (e.prisPar) set.add(e.prisPar)
  })
  return Array.from(set)
}

// ─── EleveAbsentRow ───────────────────────────────────────────

function EleveAbsentRow({
  entry,
  classeId,
  matiereSlug,
  canManage,
}: {
  entry: import('@/hooks/useSchoolMarkedAbsences').SchoolMarkedAbsence
  classeId: string
  matiereSlug: string
  canManage: boolean
}) {
  const deleteMut = useDeleteMarkedAbsence()
  const toast = useToast()
  const confirm = useConfirm()
  const cleanedRaison = cleanRaison(entry.raison)

  async function remove() {
    const ok = await confirm({
      title: "Supprimer l'absence marquée ?",
      message: `L'absence marquée pour ${entry.eleveNom} en ${matiereSlug.replace(/-/g, ' ')} sera supprimée définitivement.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({
        classeId,
        dateISO: entry.dateISO,
        matiereSlug,
        eleveId: entry.eleveId,
      })
      toast.success('Absence supprimée.')
    } catch (err) {
      console.error('[remove] error:', err)
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
      {canManage && (
        <IconButton
          variant="danger"
          aria-label="Supprimer cette absence"
          onClick={remove}
          disabled={deleteMut.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  )
}

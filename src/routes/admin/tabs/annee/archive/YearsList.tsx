/**
 * RT-SC · Year archive — list of archived years.
 */

import { useState } from 'react'
import { Archive, AlertCircle, ChevronRight, GraduationCap, School, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { useArchivedYears } from '@/hooks/useYearArchive'
import { ModalDeleteArchivedYear } from './ModalDeleteArchivedYear'
import type { Timestamp } from 'firebase/firestore'

interface Props {
  onPick: (annee: string) => void
}

function tsToDate(ts: Timestamp | undefined): Date | null {
  if (!ts) return null
  const t = ts as unknown as { toDate?: () => Date }
  if (typeof t.toDate === 'function') return t.toDate()
  return null
}

function formatArchivedAt(ts: Timestamp | undefined): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return d.toLocaleDateString('fr-FR')
  }
}

export function YearsList({ onPick }: Props) {
  const { data: years = [], isLoading } = useArchivedYears()

  // Delete modal state: which year is currently being deleted?
  // null = no modal open.
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  if (isLoading && years.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (years.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="h-10 w-10" />}
        title="Aucune année archivée"
        description="Les années archivées apparaîtront ici après chaque transition annuelle. La transition s'effectue depuis la Zone dangereuse ci-dessus."
      />
    )
  }

  return (
    <>
      <div className="space-y-2">
        {years.map((y) => (
          <YearCard
            key={y.annee}
            annee={y.annee}
            classesCount={y.classesCount}
            elevesCount={y.elevesCount}
            errorsCount={y.errorsCount}
            archivedAt={y.archivedAt}
            formatArchivedAt={formatArchivedAt}
            onOpen={() => onPick(y.annee)}
            onDelete={() => setDeleteTarget(y.annee)}
          />
        ))}
      </div>

      {/* Delete modal — kept mounted with keyed `open` so the content
          doesn't flash between years when target switches. */}
      <ModalDeleteArchivedYear
        open={!!deleteTarget}
        annee={deleteTarget ?? ''}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}

// ─── Card ─────────────────────────────────────────────────────

function YearCard({
  annee,
  classesCount,
  elevesCount,
  errorsCount,
  archivedAt,
  formatArchivedAt,
  onOpen,
  onDelete,
}: {
  annee: string
  classesCount: number
  elevesCount: number
  errorsCount: number
  archivedAt: Timestamp | undefined
  formatArchivedAt: (ts: Timestamp | undefined) => string
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className="group rounded-lg border border-ink-100 bg-white shadow-sm hover:border-navy/30 hover:shadow-md transition-all flex items-center">
      {/* Main clickable body — opens the archive */}
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-left p-4 flex items-center gap-3 min-w-0"
      >
        <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-navy/10 text-navy ring-1 ring-navy/20 group-hover:bg-navy group-hover:text-white transition-colors">
          <Archive className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-display font-bold text-[1.02rem] text-navy">
            Année {annee}
          </h4>
          <div className="mt-1 flex items-center gap-3 text-[0.72rem] text-ink-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <School className="h-3 w-3" aria-hidden />
              {classesCount} classe{classesCount > 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="h-3 w-3" aria-hidden />
              {elevesCount} élève{elevesCount > 1 ? 's' : ''}
            </span>
            <span>· Archivée le {formatArchivedAt(archivedAt)}</span>
            {errorsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {errorsCount} erreur{errorsCount > 1 ? 's' : ''} lors de l'archivage
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-ink-300 group-hover:text-navy transition-colors shrink-0" aria-hidden />
      </button>

      {/* Delete action — separate button, visually quiet */}
      <div className="pr-3 shrink-0">
        <IconButton
          variant="danger"
          aria-label={`Supprimer l'archive ${annee}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

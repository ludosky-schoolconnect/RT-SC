/**
 * RT-SC · Year archive — list of classes for a given archived year.
 */

import { ChevronRight, School } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useArchivedClasses } from '@/hooks/useYearArchive'
import { nomClasse } from '@/lib/benin'

interface Props {
  annee: string
  onPick: (classeId: string, classeNom: string) => void
}

export function ClassesList({ annee, onPick }: Props) {
  const { data: classes = [], isLoading } = useArchivedClasses(annee)

  if (isLoading && classes.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={<School className="h-10 w-10" />}
        title="Aucune classe"
        description={`L'archive de l'année ${annee} ne contient aucune classe.`}
      />
    )
  }

  // Sort: cycle ascending, then niveau ascending, then série
  const sorted = [...classes].sort((a, b) => {
    return nomClasse(a).localeCompare(nomClasse(b), 'fr')
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {sorted.map((c) => {
        const label = nomClasse(c)
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id, label)}
            className="group text-left rounded-lg border border-ink-100 bg-white p-3.5 shadow-sm hover:border-navy/30 hover:shadow-md transition-all flex items-center gap-3 min-h-touch"
          >
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold-dark ring-1 ring-gold/30 group-hover:bg-gold-dark group-hover:text-white transition-colors">
              <School className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-display font-semibold text-[0.96rem] text-navy truncate">
                {label}
              </h4>
            </div>
            <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-navy transition-colors shrink-0" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

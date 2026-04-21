/**
 * RT-SC · Year archive — list of élèves for a given archived class.
 */

import { useMemo, useState } from 'react'
import { ChevronRight, GraduationCap, Search } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { useArchivedEleves } from '@/hooks/useYearArchive'

interface Props {
  annee: string
  classeId: string
  onPick: (eleveId: string, eleveNom: string) => void
}

export function ElevesList({ annee, classeId, onPick }: Props) {
  const { data: eleves = [], isLoading } = useArchivedEleves(annee, classeId)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return eleves
    return eleves.filter((e) => (e.nom ?? '').toLowerCase().includes(needle))
  }, [eleves, q])

  if (isLoading && eleves.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {eleves.length > 5 && (
        <Input
          type="search"
          placeholder={`Rechercher parmi ${eleves.length} élèves…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leading={<Search className="h-4 w-4 text-ink-400" />}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title={q ? 'Aucun résultat' : 'Aucun élève'}
          description={
            q
              ? `Aucun élève ne correspond à « ${q} ».`
              : 'Cette classe archivée ne contient aucun élève.'
          }
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e.id, e.nom ?? 'Sans nom')}
              className="group w-full text-left rounded-md border border-ink-100 bg-white p-3 shadow-sm hover:border-navy/30 hover:shadow-md transition-all flex items-center gap-3 min-h-touch"
            >
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.82rem]">
                {(e.nom ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[0.92rem] text-navy truncate">
                  {e.nom ?? 'Sans nom'}
                </div>
                {e.matricule && (
                  <div className="text-[0.7rem] text-ink-500 mt-0.5">
                    Matricule : {e.matricule}
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-navy transition-colors shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

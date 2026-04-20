/**
 * RT-SC · Élèves table.
 *
 * Responsive list:
 *   - md+ : real <table> with hover rows
 *   - mobile: stacked cards
 *
 * Virtualizes when > 50 élèves to keep frames smooth on Termux/Android Chrome.
 *
 * Each row is tappable → opens ModalEleveDetail.
 */

import { useMemo } from 'react'
import { ChevronRight, GraduationCap } from 'lucide-react'
import type { Eleve } from '@/types/models'
import { calculerAge } from '@/lib/benin'
import { VirtualList } from '@/components/ui/VirtualList'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

interface ElevesTableProps {
  eleves: Eleve[]
  onSelect: (eleve: Eleve) => void
}

const VIRTUAL_THRESHOLD = 50

export function ElevesTable({ eleves, onSelect }: ElevesTableProps) {
  const useVirtual = eleves.length > VIRTUAL_THRESHOLD

  // Mobile card renderer
  const renderMobileRow = (e: Eleve, index: number) => (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className={cn(
        'w-full text-left flex items-center gap-3 px-4 py-3 bg-white',
        'border-b border-ink-100',
        'hover:bg-info-bg active:bg-info-bg transition-colors min-h-touch'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-bold text-sm',
          e.genre === 'F' ? 'bg-serie-a-bg text-serie-a' : 'bg-info-bg text-navy'
        )}
        aria-hidden
      >
        {e.nom.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-navy truncate">
          <span className="text-[0.7rem] font-bold text-ink-400 mr-1">
            {String(index + 1).padStart(2, '0')}
          </span>
          {e.nom}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge variant={e.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
            {e.genre === 'F' ? 'F' : 'M'}
          </Badge>
          {(() => {
            const a = calculerAge(e.date_naissance)
            return a !== null ? (
              <span className="text-[0.7rem] text-ink-400">{a} ans</span>
            ) : null
          })()}
          {e.contactParent && (
            <span className="text-[0.7rem] text-ink-400 truncate">
              · {e.contactParent}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
    </button>
  )

  // Desktop table renderer (a single row at a time, used inside <table>)
  const desktopRows = useMemo(() => {
    return eleves.map((e, index) => (
      <tr
        key={e.id}
        onClick={() => onSelect(e)}
        className="border-t border-ink-100 cursor-pointer hover:bg-info-bg transition-colors"
      >
        <td className="px-4 py-3 text-sm text-ink-400 font-mono">
          {String(index + 1).padStart(3, '0')}
        </td>
        <td className="px-4 py-3 align-middle">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display font-bold text-sm',
                e.genre === 'F' ? 'bg-serie-a-bg text-serie-a' : 'bg-info-bg text-navy'
              )}
              aria-hidden
            >
              {e.nom.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-navy">{e.nom}</span>
          </div>
        </td>
        <td className="px-4 py-3 align-middle">
          <Badge variant={e.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
            {e.genre === 'F' ? 'Féminin' : 'Masculin'}
          </Badge>
        </td>
        <td className="px-4 py-3 align-middle text-sm text-ink-600">
          {(() => {
            const a = calculerAge(e.date_naissance)
            return a !== null ? `${a} ans` : '—'
          })()}
        </td>
        <td className="px-4 py-3 align-middle text-sm text-ink-600">
          {e.contactParent || '—'}
        </td>
        <td className="px-4 py-3 align-middle text-right">
          <ChevronRight className="h-4 w-4 text-ink-400 inline-block" aria-hidden />
        </td>
      </tr>
    ))
  }, [eleves, onSelect])

  if (eleves.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-100 bg-ink-50/30 px-6 py-10 text-center">
        <GraduationCap className="h-10 w-10 text-ink-400 mx-auto mb-2" aria-hidden />
        <p className="font-display text-base font-semibold text-navy">
          Aucun élève dans cette classe
        </p>
        <p className="text-sm text-ink-600 mt-1">
          Ajoutez le premier élève via le bouton « Nouvel élève » en haut.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-ink-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-ink-50/50 text-ink-400 text-[0.7rem] font-bold uppercase tracking-wider">
              <th className="px-4 py-3 w-16">N°</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Genre</th>
              <th className="px-4 py-3">Âge</th>
              <th className="px-4 py-3">Contact parent</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>{desktopRows}</tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden rounded-lg overflow-hidden border border-ink-100">
        {useVirtual ? (
          <VirtualList
            items={eleves}
            rowHeight={68}
            getKey={(e) => e.id}
            renderRow={(e, index) => renderMobileRow(e, index)}
            className="max-h-[calc(100dvh-380px)]"
          />
        ) : (
          eleves.map((e, i) => <div key={e.id}>{renderMobileRow(e, i)}</div>)
        )}
      </div>
    </>
  )
}

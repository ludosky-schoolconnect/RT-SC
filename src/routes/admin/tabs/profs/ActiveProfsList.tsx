/**
 * RT-SC · Active profs list (responsive).
 *
 * - md+ : table with avatar, nom, email, matières, class count, chevron
 * - mobile: stacked cards
 *
 * Tap a row → opens ModalProfDetail.
 */

import { ChevronRight, Mail, Users } from 'lucide-react'
import type { Professeur } from '@/types/models'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

interface ActiveProfsListProps {
  profs: Professeur[]
  onSelect: (prof: Professeur) => void
}

export function ActiveProfsList({ profs, onSelect }: ActiveProfsListProps) {
  if (profs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-100 bg-ink-50/30 px-6 py-10 text-center">
        <Users className="h-10 w-10 text-ink-400 mx-auto mb-2" aria-hidden />
        <p className="font-display text-base font-semibold text-navy">
          Aucun professeur actif
        </p>
        <p className="text-sm text-ink-600 mt-1">
          Les professeurs approuvés apparaîtront ici.
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
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Matières</th>
              <th className="px-4 py-3">Classes</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {profs.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className="border-t border-ink-100 cursor-pointer hover:bg-info-bg transition-colors"
              >
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-info-bg text-navy font-display font-bold text-sm">
                      {p.nom.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-navy">{p.nom}</span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-ink-600">
                  {p.email}
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-wrap gap-1 max-w-md">
                    {(p.matieres ?? []).slice(0, 3).map((m) => (
                      <Badge key={m} variant="neutral" size="sm">
                        {m}
                      </Badge>
                    ))}
                    {(p.matieres ?? []).length > 3 && (
                      <Badge variant="neutral" size="sm">
                        +{(p.matieres ?? []).length - 3}
                      </Badge>
                    )}
                    {(!p.matieres || p.matieres.length === 0) && (
                      <span className="text-ink-400 italic">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-sm font-semibold',
                      (p.classesIds?.length ?? 0) === 0
                        ? 'text-ink-400'
                        : 'text-navy'
                    )}
                  >
                    {p.classesIds?.length ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <ChevronRight className="h-4 w-4 text-ink-400 inline-block" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden rounded-lg overflow-hidden border border-ink-100 divide-y divide-ink-100 bg-white">
        {profs.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-info-bg active:bg-info-bg transition-colors min-h-touch"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-bg text-navy font-display font-bold text-sm">
                {p.nom.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy truncate">{p.nom}</p>
                <p className="flex items-center gap-1 text-[0.78rem] text-ink-400 mt-0.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{p.email}</span>
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge
                    variant={p.classesIds?.length ? 'navy' : 'neutral'}
                    size="sm"
                    leadingIcon={<Users className="h-3 w-3" />}
                  >
                    {p.classesIds?.length ?? 0} classe
                    {(p.classesIds?.length ?? 0) > 1 ? 's' : ''}
                  </Badge>
                  {(p.matieres ?? []).slice(0, 2).map((m) => (
                    <Badge key={m} variant="neutral" size="sm">
                      {m}
                    </Badge>
                  ))}
                  {(p.matieres ?? []).length > 2 && (
                    <Badge variant="neutral" size="sm">
                      +{(p.matieres ?? []).length - 2}
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

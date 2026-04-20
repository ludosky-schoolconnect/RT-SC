/**
 * RT-SC · Élèves demographics strip.
 *
 * Mirrors the legacy admin "Effectifs + Répartition par âge" UI.
 * - Gender totals (M / F)
 * - Horizontally-scrollable pills for age groups (M/F per age)
 *
 * Pure derivation from the élèves array, no data fetching of its own.
 */

import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { Eleve } from '@/types/models'
import { calculerAge } from '@/lib/benin'
import { Badge } from '@/components/ui/Badge'

interface DemographicsStripProps {
  eleves: Eleve[]
}

interface AgeStats {
  age: number | null
  M: number
  F: number
}

export function DemographicsStrip({ eleves }: DemographicsStripProps) {
  const { total, garcons, filles, ages } = useMemo(() => {
    let total = 0
    let garcons = 0
    let filles = 0
    const map = new Map<string, AgeStats>()

    for (const e of eleves) {
      total++
      if (e.genre === 'M') garcons++
      else filles++

      const a = calculerAge(e.date_naissance)
      const key = a === null ? 'unknown' : String(a)
      const cur = map.get(key) ?? { age: a, M: 0, F: 0 }
      if (e.genre === 'M') cur.M++
      else cur.F++
      map.set(key, cur)
    }

    const ages = Array.from(map.values()).sort((a, b) => {
      if (a.age === null) return 1
      if (b.age === null) return -1
      return a.age - b.age
    })

    return { total, garcons, filles, ages }
  }, [eleves])

  if (total === 0) return null

  return (
    <div className="rounded-lg border-[1.5px] border-ink-100 bg-white p-4">
      {/* Counts */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Badge variant="navy" size="md" leadingIcon={<Users className="h-3.5 w-3.5" />}>
          Total : {total}
        </Badge>
        <Badge variant="info" size="md">♂ Garçons : {garcons}</Badge>
        <Badge variant="serie-a" size="md">♀ Filles : {filles}</Badge>
      </div>

      {/* Age pills */}
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
          Répartition par âge
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ages.map((a) => (
            <div
              key={a.age ?? 'unknown'}
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-ink-50 border border-ink-100 px-3 py-1.5"
            >
              <span className="font-display text-sm font-bold text-navy">
                {a.age === null ? '?' : `${a.age} ans`}
              </span>
              <span className="text-[0.78rem] font-semibold text-navy">
                ♂ {a.M}
              </span>
              <span className="text-[0.78rem] font-semibold text-serie-a">
                ♀ {a.F}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

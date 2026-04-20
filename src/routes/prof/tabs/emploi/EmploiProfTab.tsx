/**
 * RT-SC · Prof → Mon emploi du temps.
 *
 * Read-only view of the prof's week. Filters the shared /seances collection
 * by the prof's UID. Shows class name as subtitle on each card (the prof
 * knows the matière, needs to know WHO they're teaching).
 *
 * "Aujourd'hui" emphasis + "En cours" badge come for free from EmploiGrid.
 */

import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/auth'
import { useAllSeances } from '@/hooks/useSeances'
import { useClasses } from '@/hooks/useClasses'
import { EmploiGrid } from '@/routes/_shared/emploi/EmploiGrid'
import { nomClasse } from '@/lib/benin'

export function EmploiProfTab() {
  const user = useAuthStore((s) => s.user)
  const { data: allSeances = [], isLoading } = useAllSeances()
  const { data: classes = [] } = useClasses()

  const myProfId = user?.uid

  const mine = useMemo(
    () => (myProfId ? allSeances.filter((s) => s.profId === myProfId) : []),
    [allSeances, myProfId]
  )

  const classeById = useMemo(() => {
    const m = new Map<string, (typeof classes)[number]>()
    classes.forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  return (
    <Section>
      <SectionHeader
        kicker="Organisation"
        title="Mon emploi du temps"
        description={
          mine.length === 0
            ? "Aucune séance ne vous est attribuée pour le moment."
            : `${mine.length} séance${mine.length > 1 ? 's' : ''} cette semaine.`
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="Aucun cours programmé"
          description="Dès que la direction vous aura attribué des séances, elles apparaîtront ici."
        />
      ) : (
        <EmploiGrid
          seances={mine}
          subtitleFor={(s) => {
            const c = classeById.get(s.classeId)
            return c ? nomClasse(c) : 'Classe inconnue'
          }}
          emptyDayText={null}
        />
      )}
    </Section>
  )
}

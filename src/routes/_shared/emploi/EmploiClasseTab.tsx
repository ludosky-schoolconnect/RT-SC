/**
 * RT-SC · Emploi du temps for a class (shared between élève + parent).
 *
 * Read-only view filtered to a single classeId. Shows the prof's name as
 * subtitle on each card. Élèves and parents see the same data — this
 * component doesn't know which role is consuming it, it just renders
 * the class's schedule.
 *
 * Falls back to the classe's default salle when a séance doesn't override
 * it (Classe.salle from the classes collection).
 *
 * "Aujourd'hui" emphasis + "En cours" badge come from EmploiGrid.
 */

import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAllSeances } from '@/hooks/useSeances'
import { useProfs } from '@/hooks/useProfs'
import { useClasses } from '@/hooks/useClasses'
import { EmploiGrid } from './EmploiGrid'

interface Props {
  classeId: string
  /** Caption above the title ("Ma semaine", "Semaine de [enfant]", etc). */
  intro?: string
}

export function EmploiClasseTab({ classeId, intro }: Props) {
  const { data: allSeances = [], isLoading } = useAllSeances()
  const { data: profs = [] } = useProfs()
  const { data: classes = [] } = useClasses()

  const seances = useMemo(
    () => allSeances.filter((s) => s.classeId === classeId),
    [allSeances, classeId]
  )

  const profNameById = useMemo(() => {
    const m = new Map<string, string>()
    profs.forEach((p) => m.set(p.id, p.nom))
    return m
  }, [profs])

  const defaultSalle = useMemo(
    () => classes.find((c) => c.id === classeId)?.salle ?? null,
    [classes, classeId]
  )

  // Merge in the default salle when a séance doesn't have its own.
  // Keeps display logic simple; EmploiGrid just reads seance.salle.
  const seancesWithSalleFallback = useMemo(
    () =>
      seances.map((s) =>
        s.salle
          ? s
          : defaultSalle
            ? { ...s, salle: defaultSalle }
            : s
      ),
    [seances, defaultSalle]
  )

  return (
    <Section>
      <SectionHeader
        kicker={intro ?? 'Organisation'}
        title="Emploi du temps"
        description={
          seances.length === 0
            ? "Votre classe n'a pas encore d'emploi du temps."
            : `${seances.length} cours cette semaine.`
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : seances.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="Aucun cours programmé"
          description="L'emploi du temps sera publié par la direction dès qu'il sera prêt."
        />
      ) : (
        <EmploiGrid
          seances={seancesWithSalleFallback}
          subtitleFor={(s) => profNameById.get(s.profId) ?? '—'}
          emptyDayText={null}
        />
      )}
    </Section>
  )
}

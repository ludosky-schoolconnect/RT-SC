/**
 * RT-SC · Vie scolaire tab.
 *
 * Two view modes, switchable via segmented control at the top:
 *
 *   1. SCHOOL-WIDE TRIAGE (admin only, default for admin)
 *      Flat list of every declaration in the school, filterable by
 *      statut + searchable. One-tap Valider/Refuser per row. The fast
 *      path for admin clearing pending declarations across many
 *      classes.
 *
 *   2. PER-CLASS DRILL-DOWN
 *      Class picker + collapsible per-élève list with merged
 *      declared + appel-marked timeline. The contextual path for
 *      "show me everything for THIS class" — used by profs (who only
 *      see classes they teach) and admin (who can pick any class).
 *
 * Profs only get the per-class mode (they don't manage triage; admin
 * does). Admin sees both with school-wide as the default.
 */

import { useEffect, useState } from 'react'
import { CalendarOff, LayoutGrid, ListChecks } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { nomClasse } from '@/lib/benin'
import type { Classe } from '@/types/models'
import { AbsencesClasseView } from './AbsencesClasseView'
import { AbsencesEcoleView } from './AbsencesEcoleView'

type ViewMode = 'school' | 'classe'

interface Props {
  /** Classes the staff member can see. Empty = render the empty state. */
  availableClasses: Classe[]
  /** Optional class id to pre-select in classe mode (e.g. PP's own). */
  defaultClasseId?: string
  /** Admin → true. Enables school-wide triage view + write actions. */
  canManage?: boolean
  /** Custom kicker / subtitle override. */
  kicker?: string
  description?: string
}

export function VieScolaireTab({
  availableClasses,
  defaultClasseId,
  canManage = false,
  kicker = 'Vie scolaire',
  description,
}: Props) {
  // Admin defaults to school-wide; prof has no school view, always classe.
  const [mode, setMode] = useState<ViewMode>(canManage ? 'school' : 'classe')

  const [classeId, setClasseId] = useState<string>(
    defaultClasseId ?? availableClasses[0]?.id ?? ''
  )

  useEffect(() => {
    if (!classeId && availableClasses[0]) {
      setClasseId(availableClasses[0].id)
    }
    if (classeId && !availableClasses.some((c) => c.id === classeId)) {
      setClasseId(availableClasses[0]?.id ?? '')
    }
  }, [classeId, availableClasses])

  const selected = availableClasses.find((c) => c.id === classeId)

  // Description: dynamic based on mode
  const dynamicDesc =
    description ??
    (availableClasses.length === 0
      ? "Aucune classe accessible pour l'instant."
      : mode === 'school'
        ? "Triage école entière. Filtrez par statut, recherchez, validez ou refusez en un clic."
        : selected
          ? `${nomClasse(selected)} — vue détaillée.`
          : 'Choisissez une classe.')

  return (
    <Section>
      <SectionHeader
        kicker={kicker}
        title="Suivi des absences"
        description={dynamicDesc}
      />

      {availableClasses.length === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-10 w-10" />}
          title="Aucune classe accessible"
          description={
            canManage
              ? 'Créez ou affectez des classes pour commencer le suivi.'
              : "La direction doit vous affecter à au moins une classe."
          }
        />
      ) : (
        <>
          {/* Mode switcher — admin only (profs always see per-class) */}
          {canManage && (
            <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1">
              <ModeBtn
                active={mode === 'school'}
                icon={<ListChecks className="h-4 w-4" />}
                label="Triage école"
                onClick={() => setMode('school')}
              />
              <ModeBtn
                active={mode === 'classe'}
                icon={<LayoutGrid className="h-4 w-4" />}
                label="Par classe"
                onClick={() => setMode('classe')}
              />
            </div>
          )}

          {/* School-wide triage */}
          {mode === 'school' && canManage && <AbsencesEcoleView />}

          {/* Per-class drill-down */}
          {mode === 'classe' && (
            <>
              <div className="mb-5 max-w-sm">
                <Select
                  label="Classe affichée"
                  value={classeId}
                  onChange={(e) => setClasseId(e.target.value)}
                >
                  {availableClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomClasse(c)}
                    </option>
                  ))}
                </Select>
              </div>

              {classeId && (
                <AbsencesClasseView classeId={classeId} canManage={canManage} />
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}

// ─── Mode switcher button ─────────────────────────────────────

function ModeBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.78rem] font-semibold transition-all min-h-[2.25rem]',
        active
          ? 'bg-white text-navy shadow-sm ring-1 ring-navy/10'
          : 'text-ink-500 hover:text-navy'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

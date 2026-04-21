/**
 * RT-SC · Admin → Inscriptions tab.
 *
 * Two modes accessible via segmented control:
 *
 *   - Demandes — pending dossiers awaiting approve/refuse
 *   - Rendez-vous — approved dossiers grouped by physical-visit date
 *
 * Guichet d'admission is NOT here — it's on the caissier dashboard
 * exclusively. Separation of duties: admin vets and schedules; caissier
 * collects the payment and finalizes.
 *
 * Mounted inside the admin Plus surface.
 */

import { useMemo, useState } from 'react'
import {
  ClipboardList,
  Inbox,
  CalendarClock,
} from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { usePreInscriptions } from '@/hooks/usePreInscriptions'
import { DemandesView } from './DemandesView'
import { RendezVousView } from './RendezVousView'

type Mode = 'demandes' | 'rendezvous'

export function InscriptionsAdminTab() {
  const { data: list = [], isLoading } = usePreInscriptions()
  const [mode, setMode] = useState<Mode>('demandes')

  const counts = useMemo(() => {
    let demandes = 0
    let rv = 0
    for (const d of list) {
      if (d.statut === 'En attente') demandes++
      else if (d.statut === 'Approuvé') rv++
    }
    return { demandes, rv }
  }, [list])

  return (
    <Section>
      <SectionHeader
        kicker="Admissions"
        title="Pré-inscriptions"
        description={
          mode === 'demandes'
            ? 'Validez ou refusez les nouvelles demandes. L\'approbation attribue automatiquement un rendez-vous physique.'
            : 'Liste des dossiers approuvés en attente de visite physique. Le caissier finalisera l\'inscription le jour du rendez-vous.'
        }
      />

      {/* Mode switcher */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1 flex-wrap">
        <ModeBtn
          active={mode === 'demandes'}
          icon={<Inbox className="h-4 w-4" />}
          label={`Demandes${counts.demandes > 0 ? ` (${counts.demandes})` : ''}`}
          onClick={() => setMode('demandes')}
        />
        <ModeBtn
          active={mode === 'rendezvous'}
          icon={<CalendarClock className="h-4 w-4" />}
          label={`Rendez-vous${counts.rv > 0 ? ` (${counts.rv})` : ''}`}
          onClick={() => setMode('rendezvous')}
        />
      </div>

      {isLoading && list.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {mode === 'demandes' && <DemandesView list={list} />}
          {mode === 'rendezvous' && <RendezVousView list={list} />}
        </>
      )}
    </Section>
  )
}

// ─── Mode button (reused from VieScolaireTab pattern) ─────────

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

// Kept exported in case other surfaces want to embed this tab info
export { ClipboardList }

/**
 * RT-SC · Admin → Profs tab.
 *
 * Layout:
 *   1. Section header
 *   2. Stat strip (total / actifs / en attente)
 *   3. Passkey panel (the school-wide signup code)
 *   4. Pending requests (only shown when count > 0)
 *   5. Search + active profs list
 *   6. Modals: assign classes + prof detail
 */

import { useMemo, useState } from 'react'
import { Hourglass, BookOpen, ShieldCheck, AlertCircle } from 'lucide-react'

import { useProfs } from '@/hooks/useProfs'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { cn } from '@/lib/cn'
import type { Professeur } from '@/types/models'

import { PasskeyProfPanel } from './PasskeyProfPanel'
import { PendingProfsList } from './PendingProfsList'
import { ActiveProfsList } from './ActiveProfsList'
import { ModalAssignClasses } from './ModalAssignClasses'
import { ModalProfDetail } from './ModalProfDetail'

export function ProfsTab() {
  const { data: profs, isLoading, error } = useProfs()

  const [search, setSearch] = useState('')
  const [detailFor, setDetailFor] = useState<Professeur | null>(null)
  const [assignFor, setAssignFor] = useState<Professeur | null>(null)

  // Split profs into pending + active (excludes admins from the active list)
  const { pending, active, totalActive } = useMemo(() => {
    const pending: Professeur[] = []
    const active: Professeur[] = []
    let totalActive = 0
    for (const p of profs ?? []) {
      // Admins don't appear in this management list
      if (p.role === 'admin') continue
      if (p.statut === 'en_attente') {
        pending.push(p)
      } else {
        active.push(p)
        totalActive++
      }
    }
    return { pending, active, totalActive }
  }, [profs])

  // Apply search filter to active list (pending always shows in full)
  const activeFiltered = useMemo(() => {
    if (!search.trim()) return active
    const term = search.trim().toLowerCase()
    return active.filter(
      (p) =>
        p.nom.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        (p.matieres ?? []).some((m) => m.toLowerCase().includes(term))
    )
  }, [active, search])

  return (
    <>
      <Section>
        <SectionHeader
          kicker="Équipe pédagogique"
          title="Gestion des professeurs"
          description="Approuvez les nouvelles demandes, gérez le code d'accès et assignez les classes."
        />

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatPill
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Total"
            value={(pending.length + totalActive)}
            tone="navy"
          />
          <StatPill
            icon={<BookOpen className="h-4 w-4" />}
            label="Actifs"
            value={totalActive}
            tone="success"
          />
          <StatPill
            icon={<Hourglass className="h-4 w-4" />}
            label="En attente"
            value={pending.length}
            tone="warning"
          />
        </div>

        {/* Loading / error */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" label="Chargement des professeurs…" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-danger" />}
            title="Erreur de chargement"
            description="Impossible de charger la liste des professeurs."
          />
        ) : (
          <div className="space-y-4">
            {/* Passkey panel */}
            <PasskeyProfPanel />

            {/* Pending requests */}
            <PendingProfsList pending={pending} />

            {/* Search */}
            {active.length > 0 && (
              <SearchInput
                onSearch={setSearch}
                placeholder="Rechercher par nom, email ou matière…"
              />
            )}

            {/* Active profs */}
            {search.trim() && activeFiltered.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description={`Aucun professeur ne correspond à « ${search} ».`}
              />
            ) : (
              <ActiveProfsList
                profs={activeFiltered}
                onSelect={(p) => setDetailFor(p)}
              />
            )}
          </div>
        )}
      </Section>

      {/* Modals */}
      <ModalProfDetail
        prof={detailFor}
        onAssignClasses={(p) => setAssignFor(p)}
        onClose={() => setDetailFor(null)}
      />
      <ModalAssignClasses prof={assignFor} onClose={() => setAssignFor(null)} />
    </>
  )
}

// ─── Local stat pill ──────────────────────────────────────────

interface StatPillProps {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'navy' | 'success' | 'warning'
}

const TONE_CLASSES: Record<StatPillProps['tone'], string> = {
  navy: 'bg-info-bg border-navy/15 text-navy',
  success: 'bg-success-bg border-success/20 text-success',
  warning: 'bg-warning-bg border-warning/20 text-warning',
}

function StatPill({ icon, label, value, tone }: StatPillProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 flex items-center gap-3',
        TONE_CLASSES[tone]
      )}
    >
      <div className="shrink-0 opacity-90" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-none tabular-nums">
          {value}
        </p>
        <p className="text-[0.7rem] uppercase tracking-wider font-bold opacity-75 mt-1">
          {label}
        </p>
      </div>
    </div>
  )
}

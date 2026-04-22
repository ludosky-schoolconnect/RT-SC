/**
 * RT-SC · Admin Civisme tab (v3 router).
 *
 * Hosts the sub-nav and renders the active sub-section. Phase 2
 * adds Quêtes alongside Élèves and Récompenses. Phase 3 will add
 * Réclamations + Incidents.
 */

import { useState } from 'react'
import { CivismeSubNav, type CivismeSubNavItem } from './CivismeSubNav'
import { ElevesSection } from './ElevesSection'
import { RecompensesSection } from './RecompensesSection'
import { QuetesAdminSection } from './QuetesAdminSection'
import { ReclamationsSection } from './ReclamationsSection'
import { MaintenanceCard } from './MaintenanceCard'
import { usePendingClaimsCount } from '@/hooks/useQuetes'
import { usePendingReclamationsCount } from '@/hooks/useReclamations'

type SectionId = 'eleves' | 'quetes' | 'recompenses' | 'reclamations'

export function CivismeAdminTab() {
  const [active, setActive] = useState<SectionId>('eleves')
  const { data: pendingClaimsCount = 0 } = usePendingClaimsCount()
  const { data: pendingReclamationsCount = 0 } = usePendingReclamationsCount()

  const sections: CivismeSubNavItem<SectionId>[] = [
    { id: 'eleves', label: 'Élèves' },
    {
      id: 'quetes',
      label: 'Quêtes',
      badge: pendingClaimsCount,
      badgeTone: pendingClaimsCount > 0 ? 'attention' : 'neutral',
    },
    { id: 'recompenses', label: 'Récompenses' },
    {
      id: 'reclamations',
      label: 'Réclamations',
      badge: pendingReclamationsCount,
      badgeTone: pendingReclamationsCount > 0 ? 'attention' : 'neutral',
    },
  ]

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
      <CivismeSubNav<SectionId>
        items={sections}
        active={active}
        onChange={setActive}
      />

      {active === 'eleves' && <ElevesSection />}
      {active === 'quetes' && <QuetesAdminSection />}
      {active === 'recompenses' && <RecompensesSection />}
      {active === 'reclamations' && <ReclamationsSection />}

      <MaintenanceCard />
    </div>
  )
}

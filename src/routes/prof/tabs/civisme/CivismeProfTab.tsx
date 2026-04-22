/**
 * RT-SC · Prof Civisme tab — root.
 *
 * Thin wrapper that splits the prof's Civisme module into two
 * sub-sections, mirroring the admin pattern:
 *
 *   1. Quêtes — claim on behalf of students (existing feature)
 *   2. Incidents — signaler for students in prof's classes
 *
 * Sub-nav sits at the top; content below switches based on the
 * active segment. No badges on the prof side for now — no "pending"
 * signal applies to a prof (they don't validate claims or fulfill
 * reclamations).
 */

import { useState } from 'react'
import {
  CivismeSubNav,
  type CivismeSubNavItem,
} from '@/routes/admin/tabs/civisme/CivismeSubNav'
import { QuetesProfTab } from './QuetesProfTab'
import { IncidentsProfSection } from './IncidentsProfSection'

type SectionId = 'quetes' | 'incidents'

export function CivismeProfTab() {
  const [active, setActive] = useState<SectionId>('quetes')

  const sections: CivismeSubNavItem<SectionId>[] = [
    { id: 'quetes', label: 'Quêtes' },
    { id: 'incidents', label: 'Incidents' },
  ]

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
      <CivismeSubNav<SectionId>
        items={sections}
        active={active}
        onChange={setActive}
      />

      {active === 'quetes' && <QuetesProfTab />}
      {active === 'incidents' && <IncidentsProfSection />}
    </div>
  )
}

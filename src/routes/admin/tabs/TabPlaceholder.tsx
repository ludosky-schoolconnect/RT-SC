/**
 * RT-SC · TabPlaceholder
 * Shown for admin tabs not yet implemented. Friendly + indicates which phase
 * delivers each tab.
 */

import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

const PHASE_FOR: Record<string, string> = {
  eleves: 'Phase 3b',
  profs: 'Phase 3c',
  annee: 'Phase 3d',
  emploi: 'Phase 5',
  absences: 'Phase 5',
  'notes-coeffs': 'Phase 4',
  finances: 'Phase 7',
  caisse: 'Phase 7',
  annales: 'Phase 6',
  vigilance: 'Phase 11',
  palmares: 'Phase 11',
  inscriptions: 'Phase 9',
  annonces: 'Phase 6',
  archive: 'Phase 3d',
  plus: 'une prochaine phase',
}

export function TabPlaceholder({ tabId }: { tabId: string }) {
  const phase = PHASE_FOR[tabId] ?? 'une prochaine phase'
  return (
    <EmptyState
      icon={<Construction className="h-10 w-10" />}
      title="Module à venir"
      description={`Cet onglet sera implémenté dans ${phase}. La structure de l'application est en place ; la fonctionnalité arrive bientôt.`}
    />
  )
}

/**
 * RT-SC · Admin → Abonnement tab.
 *
 * Dedicated top-level admin tab for SchoolConnect subscription
 * management. Previously lived in Année tab (Phase 6f turn 1),
 * promoted to its own tab for better discoverability.
 *
 * Contents (for now just the status card; this tab is the natural
 * home for future additions like payment history, receipt downloads,
 * change-of-ownership transfer, etc.)
 */

import { Section, SectionHeader } from '@/components/layout/Section'
import { AbonnementCard } from '../annee/AbonnementCard'

export function AbonnementTab() {
  return (
    <Section>
      <SectionHeader
        kicker="SchoolConnect"
        title="Mon abonnement"
        description="État de votre abonnement SchoolConnect, prochaine échéance et renouvellement."
      />

      <AbonnementCard />
    </Section>
  )
}

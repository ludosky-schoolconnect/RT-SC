/**
 * RT-SC · Prof → Mon profil tab (Session 5).
 *
 * Dedicated tab for prof self-management. Currently houses ONE thing:
 * the signature capture surface. Pulled out of the legacy
 * MesClassesTab embed (where it sat in a collapsible card above the
 * class grid) for two reasons:
 *
 *   1. Conceptual: signature management is "about me", not "about my
 *      classes". A separate tab matches the mental model and stops
 *      confusing the daily-use class grid with rare setup tasks.
 *
 *   2. Reliability: the previous embed wrapped <SignatureDrawCanvas>
 *      in a Framer height: 0 → auto AnimatePresence collapsible. The
 *      canvas was mounting with a transient near-zero height during
 *      the animation, which broke the ResizeObserver-driven buffer
 *      sizing inside the canvas (even after the Session 4a rewrite).
 *      Hosting the canvas in a tab that's either rendered at full
 *      size or unmounted entirely sidesteps the whole class of bugs.
 *
 * Future expansions (out of scope for Session 5):
 *   - Personal display name + email change
 *   - Per-prof preferences (default class, default matière, etc.)
 *   - Activity log for the prof's own writes
 */

import { Section, SectionHeader } from '@/components/layout/Section'
import { MonProfilSection } from './MonProfilSection'

export function MonProfilTab() {
  return (
    <Section>
      <SectionHeader
        kicker="Personnel"
        title="Mon profil"
        description="Gérez votre signature personnelle utilisée sur les bulletins de vos classes principales."
      />
      <MonProfilSection />
    </Section>
  )
}

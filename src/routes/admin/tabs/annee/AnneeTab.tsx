/**
 * RT-SC · Admin → Année tab.
 *
 * Three subsections (visually grouped):
 *   1. Configuration générale — identity, active year, bulletin config
 *   2. Référentiel pédagogique — matières + coefficients (NEW Phase 4a)
 *   3. Zone dangereuse — rollover ops
 */

import { Section, SectionHeader } from '@/components/layout/Section'
import { SchoolIdentityCard } from './SchoolIdentityCard'
import { ActiveYearCard } from './ActiveYearCard'
import { BulletinConfigCard } from './BulletinConfigCard'
import { MatieresEditorCard } from './MatieresEditorCard'
import { CoefficientsEditorCard } from './CoefficientsEditorCard'
import { DangerZoneCard } from './DangerZoneCard'

export function AnneeTab() {
  return (
    <Section>
      <SectionHeader
        kicker="Configuration"
        title="Année scolaire & paramètres"
        description="Identité de l'établissement, année active, référentiel pédagogique et opérations de fin d'année."
      />

      <div className="space-y-6">
        {/* 1. Configuration générale */}
        <div className="space-y-4">
          <SchoolIdentityCard />
          <ActiveYearCard />
          <BulletinConfigCard />
        </div>

        {/* 2. Référentiel pédagogique */}
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
            Référentiel pédagogique
          </p>
          <div className="space-y-4">
            <MatieresEditorCard />
            <CoefficientsEditorCard />
          </div>
        </div>

        {/* 3. Zone dangereuse */}
        <DangerZoneCard />
      </div>
    </Section>
  )
}

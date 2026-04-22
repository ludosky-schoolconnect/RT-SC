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
import { SignatureDirectriceCard } from './SignatureDirectriceCard'
import { MatieresEditorCard } from './MatieresEditorCard'
import { CoefficientsEditorCard } from './CoefficientsEditorCard'
import { DangerZoneCard } from './DangerZoneCard'
import { YearArchiveSection } from './archive/YearArchiveSection'
import { SettingsInscriptionCard } from '../inscriptions/SettingsInscriptionCard'
import { PreinscriptionToggleCard } from '../inscriptions/PreinscriptionToggleCard'
import { FinancesConfigCard } from '../finances/FinancesConfigCard'

export function AnneeTab() {
  return (
    <Section>
      <SectionHeader
        kicker="Configuration"
        title="Année scolaire & paramètres"
        description="Identité de l'établissement, année active, frais de scolarité, référentiel pédagogique et opérations de fin d'année."
      />

      <div className="space-y-6">
        {/* 1. Configuration générale */}
        <div className="space-y-4">
          <SchoolIdentityCard />
          <ActiveYearCard />
          <BulletinConfigCard />
          <SignatureDirectriceCard />
        </div>

        {/* 2. Finances — scolarité + gratuité. Admin-only; the caissier
            applies these amounts via the terminal de caisse but doesn't
            set them. */}
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
            Frais de scolarité
          </p>
          <FinancesConfigCard />
        </div>

        {/* 3. Référentiel pédagogique */}
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
            Référentiel pédagogique
          </p>
          <div className="space-y-4">
            <MatieresEditorCard />
            <CoefficientsEditorCard />
          </div>
        </div>

        {/* 4. Inscriptions — required documents + RV slot config */}
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
            Pré-inscriptions
          </p>
          <div className="space-y-4">
            <PreinscriptionToggleCard />
            <SettingsInscriptionCard />
          </div>
        </div>

        {/* 5. Zone dangereuse */}
        <DangerZoneCard />

        {/* 6. Archives annuelles — browse past years (read-only) */}
        <YearArchiveSection />
      </div>
    </Section>
  )
}

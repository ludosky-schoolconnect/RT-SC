/**
 * RT-SC · Eleve Civisme tab (v3 — Phase 2).
 *
 * Sections:
 *   1. Hero (solde + tier badge + distance to next tier)
 *   2. Quêtes ouvertes + my claims history (Phase 2)
 *   3. "How it works" explainer (Récompenses still tagged "Bientôt"
 *      until Phase 3)
 */

import { useMemo } from 'react'
import {
  Award,
  Crown,
  Sparkles,
} from 'lucide-react'
import { useEleves } from '@/hooks/useEleves'
import {
  civismeTier,
  TIER_METADATA,
  distanceToNextTier,
  type CivismeTier,
} from '@/hooks/useCivisme'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuetesEleveSection } from './QuetesEleveSection'
import { RecompensesEleveSection } from './RecompensesEleveSection'
import { HistoriqueSection } from '@/routes/_shared/civisme/HistoriqueSection'
import { History } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  /** Firebase anon UID for the student session — required to write claims */
  studentUid: string
}

export function CivismeEleveTab({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  studentUid,
}: Props) {
  const { data: eleves = [], isLoading } = useEleves(classeId)

  const eleve = useMemo(
    () => eleves.find((e) => e.id === eleveId),
    [eleves, eleveId]
  )

  const points = eleve?.civismePoints ?? 0
  const tier = civismeTier(points)
  const distance = distanceToNextTier(points)

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 max-w-2xl mx-auto pt-4 pb-12 space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 max-w-2xl mx-auto pt-4 pb-12 space-y-5">
      <Section>
        <SectionHeader
          title="Civisme & Engagement"
          description="Votre solde de points évolue selon vos actions et votre comportement."
        />

        <HeroCard tier={tier} points={points} distance={distance} />

        <div className="mt-6">
          <QuetesEleveSection
            classeId={classeId}
            classeNom={classeNom}
            eleveId={eleveId}
            eleveName={eleveName}
            studentUid={studentUid}
          />
        </div>

        <div className="mt-6">
          <RecompensesEleveSection
            classeId={classeId}
            classeNom={classeNom}
            eleveId={eleveId}
            eleveName={eleveName}
            studentUid={studentUid}
            currentBalance={points}
          />
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex h-6 w-6 mt-0.5 items-center justify-center rounded-md bg-navy/10 text-navy ring-1 ring-navy/15">
              <History className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
                Historique
              </p>
              <p className="text-[0.72rem] text-ink-500 mt-0.5 leading-snug">
                Vos dernières activités civisme
              </p>
            </div>
          </div>
          <HistoriqueSection
            classeId={classeId}
            eleveId={eleveId}
            maxRows={10}
          />
        </div>
      </Section>
    </div>
  )
}

// ─── Hero card ──────────────────────────────────────────────

function HeroCard({
  tier,
  points,
  distance,
}: {
  tier: CivismeTier
  points: number
  distance: ReturnType<typeof distanceToNextTier>
}) {
  const meta = TIER_METADATA[tier]

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden relative',
        'bg-gradient-to-br from-navy to-navy-dark',
        'text-white px-5 py-7'
      )}
    >
      <div
        className="absolute right-[-20px] top-[-20px] text-white/[0.06] pointer-events-none"
        aria-hidden
      >
        {tier === 'exemplary' ? (
          <Crown className="h-40 w-40" strokeWidth={1.2} />
        ) : (
          <Award className="h-40 w-40" strokeWidth={1.2} />
        )}
      </div>

      <div className="text-center">
        <TierBadge tier={tier} />

        <div className="mt-3 flex items-baseline justify-center gap-1">
          <span
            className={cn(
              'font-display font-black leading-none',
              points >= 100 ? 'text-[3.5rem]' : 'text-[3.75rem]',
              tier === 'exemplary' && 'text-gold-light',
              tier === 'committed' && 'text-emerald-300',
              tier === 'engaged' && 'text-white',
              tier === 'neutral' && 'text-white/85',
              tier === 'critical' && 'text-[#fca5a5]'
            )}
          >
            {points}
          </span>
          <span className="font-display text-[1.5rem] font-bold text-white/40">
            {Math.abs(points) === 1 ? 'pt' : 'pts'}
          </span>
        </div>

        {distance && (
          <NextTierProgress
            currentPoints={points}
            remaining={distance.remaining}
            nextLabel={distance.nextLabel}
            currentTierThreshold={meta.threshold}
            nextTierThreshold={meta.nextThreshold ?? 0}
          />
        )}

        {tier === 'exemplary' && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-light/15 ring-1 ring-gold/40 px-3 py-1.5 text-[0.78rem] font-bold text-gold-light">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Tier maximum atteint
          </div>
        )}

        <p className="mt-4 text-[0.9rem] text-white/75 max-w-sm mx-auto leading-relaxed">
          {meta.blurb}
        </p>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: CivismeTier }) {
  const meta = TIER_METADATA[tier]
  const dot: Record<CivismeTier, string> = {
    critical: 'bg-[#fca5a5]',
    neutral: 'bg-white/40',
    engaged: 'bg-sky-300',
    committed: 'bg-emerald-300',
    exemplary: 'bg-gold-light',
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.18em] font-bold text-white/85 ring-1 ring-white/15">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tier])} aria-hidden />
      {meta.label}
    </span>
  )
}

function NextTierProgress({
  currentPoints,
  remaining,
  nextLabel,
  currentTierThreshold,
  nextTierThreshold,
}: {
  currentPoints: number
  remaining: number
  nextLabel: string
  currentTierThreshold: number
  nextTierThreshold: number
}) {
  const span = nextTierThreshold - currentTierThreshold
  const consumed = currentPoints - currentTierThreshold
  const pct =
    span > 0 ? Math.max(0, Math.min(100, Math.round((consumed / span) * 100))) : 0

  return (
    <div className="mt-4 mx-auto max-w-[280px]">
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-gold-light transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[0.72rem] font-semibold text-white/65">
        Plus que {remaining} pt{remaining > 1 ? 's' : ''} pour devenir{' '}
        <span className="text-white/90">{nextLabel}</span>
      </p>
    </div>
  )
}

// ─── End of file ──────────────────────────────────────────────

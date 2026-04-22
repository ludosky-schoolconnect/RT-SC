/**
 * RT-SC · Parent Accueil — Civisme widget.
 *
 * Read-only card showing the child's civisme solde + tier + last
 * 3 history entries. Tappable → navigates to the child's full
 * civisme tab (TODO: parent doesn't yet have a civisme tab, so for
 * now we just show info without a target route — it'll be non-
 * interactive until we add the parent civisme tab).
 *
 * Data sources:
 *   - useEleves(classeId) → find the eleve → civismePoints
 *   - useCivismeHistory(classeId, eleveId, 3) → last 3 entries
 */

import { Award, Crown, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useEleves } from '@/hooks/useEleves'
import {
  civismeTier,
  TIER_METADATA,
  formatCivismePoints,
  type CivismeTier,
} from '@/hooks/useCivisme'
import { HistoriqueSection } from '@/routes/_shared/civisme/HistoriqueSection'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'

interface Props {
  classeId: string
  eleveId: string
  /** Optional tap handler; omit to render non-interactive */
  onOpen?: () => void
}

export function CivismeParentWidget({ classeId, eleveId, onOpen }: Props) {
  const { data: eleves = [], isLoading } = useEleves(classeId)

  const eleve = useMemo(
    () => eleves.find((e) => e.id === eleveId),
    [eleves, eleveId]
  )
  const points = eleve?.civismePoints ?? 0
  const tier = civismeTier(points)

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />
  }
  if (!eleve) {
    return null
  }

  const Wrapper: React.ElementType = onOpen ? 'button' : 'div'
  const wrapperProps = onOpen
    ? {
        type: 'button' as const,
        onClick: onOpen,
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'block w-full text-left bg-white rounded-xl border-[1.5px] border-ink-100 overflow-hidden',
        onOpen && 'hover:border-navy/30 transition-colors'
      )}
    >
      {/* Header row: icon, label, score, tier pill */}
      <div className="px-4 py-3 flex items-center gap-3 bg-gradient-to-br from-navy/[0.04] to-gold/[0.03]">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1',
            tierIconTone(tier)
          )}
        >
          {tier === 'exemplary' ? (
            <Crown className="h-5 w-5" aria-hidden />
          ) : (
            <Award className="h-5 w-5" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
            Civisme & Engagement
          </p>
          <p className="text-[0.72rem] text-ink-500 mt-0.5">
            Solde :{' '}
            <span className="font-display font-bold text-navy">
              {formatCivismePoints(points)}
            </span>{' '}
            · {TIER_METADATA[tier].label}
          </p>
        </div>
        {onOpen && (
          <ChevronRight
            className="h-4 w-4 text-ink-400 shrink-0"
            aria-hidden
          />
        )}
      </div>

      {/* History preview — compact */}
      <div className="px-4 pt-2 pb-3">
        <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-400 mb-2">
          Dernières activités
        </p>
        <HistoriqueSection
          classeId={classeId}
          eleveId={eleveId}
          maxRows={3}
          compact
        />
      </div>
    </Wrapper>
  )
}

function tierIconTone(tier: CivismeTier): string {
  switch (tier) {
    case 'exemplary':
      return 'bg-gold-pale text-gold-dark ring-gold/30'
    case 'committed':
      return 'bg-success-bg text-success-dark ring-success/30'
    case 'engaged':
      return 'bg-navy/10 text-navy ring-navy/20'
    case 'neutral':
      return 'bg-ink-100 text-ink-500 ring-ink-200'
    case 'critical':
      return 'bg-danger-bg text-danger ring-danger/30'
  }
}

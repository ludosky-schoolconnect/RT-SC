/**
 * RT-SC · HeuresColleWidget — live colle summary for élève/parent Accueil.
 *
 * Reads `useColles` for the (classeId × eleveId) pair and groups totals
 * by period. Each semester/trimester is independent (matches the engine
 * — `totalHeuresForPeriode` sums only colles tagged with that period).
 *
 * Layout: header row with title + total-for-active-period (if any),
 * then a small per-period breakdown. Shows an empty/clean state when
 * the élève has no colles.
 */

import { motion } from 'framer-motion'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { useColles, totalHeuresForPeriode } from '@/hooks/useColles'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { listPeriodes } from '@/lib/bulletin'
import { cn } from '@/lib/cn'
import type { Periode } from '@/types/models'

interface HeuresColleWidgetProps {
  classeId: string
  eleveId: string
  /** When true, copy is parent-framed (neutral, factual). Defaults to false (élève voice). */
  parentMode?: boolean
}

export function HeuresColleWidget({ classeId, eleveId, parentMode = false }: HeuresColleWidgetProps) {
  const { data: colles, isLoading } = useColles(classeId, eleveId)
  const { data: bulletinConfig } = useBulletinConfig()

  // Period list — derived from active config so it adapts to école choice
  const periodes = bulletinConfig
    ? listPeriodes(bulletinConfig.typePeriode, bulletinConfig.nbPeriodes)
    : []

  // Per-period totals
  const totals = periodes.map((p) => ({
    periode: p,
    heures: colles ? totalHeuresForPeriode(colles, p as Periode) : 0,
  }))
  const grandTotal = totals.reduce((sum, t) => sum + t.heures, 0)

  // Loading skeleton
  if (isLoading || !bulletinConfig) {
    return (
      <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-ink-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 bg-ink-100 rounded" />
            <div className="h-2 w-48 bg-ink-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  // Clean state — no colles ever
  if (grandTotal === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-bg text-success ring-1 ring-success/25">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
              Heures de colle
            </p>
            <p className="text-[0.75rem] text-ink-500 mt-0.5">
              {parentMode
                ? "Aucune colle enregistrée pour votre enfant cette année."
                : 'Aucune colle cette année. Continuez ainsi !'}
            </p>
          </div>
          <p className="font-display tabular-nums text-xl font-bold text-success leading-none shrink-0">
            0<span className="text-[0.7rem] font-normal ml-0.5">h</span>
          </p>
        </div>
      </motion.div>
    )
  }

  // Has colles — show per-period breakdown
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-ink-100 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-bg text-danger ring-1 ring-danger/25">
          <AlertCircle className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
            Heures de colle
          </p>
          <p className="text-[0.75rem] text-ink-500 mt-0.5">
            Suivi par période · cumul {grandTotal}h cette année
          </p>
        </div>
      </div>

      {/* Per-period breakdown */}
      <div className="divide-y divide-ink-100">
        {totals.map((t) => (
          <PeriodRow key={t.periode} periode={t.periode} heures={t.heures} />
        ))}
      </div>
    </motion.div>
  )
}

function PeriodRow({ periode, heures }: { periode: string; heures: number }) {
  const hasColles = heures > 0
  // Each 2h removes 1 point from conduite for the period
  const ptsLost = Math.floor(heures / 2)
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <p className="text-[0.8125rem] text-ink-700 font-medium">{periode}</p>
      <div className="flex items-baseline gap-2 shrink-0">
        {hasColles && ptsLost > 0 && (
          <span className="text-[0.65rem] text-warning font-semibold uppercase tracking-wider">
            −{ptsLost} pt{ptsLost > 1 ? 's' : ''}
          </span>
        )}
        <span
          className={cn(
            'font-mono tabular-nums font-bold text-[1.05rem]',
            hasColles ? 'text-danger' : 'text-ink-300'
          )}
        >
          {hasColles ? heures : '—'}
          {hasColles && (
            <span className="text-[0.7rem] font-normal text-ink-400 ml-0.5">h</span>
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * RT-SC · Per-matière baromètre card.
 *
 * Shown above the NotesGrid when the matière is fully closed for the
 * current period. Tells the prof at a glance how the class did.
 *
 * Pure render — gets the BarometreStats from the parent. Excludes
 * abandonné élèves so they don't drag the average down.
 *
 * Visual: a horizontal "thermometer" bar (0 → 20) with the moyenne
 * marker, plus three stat tiles (taux de réussite, meilleur, plus bas)
 * and the verdict label color-coded.
 */

import { motion } from 'framer-motion'
import {
  TrendingDown,
  TrendingUp,
  Activity,
  Target,
} from 'lucide-react'
import type { BarometreStats } from '@/lib/bulletin'
import { cn } from '@/lib/cn'

interface MatiereBarometreProps {
  stats: BarometreStats
  matiere: string
  periode: string
  /** Élèves currently marked abandonné for this matière (excluded from stats) */
  abandonneCount?: number
}

export function MatiereBarometre({
  stats,
  matiere,
  periode,
  abandonneCount = 0,
}: MatiereBarometreProps) {
  const labelClasses = {
    Excellent: 'bg-success-bg text-success border-success/30',
    Passable: 'bg-warning-bg text-warning border-warning/30',
    Insuffisant: 'bg-danger-bg text-danger border-danger/30',
  } as const

  // Marker position on the 0-20 scale, clamped
  const markerPct = Math.max(0, Math.min(100, (stats.moyenneClasse / 20) * 100))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-ink-100 bg-ink-50/40 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-4 w-4 text-navy shrink-0" aria-hidden />
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
            Baromètre · {matiere} · {periode}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold border',
            labelClasses[stats.label]
          )}
        >
          {stats.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {/* Big moyenne + thermometer */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400">
                Moyenne de la classe
              </p>
              <p className="font-display text-3xl font-bold text-navy tabular-nums leading-none mt-1">
                {stats.moyenneClasse.toFixed(2)}
                <span className="text-base text-ink-400 font-normal"> / 20</span>
              </p>
            </div>
            <p className="text-[0.78rem] text-ink-400">
              {stats.totalNotes} note{stats.totalNotes > 1 ? 's' : ''} comptabilisée
              {stats.totalNotes > 1 ? 's' : ''}
              {abandonneCount > 0 && (
                <>
                  <br />
                  <span className="italic">
                    {abandonneCount} absent{abandonneCount > 1 ? 's' : ''} exclu
                    {abandonneCount > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Thermometer */}
          <div className="relative h-3 rounded-full bg-gradient-to-r from-danger/30 via-warning/30 to-success/30 overflow-hidden">
            {/* 10/20 reference line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-ink-400/40"
              style={{ left: '50%' }}
              aria-hidden
            />
            {/* 14/20 reference line (Excellent threshold) */}
            <div
              className="absolute top-0 bottom-0 w-px bg-ink-400/40"
              style={{ left: '70%' }}
              aria-hidden
            />
            {/* The marker */}
            <motion.div
              initial={{ left: '0%' }}
              animate={{ left: `${markerPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            >
              <div
                className="h-5 w-5 rounded-full border-2 border-white shadow-md"
                style={{ backgroundColor: stats.couleur }}
              />
            </motion.div>
          </div>
          <div className="flex justify-between text-[0.65rem] text-ink-400 mt-1 font-mono tabular-nums">
            <span>0</span>
            <span>10</span>
            <span>14</span>
            <span>20</span>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            icon={<Target className="h-3 w-3" />}
            label="Taux de réussite"
            value={`${stats.tauxReussite}%`}
            sub={`${stats.nbDessus10}/${stats.totalNotes} ≥ 10`}
            color={
              stats.tauxReussite >= 70
                ? 'success'
                : stats.tauxReussite >= 40
                  ? 'warning'
                  : 'danger'
            }
          />
          <StatTile
            icon={<TrendingUp className="h-3 w-3" />}
            label="Meilleur"
            value={stats.meilleur.moy.toFixed(2)}
            sub={truncate(stats.meilleur.nom, 14)}
            color="success"
          />
          <StatTile
            icon={<TrendingDown className="h-3 w-3" />}
            label="Plus bas"
            value={stats.plusBas.moy.toFixed(2)}
            sub={truncate(stats.plusBas.nom, 14)}
            color={stats.plusBas.moy >= 10 ? 'warning' : 'danger'}
          />
        </div>
      </div>
    </motion.div>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: 'success' | 'warning' | 'danger'
}) {
  const C: Record<typeof color, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }
  return (
    <div className="rounded-md border border-ink-100 bg-white p-2 text-center">
      <div
        className={cn(
          'inline-flex items-center justify-center gap-1 text-[0.6rem] font-bold uppercase tracking-wider',
          C[color]
        )}
      >
        {icon} {label}
      </div>
      <p className="font-display text-base font-bold text-navy tabular-nums mt-0.5 leading-none">
        {value}
      </p>
      <p className="text-[0.65rem] text-ink-400 mt-0.5 truncate">{sub}</p>
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

// Note: the imported `Award` icon was kept available for future use in the
// "Excellent" label, but isn't currently rendered. Drop if lint flags.

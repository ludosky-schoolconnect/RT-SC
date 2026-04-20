/**
 * RT-SC · Accueil primitives.
 *
 * Shared building blocks used by BOTH the élève AccueilTab and the
 * parent ParentAccueilTab. Keeps the visual language consistent while
 * allowing each tab to compose a context-appropriate layout.
 *
 * Three exports:
 *   - FeaturedBulletinCard — the big navy/gold bulletin hero
 *   - FirstBulletinPlaceholder — shown when no bulletin exists yet
 *   - PreviewWidget — "Bientôt" placeholder for upcoming modules
 */

import { motion } from 'framer-motion'
import { Award, ChevronRight, FileText, Sparkles, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BulletinSummary } from '@/hooks/useEleveBulletinList'
import { cn } from '@/lib/cn'

// ─── Featured bulletin card ────────────────────────────────

export function FeaturedBulletinCard({
  summary,
  mode,
  onOpen,
}: {
  summary: BulletinSummary
  mode: 'periode' | 'annuelle'
  onOpen: () => void
}) {
  const passing = summary.moyenneGenerale >= 10
  const isAnnual = mode === 'annuelle'

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={cn(
        'w-full text-left rounded-2xl overflow-hidden group relative',
        'shadow-[0_12px_28px_-8px_rgba(11,37,69,0.18),0_2px_6px_-2px_rgba(11,37,69,0.08)]',
        'hover:shadow-[0_18px_38px_-10px_rgba(11,37,69,0.24),0_4px_10px_-4px_rgba(11,37,69,0.12)]',
        'transition-shadow duration-300 ring-1',
        isAnnual ? 'ring-gold/40' : 'ring-navy/15'
      )}
    >
      <div
        className={cn(
          'absolute inset-0 -z-10',
          isAnnual
            ? 'bg-gradient-to-br from-gold/12 via-white to-gold-pale/60'
            : 'bg-gradient-to-br from-white via-white to-info-bg/40'
        )}
      />
      <div
        className={cn(
          'h-1',
          isAnnual
            ? 'bg-gradient-to-r from-gold/60 via-gold to-gold/60'
            : 'bg-gradient-to-r from-navy/40 via-navy to-navy/40'
        )}
      />

      <div className="px-5 sm:px-6 py-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              isAnnual
                ? 'bg-gold/15 text-gold-dark ring-1 ring-gold/30'
                : 'bg-navy/8 text-navy ring-1 ring-navy/15'
            )}
          >
            {isAnnual ? <Award className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'text-[0.65rem] uppercase tracking-[0.2em] font-bold',
                isAnnual ? 'text-gold-dark' : 'text-navy/70'
              )}
            >
              {isAnnual ? 'Bulletin annuel' : 'Dernier bulletin'}
            </p>
            {isAnnual && <Sparkles className="h-3 w-3 text-gold" aria-hidden />}
          </div>
        </div>

        <p className="font-display text-[1.65rem] sm:text-3xl text-navy font-bold leading-[1.1] mb-3">
          {isAnnual ? (summary.statutAnnuel ?? 'En attente') : summary.periode}
        </p>

        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className={cn(
              'font-display tabular-nums font-bold leading-none',
              'text-[2.5rem] sm:text-[2.75rem]',
              passing ? 'text-success' : 'text-danger'
            )}
          >
            {summary.moyenneGenerale.toFixed(2)}
          </span>
          <span className="text-[0.875rem] font-semibold text-ink-500">/ 20</span>
          {summary.rang && (
            <span className="text-[0.78rem] text-ink-600 font-medium ml-auto">
              · Rang {summary.rang}
            </span>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-navy/8 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[0.8125rem] font-bold transition-colors',
              isAnnual
                ? 'text-gold-dark group-hover:text-navy'
                : 'text-navy group-hover:text-gold-dark'
            )}
          >
            Voir le détail
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
          {summary.estVerrouille && (
            <span className="text-[0.65rem] uppercase tracking-wider text-ink-400 font-semibold">
              Verrouillé
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ─── First-bulletin placeholder ────────────────────────────

export function FirstBulletinPlaceholder({ parentMode }: { parentMode: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-white ring-1 ring-ink-200 px-5 py-8 text-center shadow-sm"
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400 mb-3">
        <FileText className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-display text-base text-navy font-semibold">
        Pas encore de bulletin
      </p>
      <p className="text-[0.8125rem] text-ink-500 mt-1.5 leading-relaxed max-w-sm mx-auto">
        {parentMode
          ? "Le premier bulletin de votre enfant apparaîtra ici dès qu'il sera publié."
          : "Ton premier bulletin apparaîtra ici dès qu'il sera publié par ton professeur principal."}
      </p>
    </motion.div>
  )
}

// ─── Preview widget ────────────────────────────────────────

export function PreviewWidget({
  icon,
  iconTone,
  label,
  description,
  previewValue,
  previewUnit,
  decorative,
}: {
  icon: ReactNode
  iconTone: 'danger' | 'info' | 'warning' | 'success' | 'gold'
  label: string
  description: string
  previewValue?: string
  previewUnit?: string
  decorative?: string
}) {
  const T = {
    danger: 'bg-danger-bg text-danger ring-danger/20',
    info: 'bg-info-bg text-navy ring-navy/15',
    warning: 'bg-warning-bg text-warning ring-warning/20',
    success: 'bg-success-bg text-success ring-success/20',
    gold: 'bg-gold/10 text-gold-dark ring-gold/25',
  }[iconTone]

  return (
    <div
      className={cn(
        'relative rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 overflow-hidden',
        'shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]',
        'opacity-75'
      )}
    >
      {decorative && (
        <span
          aria-hidden
          className="absolute -bottom-3 -right-2 text-7xl opacity-[0.08] pointer-events-none select-none"
          style={{ transform: 'rotate(8deg)' }}
        >
          {decorative}
        </span>
      )}
      <div className="flex items-center gap-3 relative">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1',
            T
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
              {label}
            </p>
            <span className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wider font-bold text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">
              <Lock className="h-2.5 w-2.5" aria-hidden />
              Bientôt
            </span>
          </div>
          <p className="text-[0.75rem] text-ink-500 mt-0.5 leading-snug">
            {description}
          </p>
        </div>
        {previewValue !== undefined && (
          <div className="shrink-0 text-right">
            <p className="font-display tabular-nums text-xl font-bold text-ink-300 leading-none">
              {previewValue}
              {previewUnit && (
                <span className="text-[0.7rem] font-normal ml-0.5">{previewUnit}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

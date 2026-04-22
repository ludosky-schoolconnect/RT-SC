/**
 * RT-SC · BulletinsTab — shared between élève and parent dashboards.
 *
 * Lists all bulletins available for one (classeId × eleveId) pair, split
 * into per-period bulletins and the annual bulletin (if any). Each card
 * is tappable to open the polished bulletin view modal, where the user
 * can also download the PDF.
 *
 * Same component instance for both élève and parent — the only
 * difference upstream is who provides the (classeId, eleveId, eleveName)
 * trio: the élève reads them from their own session, the parent reads
 * from their child's record.
 */

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Award, FileText, Lock, Sparkles, ChevronRight } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useEleveBulletinList, type BulletinSummary } from '@/hooks/useEleveBulletinList'
import { ModalBulletinDetail } from '@/routes/_shared/bulletins/ModalBulletinDetail'
import { statutLabel, type Genre } from '@/lib/statutLabel'
import { cn } from '@/lib/cn'
import type { Periode } from '@/types/models'

interface BulletinsTabProps {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  /** Optional intro line shown above the cards (e.g. "Bulletins de votre enfant") */
  intro?: string
}

export function BulletinsTab({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  intro,
}: BulletinsTabProps) {
  const { data, isLoading } = useEleveBulletinList({ classeId, eleveId })

  // Modal state — stable boolean for `open`, plus the chosen mode/period.
  // Pattern: keep the modal mounted whenever there's a chosen target, but
  // flip its `open` prop to drive AnimatePresence cleanly. Mounting AND
  // opening simultaneously triggers a flicker on first interaction
  // because the open touch event can race with portal mount.
  const [bulletinOpen, setBulletinOpen] = useState(false)
  const [openMode, setOpenMode] = useState<'periode' | 'annuelle' | null>(null)
  const [openPeriode, setOpenPeriode] = useState<Periode | null>(null)

  function openPeriod(periode: string) {
    setOpenPeriode(periode as Periode)
    setOpenMode('periode')
    setBulletinOpen(true)
  }
  function openAnnual() {
    setOpenMode('annuelle')
    setBulletinOpen(true)
  }
  function closeModal() {
    setBulletinOpen(false)
    // Don't reset openMode/openPeriode — keeps the modal mounted with
    // its data so the close animation can play out.
  }

  // Stats for the header strip
  const stats = useMemo(() => {
    const periodes = data?.periodes ?? []
    const total = periodes.length + (data?.annual ? 1 : 0)
    const passing = periodes.filter((p) => p.moyenneGenerale >= 10).length
    return { total, passing, periodCount: periodes.length, hasAnnual: !!data?.annual }
  }, [data])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Chargement des bulletins…" />
      </div>
    )
  }

  if (!data || stats.total === 0) {
    return (
      <div className="px-4 py-12">
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Aucun bulletin pour le moment"
          description="Les bulletins apparaîtront ici dès qu'ils auront été générés par le professeur principal."
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-2 pb-8 space-y-5">
      {/* Header strip */}
      <header className="space-y-1.5">
        {intro && (
          <p className="text-[0.78rem] text-ink-500 font-medium">{intro}</p>
        )}
        <h2 className="font-display text-2xl text-navy">
          Bulletins · {classeNom}
        </h2>
        <p className="text-[0.78rem] text-ink-500">
          {stats.periodCount} bulletin{stats.periodCount > 1 ? 's' : ''} de période
          {stats.hasAnnual && ' · 1 bulletin annuel'}
        </p>
      </header>

      {/* Annual bulletin first if present — most important */}
      {data.annual && (
        <AnnualBulletinCard
          summary={data.annual}
          genre={data.genre}
          onOpen={openAnnual}
        />
      )}

      {/* Period bulletins */}
      {data.periodes.length > 0 && (
        <section>
          <p className="text-[0.7rem] uppercase tracking-widest text-ink-400 font-bold mb-2 px-1">
            Période
          </p>
          <div className="space-y-2">
            {data.periodes.map((p) => (
              <PeriodBulletinCard
                key={p.periode}
                summary={p}
                onOpen={() => openPeriod(p.periode)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Modal — kept mounted while a target is selected; `open` flips */}
      {openMode && (
        <ModalBulletinDetail
          open={bulletinOpen}
          onClose={closeModal}
          mode={openMode}
          classeId={classeId}
          eleveId={eleveId}
          periode={openPeriode ?? undefined}
          eleveName={eleveName}
        />
      )}
    </div>
  )
}

// ─── Cards ──────────────────────────────────────────────────

function PeriodBulletinCard({
  summary,
  onOpen,
}: {
  summary: BulletinSummary
  onOpen: () => void
}) {
  const passing = summary.moyenneGenerale >= 10
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'w-full text-left bg-white rounded-xl overflow-hidden group transition-all',
        'shadow-[0_4px_12px_-4px_rgba(11,37,69,0.08),0_1px_3px_rgba(11,37,69,0.04)]',
        'ring-1 ring-ink-100',
        'hover:ring-navy/25 hover:shadow-[0_8px_18px_-6px_rgba(11,37,69,0.14),0_2px_4px_rgba(11,37,69,0.06)]'
      )}
    >
      <div className="flex items-stretch">
        <div className="px-3.5 py-3.5 flex items-center bg-gradient-to-br from-info-bg to-info-bg/50 border-r border-navy/8">
          <FileText className="h-5 w-5 text-navy" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 px-3.5 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.05rem] text-navy font-bold leading-tight truncate">
              {summary.periode}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  'text-[0.85rem] font-mono tabular-nums font-bold',
                  passing ? 'text-success' : 'text-danger'
                )}
              >
                {summary.moyenneGenerale.toFixed(2)}
                <span className="text-[0.7rem] font-normal text-ink-400 ml-0.5">/ 20</span>
              </span>
              {summary.rang && (
                <span className="text-[0.7rem] text-ink-500">
                  · Rang {summary.rang}
                </span>
              )}
              {summary.estVerrouille && (
                <Lock className="h-3 w-3 text-ink-400" aria-label="Verrouillé" />
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-navy group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden />
        </div>
      </div>
    </motion.button>
  )
}

function AnnualBulletinCard({
  summary,
  genre,
  onOpen,
}: {
  summary: BulletinSummary
  genre?: Genre
  onOpen: () => void
}) {
  const passing = summary.moyenneGenerale >= 10
  const admis = summary.statutAnnuel === 'Admis'
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'w-full text-left rounded-2xl overflow-hidden group relative transition-all',
        'shadow-[0_12px_28px_-8px_rgba(11,37,69,0.18),0_2px_6px_-2px_rgba(11,37,69,0.08)]',
        'hover:shadow-[0_18px_38px_-10px_rgba(11,37,69,0.24),0_4px_10px_-4px_rgba(11,37,69,0.12)]',
        'ring-1',
        admis ? 'ring-gold/40' : 'ring-danger/30',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 -z-10',
          admis
            ? 'bg-gradient-to-br from-gold/12 via-white to-gold-pale/60'
            : 'bg-gradient-to-br from-danger-bg/30 via-white to-ink-50/40'
        )}
      />
      <div className={cn(
        'h-1',
        admis ? 'bg-gradient-to-r from-gold/60 via-gold to-gold/60' : 'bg-gradient-to-r from-danger/60 via-danger to-danger/60'
      )} />
      <div className="px-5 py-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              admis
                ? 'bg-gold/15 text-gold-dark ring-1 ring-gold/30'
                : 'bg-danger-bg text-danger ring-1 ring-danger/20'
            )}
          >
            <Award className="h-6 w-6" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-gold-dark">
                Bulletin annuel
              </p>
              <Sparkles className="h-3 w-3 text-gold" aria-hidden />
            </div>
            <p className="font-display text-[1.4rem] text-navy font-bold leading-tight">
              {statutLabel(summary.statutAnnuel, genre)}
            </p>
            <div className="flex items-baseline gap-3 mt-2 flex-wrap">
              <span
                className={cn(
                  'font-display tabular-nums font-bold text-2xl leading-none',
                  passing ? 'text-success' : 'text-danger'
                )}
              >
                {summary.moyenneGenerale.toFixed(2)}
                <span className="text-[0.78rem] font-normal text-ink-400 ml-0.5">/ 20</span>
              </span>
              {summary.rang && (
                <Badge variant="navy" size="sm">
                  Rang {summary.rang}
                </Badge>
              )}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-ink-400 group-hover:text-navy group-hover:translate-x-0.5 transition-all shrink-0 mt-1" aria-hidden />
        </div>
      </div>
    </motion.button>
  )
}

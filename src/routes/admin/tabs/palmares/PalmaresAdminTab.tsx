/**
 * RT-SC · Palmarès admin tab (v2 — intelligent).
 *
 * v2 layers on top of the legacy port:
 *
 *   - Aggregate KPIs at the top (élèves classés, moyenne école,
 *     % filles, % moyenne ≥ 10)
 *   - Top 5 classes block (NEW) ranked by class moyenne
 *   - Distribution histogram (NEW) using recharts — instant sense
 *     of school health
 *   - Per-block gender-balance chip in headers
 *   - Annual-only progression arrows (↑ ↓ →) on each row when
 *     viewing periode='Année', driven by perPeriodMoyennes from
 *     the annual bulletin (zero extra reads)
 *   - PDF export — full printable palmarès as A4
 *
 * Read budget: same ~1 + N_classes + N_eleves as v1 (one fetch per
 * load, cached 15 min). All v2 additions are pure client-side
 * aggregation over the data we already have.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  Trophy,
  RefreshCw,
  AlertTriangle,
  Medal,
  Award,
  Users,
  BookOpen,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
  Download,
  School as SchoolIcon,
  BarChart3,
} from 'lucide-react'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import {
  usePalmares,
  rankClasses,
  bucketDistribution,
  genderStats,
  computeProgression,
  type PalmaresEntry,
  type ProgressionInfo,
} from '@/hooks/usePalmares'
import { listPeriodes } from '@/lib/bulletin'
import { downloadPalmaresPdf } from '@/lib/pdf/palmaresPdf'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/cn'

const SERIE_ORDER = ['A', 'B', 'C', 'D', 'G1', 'G2', 'G3']

// Distribution chart bar colors — gradient from danger → success
const BAR_COLORS = [
  '#b91c1c', // 0-4
  '#dc2626', // 5-7
  '#ea580c', // 8-9
  '#ca8a04', // 10-11
  '#65a30d', // 12-13
  '#16a34a', // 14-15
  '#059669', // 16-17
  '#c9a84c', // 18-20 (gold)
]

export function PalmaresAdminTab() {
  const { data: config } = useBulletinConfig()
  const { data: ecoleConfig } = useEcoleConfig()
  const [periode, setPeriode] = useState<string>('')
  const toast = useToast()

  const availablePeriodes = useMemo(() => {
    if (!config) return []
    const list = listPeriodes(config.typePeriode, config.nbPeriodes)
    list.push('Année')
    return list
  }, [config])

  const { data, isLoading, isFetching, refetch } = usePalmares(periode || undefined)

  // v2 derived data — all client-side over the cached entries
  const overallStats = useMemo(() => {
    if (!data || data.all.length === 0) return null
    const moyennes = data.all.map((e) => e.moyenneGenerale)
    const sum = moyennes.reduce((s, m) => s + m, 0)
    const moyenneEcole = sum / moyennes.length
    const passants = moyennes.filter((m) => m >= 10).length
    const filles = data.all.filter((e) => e.genre === 'F').length
    return {
      total: data.all.length,
      moyenneEcole: Math.round(moyenneEcole * 100) / 100,
      pctPassants: Math.round((passants / moyennes.length) * 100),
      pctFilles: Math.round((filles / moyennes.length) * 100),
    }
  }, [data])

  const classRanking = useMemo(
    () => (data ? rankClasses(data.all).slice(0, 5) : []),
    [data]
  )

  const distribution = useMemo(
    () => (data ? bucketDistribution(data.all) : []),
    [data]
  )

  function handleExportPdf() {
    if (!data || !periode) return
    try {
      downloadPalmaresPdf({
        result: data,
        periode,
        schoolName: ecoleConfig?.nom,
        anneeScolaire: ecoleConfig?.anneeActive,
      })
      toast.success('Palmarès téléchargé.')
    } catch (err) {
      console.error('[PalmaresAdminTab] PDF export failed:', err)
      toast.error('Impossible de générer le PDF. Réessayez.')
    }
  }

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-5">
      <Section>
        <SectionHeader
          title="Palmarès général"
          description="Classement des élèves à travers toute l'école, par période."
        />

        <div className="flex items-end gap-2 mb-4 flex-wrap">
          <Select
            label="Période"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            containerClassName="flex-1 min-w-[160px]"
          >
            <option value="">-- Choisir une période --</option>
            {availablePeriodes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          {periode && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => refetch()}
              disabled={isFetching}
              leadingIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden />}
              className="shrink-0"
            >
              Actualiser
            </Button>
          )}
          {data && data.all.length > 0 && (
            <Button
              variant="primary"
              size="md"
              onClick={handleExportPdf}
              leadingIcon={<Download className="h-4 w-4" aria-hidden />}
              className="shrink-0"
            >
              PDF
            </Button>
          )}
        </div>

        {data && data.classesIncompletes.length > 0 && (
          <div className="mb-4 rounded-lg bg-warning-bg/60 border-[1.5px] border-warning/30 px-3.5 py-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warning-dark shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 text-[0.8rem] text-ink-700 leading-snug">
              <p className="font-bold text-warning-dark">Palmarès partiel</p>
              <p className="mt-0.5">
                Bulletins non encore verrouillés dans :{' '}
                <span className="font-semibold">{data.classesIncompletes.join(', ')}</span>.
              </p>
            </div>
          </div>
        )}

        {!periode ? (
          <EmptyState
            icon={<Trophy className="h-8 w-8" />}
            title="Choisissez une période"
            description="Le palmarès est calculé à partir des bulletins verrouillés de la période sélectionnée."
          />
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : !data || data.all.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-8 w-8" />}
            title="Aucune donnée"
            description="Aucun bulletin verrouillé n'a été trouvé. Fermez les périodes dans chaque classe d'abord."
          />
        ) : (
          <div className="space-y-5">
            {overallStats && <KpiStrip stats={overallStats} isAnnual={data.isAnnual} />}
            <DistributionChart buckets={distribution} />
            {classRanking.length > 0 && <ClassRankingBlock classes={classRanking} />}

            <RankingBlock
              title="Classement général"
              subtitle="Toutes classes confondues"
              icon={<Trophy className="h-4 w-4 text-gold-dark" aria-hidden />}
              entries={data.all}
              limit={10}
              accent="gold"
              isAnnual={data.isAnnual}
            />

            {data.premierCycle.length > 0 && (
              <RankingBlock
                title="Premier cycle"
                subtitle="6ème, 5ème, 4ème, 3ème"
                icon={<GraduationCap className="h-4 w-4 text-navy" aria-hidden />}
                entries={data.premierCycle}
                limit={5}
                accent="navy"
                isAnnual={data.isAnnual}
              />
            )}

            {data.secondCycle.length > 0 && (
              <RankingBlock
                title="Second cycle"
                subtitle="2nde, 1ère, Terminale"
                icon={<Users className="h-4 w-4 text-navy" aria-hidden />}
                entries={data.secondCycle}
                limit={5}
                accent="navy"
                isAnnual={data.isAnnual}
              />
            )}

            {Object.keys(data.parSerie).length > 0 && (
              <SeriesBlock parSerie={data.parSerie} isAnnual={data.isAnnual} />
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── KPI strip ─────────────────────────────────────────────

function KpiStrip({
  stats,
  isAnnual,
}: {
  stats: { total: number; moyenneEcole: number; pctPassants: number; pctFilles: number }
  isAnnual: boolean
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Kpi label="Élèves classés" value={String(stats.total)} icon={<Users className="h-3.5 w-3.5" aria-hidden />} tone="neutral" />
      <Kpi
        label={isAnnual ? 'Moyenne annuelle' : 'Moyenne école'}
        value={stats.moyenneEcole.toFixed(2)}
        icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden />}
        tone={stats.moyenneEcole >= 12 ? 'success' : stats.moyenneEcole >= 10 ? 'neutral' : 'warning'}
      />
      <Kpi
        label="Moy. ≥ 10"
        value={`${stats.pctPassants}%`}
        icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
        tone={stats.pctPassants >= 70 ? 'success' : stats.pctPassants >= 50 ? 'neutral' : 'warning'}
      />
      <Kpi label="Part de filles" value={`${stats.pctFilles}%`} icon={<Users className="h-3.5 w-3.5" aria-hidden />} tone="neutral" />
    </div>
  )
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: 'success' | 'neutral' | 'warning' }) {
  return (
    <div
      className={cn(
        'rounded-lg border-[1.5px] px-3 py-2.5 bg-white',
        tone === 'success' && 'border-success/30',
        tone === 'neutral' && 'border-ink-100',
        tone === 'warning' && 'border-warning/30'
      )}
    >
      <div className="flex items-center gap-1 text-ink-400 mb-1">
        {icon}
        <p className="text-[0.62rem] uppercase tracking-wider font-bold leading-none truncate">{label}</p>
      </div>
      <p
        className={cn(
          'font-display font-bold text-[1.1rem] leading-tight',
          tone === 'success' && 'text-success-dark',
          tone === 'neutral' && 'text-navy',
          tone === 'warning' && 'text-warning-dark'
        )}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Distribution chart ────────────────────────────────────

function DistributionChart({ buckets }: { buckets: { label: string; count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return null

  return (
    <div className="rounded-xl bg-white border-[1.5px] border-ink-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-info-bg ring-1 ring-navy/15">
          <BarChart3 className="h-4 w-4 text-navy" aria-hidden />
        </div>
        <div>
          <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
            Distribution des moyennes
          </p>
          <p className="text-[0.68rem] text-ink-500 mt-0.5 leading-snug">
            Répartition de {total} élève{total > 1 ? 's' : ''} par tranche
          </p>
        </div>
      </div>
      <div className="px-2 pt-3 pb-2">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e4e8ee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e4e8ee' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <RechartsTooltip
                cursor={{ fill: 'rgba(11,37,69,0.04)' }}
                contentStyle={{ borderRadius: 6, border: '1px solid #e4e8ee', fontSize: 12, padding: '6px 10px' }}
                formatter={(v: number) => [`${v} élève${v > 1 ? 's' : ''}`, '']}
                labelFormatter={(l) => `Moyenne ${l}`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {buckets.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i] ?? '#0b2545'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Class ranking block ───────────────────────────────────

function ClassRankingBlock({ classes }: { classes: ReturnType<typeof rankClasses> }) {
  return (
    <div className="rounded-xl bg-white border-[1.5px] border-ink-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 bg-gold-pale flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gold/20 ring-1 ring-gold/40">
            <SchoolIcon className="h-4 w-4 text-gold-dark" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[0.98rem] font-bold text-navy leading-tight">Top des classes</p>
            <p className="text-[0.68rem] text-ink-500 mt-0.5 leading-snug">Classement par moyenne d'élèves</p>
          </div>
        </div>
        <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wider text-ink-500 bg-white rounded-full px-2 py-0.5 ring-1 ring-ink-200">
          Top {classes.length}
        </span>
      </div>
      <ol className="divide-y divide-ink-100">
        {classes.map((c, idx) => (
          <motion.li
            key={c.classeId}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
            className="flex items-center gap-3 px-4 py-3"
          >
            <RankBadge rank={idx + 1} />
            <div className="flex-1 min-w-0">
              <p className="font-display text-[0.95rem] font-bold text-navy leading-tight truncate">{c.classeNom}</p>
              <p className="text-[0.7rem] text-ink-500 mt-0.5 leading-snug">
                {c.nbEleves} élève{c.nbEleves > 1 ? 's' : ''} · meilleure {c.topMoyenne.toFixed(2)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  'font-display font-black text-[1.1rem] leading-none',
                  c.moyenneClasse >= 12 ? 'text-success-dark' : c.moyenneClasse >= 10 ? 'text-navy' : 'text-warning-dark'
                )}
              >
                {c.moyenneClasse.toFixed(2)}
              </p>
              <p className="text-[0.62rem] font-semibold text-ink-400 mt-0.5">Moyenne</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

// ─── Ranking block ─────────────────────────────────────────

function RankingBlock({
  title,
  subtitle,
  icon,
  entries,
  limit,
  accent,
  isAnnual,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  entries: PalmaresEntry[]
  limit: number
  accent: 'gold' | 'navy'
  isAnnual: boolean
}) {
  const top = entries.slice(0, limit)
  const stats = genderStats(top)
  return (
    <div className="rounded-xl bg-white border-[1.5px] border-ink-100 overflow-hidden">
      <div
        className={cn(
          'px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap',
          accent === 'gold' ? 'bg-gold-pale' : 'bg-info-bg'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', accent === 'gold' ? 'bg-gold/20 ring-1 ring-gold/40' : 'bg-navy/10 ring-1 ring-navy/20')}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-display text-[0.98rem] font-bold text-navy leading-tight">{title}</p>
            {subtitle && <p className="text-[0.68rem] text-ink-500 mt-0.5 leading-snug">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <GenderChip stats={stats} />
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-500 bg-white rounded-full px-2 py-0.5 ring-1 ring-ink-200">
            Top {top.length}
          </span>
        </div>
      </div>
      <ol className="divide-y divide-ink-100">
        {top.map((e, idx) => (
          <PalmaresRow key={`${e.classeId}-${e.eleveId}`} rank={idx + 1} entry={e} isAnnual={isAnnual} />
        ))}
      </ol>
    </div>
  )
}

// ─── Series block ──────────────────────────────────────────

function SeriesBlock({ parSerie, isAnnual }: { parSerie: Record<string, PalmaresEntry[]>; isAnnual: boolean }) {
  const knownFirst = SERIE_ORDER.filter((s) => parSerie[s])
  const others = Object.keys(parSerie).filter((s) => !SERIE_ORDER.includes(s))
  const ordered = [...knownFirst, ...others]

  return (
    <div className="space-y-3">
      <p className="text-[0.7rem] uppercase tracking-[0.2em] font-bold text-ink-500 px-1">Par série (Second cycle)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ordered.map((serie) => {
          const entries = parSerie[serie]
          if (!entries) return null
          const top = entries.slice(0, 3)
          const stats = genderStats(top)
          return (
            <div key={serie} className="rounded-xl bg-white border-[1.5px] border-ink-100 overflow-hidden">
              <div className="bg-navy text-white px-4 py-2.5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-navy font-black text-[0.75rem]">
                  {serie === 'Sans série' ? '—' : serie}
                </div>
                <p className="font-display text-[0.92rem] font-bold leading-tight">
                  Série {serie === 'Sans série' ? 'non spécifiée' : serie}
                </p>
                <span className="ml-auto inline-flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wider bg-white/15 rounded-full px-2 py-0.5">
                  {stats.filles}F · {stats.garcons}M
                </span>
              </div>
              <ol className="divide-y divide-ink-100">
                {top.map((e, idx) => (
                  <PalmaresRow key={`${e.classeId}-${e.eleveId}`} rank={idx + 1} entry={e} compact isAnnual={isAnnual} />
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Individual row ────────────────────────────────────────

function PalmaresRow({
  rank,
  entry,
  compact = false,
  isAnnual,
}: {
  rank: number
  entry: PalmaresEntry
  compact?: boolean
  isAnnual: boolean
}) {
  const progression = isAnnual ? computeProgression(entry) : null

  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(rank * 0.02, 0.3) }}
      className={cn('flex items-center gap-3 px-4', compact ? 'py-2' : 'py-3')}
    >
      <RankBadge rank={rank} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={cn('font-display font-bold text-navy leading-tight truncate', compact ? 'text-[0.88rem]' : 'text-[0.95rem]')}>
            {entry.nom}
          </p>
          {progression && <ProgressionPill progression={progression} />}
        </div>
        <p className={cn('text-ink-500 mt-0.5 leading-snug truncate', compact ? 'text-[0.68rem]' : 'text-[0.72rem]')}>
          {entry.classeNom}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-display font-black leading-none',
            compact ? 'text-[0.95rem]' : 'text-[1.1rem]',
            entry.moyenneGenerale >= 14 ? 'text-success-dark' : entry.moyenneGenerale >= 10 ? 'text-navy' : 'text-warning-dark'
          )}
        >
          {entry.moyenneGenerale.toFixed(2)}
        </p>
        <p className="text-[0.62rem] font-semibold text-ink-400 mt-0.5">/20</p>
      </div>
    </motion.li>
  )
}

// ─── Progression pill (annual only) ────────────────────────

function ProgressionPill({ progression }: { progression: ProgressionInfo }) {
  const { trend, delta } = progression
  if (trend === 'flat') {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold bg-ink-50 text-ink-500"
        title={`Trajectoire stable (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`}
      >
        <MinusIcon className="h-2.5 w-2.5" aria-hidden />
        Stable
      </span>
    )
  }
  if (trend === 'up') {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold bg-success-bg text-success-dark"
        title={`En progression (Δ +${delta.toFixed(1)} sur l'année)`}
      >
        <TrendingUp className="h-2.5 w-2.5" aria-hidden />+{delta.toFixed(1)}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold bg-danger-bg text-danger-dark"
      title={`En recul (Δ ${delta.toFixed(1)} sur l'année)`}
    >
      <TrendingDown className="h-2.5 w-2.5" aria-hidden />
      {delta.toFixed(1)}
    </span>
  )
}

// ─── Gender chip ───────────────────────────────────────────

function GenderChip({ stats }: { stats: ReturnType<typeof genderStats> }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wider text-ink-500 bg-white rounded-full px-2 py-0.5 ring-1 ring-ink-200"
      title={`${stats.filles} fille(s), ${stats.garcons} garçon(s)`}
    >
      {stats.filles}F · {stats.garcons}M
    </span>
  )
}

// ─── Rank badge ────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-navy shadow-[0_2px_8px_-2px_rgba(201,168,76,0.5)]">
        <Trophy className="h-4 w-4" aria-hidden />
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-200 text-ink-700">
        <Medal className="h-4 w-4" aria-hidden />
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/30 text-warning-dark ring-1 ring-warning/30">
        <Award className="h-4 w-4" aria-hidden />
      </div>
    )
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/5 text-navy font-bold text-[0.85rem]">
      {rank}
    </div>
  )
}

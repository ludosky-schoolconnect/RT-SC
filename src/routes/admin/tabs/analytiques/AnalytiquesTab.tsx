/**
 * RT-SC · Admin Analytiques tab.
 *
 * School-wide operational intelligence in one scroll. All data
 * sourced from useSchoolAnalytics which is deliberately low-cost
 * (see that hook for the read budget and trade-offs).
 *
 * Sections (top to bottom):
 *   1. Overview KPIs — 6 tiles at a glance
 *   2. Démographie — genre/cycle/niveau/série
 *   3. Vie scolaire — civisme distribution + recent incidents
 *   4. Performance — top 10 élèves
 *
 * Manual refresh button (no auto-refetch) so admin controls when
 * to re-spend the read budget.
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
  BarChart3,
  Users,
  GraduationCap,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  Trophy,
  RefreshCw,
  Sparkles,
  Flag,
  Info,
  Calendar,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  useSchoolAnalytics,
  type AnalyticsSnapshot,
} from '@/hooks/useSchoolAnalytics'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { listPeriodes, currentPeriode } from '@/lib/bulletin'
import { serverNow } from '@/lib/serverTime'
import { cn } from '@/lib/cn'

// Design tokens
const NAVY = '#1e3a5f'
const GOLD = '#c9a961'
const ROSE = '#d4647e'
const SUCCESS = '#16a34a'
const DANGER = '#b91c1c'
const INK_400 = '#94a3b8'

const TIER_COLORS: Record<
  keyof AnalyticsSnapshot['civismeByTier'],
  string
> = {
  critical: DANGER,
  neutral: INK_400,
  engaged: NAVY,
  committed: SUCCESS,
  exemplary: GOLD,
}

const TIER_LABELS: Record<
  keyof AnalyticsSnapshot['civismeByTier'],
  string
> = {
  critical: 'Critique',
  neutral: 'Neutre',
  engaged: 'Engagé',
  committed: 'Confirmé',
  exemplary: 'Exemplaire',
}

export function AnalytiquesTab() {
  const qc = useQueryClient()
  const { data: bulletinConfig } = useBulletinConfig()

  // Period override: null = auto-detect (default), otherwise a specific
  // period name like "Trimestre 2". Admin picks from the dropdown.
  const [periodeOverride, setPeriodeOverride] = useState<string | null>(null)

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
  } = useSchoolAnalytics(periodeOverride)

  // Available periods list — derived from bulletin config
  const availablePeriodes = useMemo(() => {
    if (!bulletinConfig) return []
    return listPeriodes(
      bulletinConfig.typePeriode,
      bulletinConfig.nbPeriodes
    )
  }, [bulletinConfig])

  // Auto-detected period label (for the dropdown's default option text)
  const autoPeriodeLabel = useMemo(() => {
    if (!bulletinConfig) return ''
    return currentPeriode(
      bulletinConfig.typePeriode,
      bulletinConfig.nbPeriodes,
      serverNow(),
      bulletinConfig.periodeDates
    )
  }, [bulletinConfig])

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['analytics', 'school'] })
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
        <HeaderWithRefresh
          loading={true}
          onRefresh={handleRefresh}
          generatedAt={null}
        />
        <PeriodSelector
          value={periodeOverride}
          onChange={setPeriodeOverride}
          options={availablePeriodes}
          autoLabel={autoPeriodeLabel}
        />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
        <HeaderWithRefresh
          loading={false}
          onRefresh={handleRefresh}
          generatedAt={null}
        />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8 text-danger" />}
          title="Impossible de charger les statistiques"
          description={
            (error as Error)?.message ??
            "Réessayez en cliquant sur Rafraîchir. Si le problème persiste, vérifiez la console."
          }
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4">
        <HeaderWithRefresh
          loading={false}
          onRefresh={handleRefresh}
          generatedAt={null}
        />
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="Aucune donnée"
          description="Ajoutez des classes et des élèves pour voir les statistiques."
        />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4"
    >
      <HeaderWithRefresh
        loading={isFetching}
        onRefresh={handleRefresh}
        generatedAt={data.generatedAt}
      />
      <PeriodSelector
        value={periodeOverride}
        onChange={setPeriodeOverride}
        options={availablePeriodes}
        autoLabel={autoPeriodeLabel}
      />

      <OverviewSection data={data} />
      <DemographicsSection data={data} />
      <VieScolaireSection data={data} />
      <PerformanceSection data={data} />
    </motion.div>
  )
}

// ─── Period selector ────────────────────────────────────────

function PeriodSelector({
  value,
  onChange,
  options,
  autoLabel,
}: {
  value: string | null
  onChange: (v: string | null) => void
  options: string[]
  autoLabel: string
}) {
  if (options.length === 0) return null
  return (
    <div className="rounded-lg bg-white border-[1.5px] border-ink-100 px-3 py-2.5 flex items-center gap-2">
      <Calendar className="h-4 w-4 text-ink-500 shrink-0" aria-hidden />
      <label
        htmlFor="analytics-period"
        className="text-[0.78rem] font-bold text-ink-700 shrink-0"
      >
        Période :
      </label>
      <Select
        id="analytics-period"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : v)
        }}
        className="flex-1 min-w-0"
      >
        <option value="">Automatique ({autoLabel})</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
    </div>
  )
}

// ─── Header + Refresh ───────────────────────────────────────

function HeaderWithRefresh({
  loading,
  onRefresh,
  generatedAt,
}: {
  loading: boolean
  onRefresh: () => void
  generatedAt: number | null
}) {
  const relativeLabel = useMemo(() => {
    if (!generatedAt) return null
    const deltaMs = Date.now() - generatedAt
    const deltaMin = Math.round(deltaMs / 60000)
    if (deltaMin < 1) return "à l'instant"
    if (deltaMin === 1) return 'il y a 1 min'
    if (deltaMin < 60) return `il y a ${deltaMin} min`
    const h = Math.round(deltaMin / 60)
    if (h === 1) return 'il y a 1 h'
    return `il y a ${h} h`
  }, [generatedAt])

  return (
    <div className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-2xl font-bold text-navy leading-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-gold" aria-hidden />
          Analytiques
        </h2>
        <p className="text-[0.82rem] text-ink-600 mt-0.5">
          Vue d'ensemble de l'école.
          {relativeLabel && (
            <span className="text-ink-500 italic ml-1.5">
              · Actualisé {relativeLabel}
            </span>
          )}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onRefresh}
        disabled={loading}
        leadingIcon={
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            aria-hidden
          />
        }
        className="shrink-0"
      >
        Rafraîchir
      </Button>
    </div>
  )
}

// ─── Section 1: Overview KPIs ───────────────────────────────

function OverviewSection({ data }: { data: AnalyticsSnapshot }) {
  const tauxReussiteLabel =
    data.tauxReussitePeriode === null
      ? '—'
      : `${data.tauxReussitePeriode.toFixed(0)}%`
  const moyenneLabel =
    data.moyenneEcolePeriode === null
      ? '—'
      : data.moyenneEcolePeriode.toFixed(2)

  return (
    <Section>
      <SectionHeader
        title="Vue d'ensemble"
        description={`Période en cours : ${data.currentPeriodeName}.`}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <Kpi
          icon={<GraduationCap className="h-4 w-4" />}
          label="Élèves"
          value={data.totalEleves.toString()}
          tone="navy"
        />
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Classes"
          value={data.totalClasses.toString()}
          tone="navy"
        />
        <Kpi
          icon={<ClipboardList className="h-4 w-4" />}
          label="Bulletins cumulés"
          value={data.bulletinsPeriodeCount.toString()}
          tone="gold"
          hint="Cumul incluant années archivées"
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Moyenne école"
          value={moyenneLabel}
          tone="navy"
          hint="Sur 20"
        />
        <Kpi
          icon={<Sparkles className="h-4 w-4" />}
          label="Taux de réussite"
          value={tauxReussiteLabel}
          tone="success"
          hint="Bulletins ≥ 10/20"
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Civisme critique"
          value={data.civismeByTier.critical.toString()}
          tone={data.civismeByTier.critical > 0 ? 'danger' : 'navy'}
          hint="Élèves < 0 points"
        />
      </div>
    </Section>
  )
}

function Kpi({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'navy' | 'gold' | 'success' | 'danger'
  hint?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white border-[1.5px] px-3 py-3 flex flex-col gap-1',
        tone === 'navy' && 'border-navy/15',
        tone === 'gold' && 'border-gold/30',
        tone === 'success' && 'border-success/30',
        tone === 'danger' && 'border-danger/30'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md',
            tone === 'navy' && 'bg-navy/10 text-navy',
            tone === 'gold' && 'bg-gold/15 text-gold-dark',
            tone === 'success' && 'bg-success-bg text-success-dark',
            tone === 'danger' && 'bg-danger-bg text-danger'
          )}
        >
          {icon}
        </span>
        <span className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-500 truncate">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'font-display font-black text-2xl leading-none mt-1',
          tone === 'navy' && 'text-navy',
          tone === 'gold' && 'text-gold-dark',
          tone === 'success' && 'text-success-dark',
          tone === 'danger' && 'text-danger'
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[0.66rem] text-ink-500 leading-tight">
          {hint}
        </p>
      )}
    </div>
  )
}

// ─── Section 2: Demographics ────────────────────────────────

function DemographicsSection({ data }: { data: AnalyticsSnapshot }) {
  // Genre pie data — fields on disk are 'M'/'F', label as words for UI
  const genreData = [
    { name: 'Garçons', value: data.byGenre.M, color: NAVY },
    { name: 'Filles', value: data.byGenre.F, color: ROSE },
  ].filter((d) => d.value > 0)

  // Niveau bar data (sorted by natural progression)
  const niveauOrder: (keyof typeof data.byNiveau)[] = [
    '6ème',
    '5ème',
    '4ème',
    '3ème',
    '2nde',
    '1ère',
    'Terminale',
  ]
  const niveauData = niveauOrder.map((niv) => ({
    niveau: niv,
    count: data.byNiveau[niv],
  }))

  // Serie data (Second Cycle only — A/B/C/D/G1/G2/G3)
  const serieData = (['A', 'B', 'C', 'D', 'G1', 'G2', 'G3'] as const)
    .map((s) => ({ serie: s, count: data.bySerie[s] }))
    .filter((d) => d.count > 0)

  // Cycle split — fields on disk are 'premier'/'second'
  const cycleData = [
    {
      name: 'Premier cycle',
      value: data.byCycle.premier,
      color: NAVY,
    },
    {
      name: 'Second cycle',
      value: data.byCycle.second,
      color: GOLD,
    },
  ].filter((d) => d.value > 0)

  const hasData = data.totalEleves > 0

  return (
    <Section>
      <SectionHeader
        title="Démographie"
        description="Répartition des élèves inscrits."
      />
      {!hasData ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="Aucun élève"
          description="Ajoutez des élèves pour voir la répartition."
        />
      ) : (
        <div className="space-y-3">
          {/* Genre — horizontal split bars. No legend, no tooltip.
              Each row shows label + filled bar proportional to count
              + percentage + raw count. Readable at a glance, scales
              to any number of categories. */}
          <ChartCard title="Genre">
            <SplitBars
              rows={genreData.map((d) => ({
                label: d.name,
                value: d.value,
                color: d.color,
              }))}
            />
          </ChartCard>

          {/* Cycle — same treatment */}
          <ChartCard title="Cycles">
            <SplitBars
              rows={cycleData.map((d) => ({
                label: d.name,
                value: d.value,
                color: d.color,
              }))}
            />
          </ChartCard>

          {/* Niveau bar */}
          <ChartCard title="Par niveau">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={niveauData}
                margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="niveau"
                  stroke={NAVY}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke={NAVY}
                  fontSize={11}
                  allowDecimals={false}
                  tickLine={false}
                />
                <RechartsTooltip />
                <Bar
                  dataKey="count"
                  fill={NAVY}
                  radius={[4, 4, 0, 0]}
                  name="Élèves"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Serie bar (if Second Cycle exists) */}
          {serieData.length > 0 && (
            <ChartCard title="Séries (Second cycle)">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={serieData}
                  margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="serie"
                    stroke={NAVY}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={NAVY}
                    fontSize={11}
                    allowDecimals={false}
                    tickLine={false}
                  />
                  <RechartsTooltip />
                  <Bar
                    dataKey="count"
                    fill={GOLD}
                    radius={[4, 4, 0, 0]}
                    name="Élèves"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </Section>
  )
}

// ─── Section 3: Vie Scolaire ────────────────────────────────

function VieScolaireSection({ data }: { data: AnalyticsSnapshot }) {
  const civismeData = (
    Object.keys(data.civismeByTier) as (keyof typeof data.civismeByTier)[]
  ).map((tier) => ({
    tier: TIER_LABELS[tier],
    count: data.civismeByTier[tier],
    color: TIER_COLORS[tier],
  }))

  const totalCivisme = civismeData.reduce((sum, d) => sum + d.count, 0)

  return (
    <Section>
      <SectionHeader
        title="Vie scolaire"
        description="Distribution du civisme et incidents récents."
      />

      {totalCivisme === 0 ? (
        <div className="rounded-md bg-ink-50/60 border border-ink-100 p-4 text-center">
          <p className="text-[0.82rem] text-ink-600">
            Aucune donnée civisme pour l'instant.
          </p>
        </div>
      ) : (
        <ChartCard title="Répartition du civisme">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={civismeData}
              margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="tier"
                stroke={NAVY}
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke={NAVY}
                fontSize={11}
                allowDecimals={false}
                tickLine={false}
              />
              <RechartsTooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Élèves">
                {civismeData.map((d) => (
                  <Cell key={d.tier} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Recent incidents */}
      <div className="mt-3">
        <h3 className="font-display text-[0.95rem] font-bold text-navy flex items-center gap-1.5 mb-2">
          <Flag className="h-4 w-4 text-danger" aria-hidden />
          Incidents récents
        </h3>
        {data.recentIncidents.length === 0 ? (
          <p className="text-[0.82rem] text-ink-500 italic">
            Aucun incident signalé récemment.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.recentIncidents.map((inc) => (
              <li
                key={inc.id}
                className="rounded-md bg-white border-[1.5px] border-danger/20 px-3 py-2 text-[0.8rem]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy truncate">
                      {inc.eleveNom}
                    </p>
                    <p className="text-ink-700 leading-snug mt-0.5">
                      {inc.motif}
                    </p>
                    <p className="text-[0.68rem] text-ink-500 mt-0.5">
                      {inc.dateISO} · par {inc.par}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center rounded-md px-2 py-0.5 font-display font-bold text-[0.85rem]',
                      inc.delta < 0
                        ? 'bg-danger-bg text-danger-dark'
                        : 'bg-success-bg text-success-dark'
                    )}
                  >
                    {inc.delta > 0 ? '+' : ''}
                    {inc.delta}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

// ─── Section 4: Performance ─────────────────────────────────

function PerformanceSection({ data }: { data: AnalyticsSnapshot }) {
  return (
    <Section>
      <SectionHeader
        title="Performance"
        description={`Top élèves pour ${data.currentPeriodeName}.`}
      />

      {data.top10.length === 0 ? (
        <div className="rounded-md bg-ink-50/60 border border-ink-100 p-4 text-center">
          <p className="text-[0.82rem] text-ink-600">
            Aucun bulletin publié pour {data.currentPeriodeName}.
          </p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {data.top10.map((e, i) => (
            <li
              key={e.eleveId}
              className={cn(
                'rounded-md bg-white border-[1.5px] px-3 py-2 text-[0.82rem] flex items-center gap-3',
                i === 0
                  ? 'border-gold/40 bg-gold-pale/20'
                  : i <= 2
                    ? 'border-gold/20'
                    : 'border-ink-100'
              )}
            >
              <span
                className={cn(
                  'shrink-0 inline-flex items-center justify-center rounded-full font-display font-black text-[0.78rem] w-7 h-7',
                  i === 0
                    ? 'bg-gold text-white'
                    : i <= 2
                      ? 'bg-gold-pale text-gold-dark'
                      : 'bg-ink-100 text-ink-600'
                )}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-navy truncate">{e.nom}</p>
                <p className="text-[0.7rem] text-ink-500 truncate">
                  {e.classeLabel}
                </p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 font-display font-bold text-navy">
                <Trophy className="h-3 w-3 text-gold" aria-hidden />
                {e.moyenne.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

// ─── Split bars (Genre / Cycle) ─────────────────────────────
//
// Renders a list of horizontal bars, one per row. Each bar's width is
// proportional to its share of the total. Designed for 2–6 categories
// where proportions are the primary insight — cleaner than a pie chart
// on mobile and no tooltips needed. Label + count + percentage all
// visible at once.

function SplitBars({
  rows,
}: {
  rows: { label: string; value: number; color: string }[]
}) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (total === 0) {
    return (
      <p className="text-[0.8rem] text-ink-500 italic py-3 text-center">
        Aucune donnée.
      </p>
    )
  }
  return (
    <div className="space-y-2.5 py-1">
      {rows.map((r) => {
        const pct = total === 0 ? 0 : (r.value / total) * 100
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[0.82rem] mb-1">
              <span className="font-bold text-navy truncate">{r.label}</span>
              <span className="shrink-0 ml-2 text-ink-600 tabular-nums">
                <span className="font-display font-bold text-navy">
                  {r.value}
                </span>
                <span className="mx-1 text-ink-300">·</span>
                <span className="font-display font-bold">
                  {pct.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="relative h-3 w-full rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: r.color,
                  minWidth: pct > 0 ? '4px' : 0,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Chart card wrapper ─────────────────────────────────────

function ChartCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('p-3', className)} accent={false}>
      <h3 className="font-display text-[0.85rem] font-bold text-ink-700 mb-2">
        {title}
      </h3>
      {children}
    </Card>
  )
}

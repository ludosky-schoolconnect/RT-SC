/**
 * RT-SC · Civisme — Élèves sub-section (admin).
 *
 * Per-class roster with each student's current civisme balance and
 * the manual ±1 adjustment buttons. Critical students (negative
 * balance) sort to the top and surface in an alert banner.
 *
 * What's NEW vs the v2 admin tab:
 *   - Score displays as "X pts" (no /20)
 *   - 5-tier coloring (critical / neutral / engaged / committed / exemplary)
 *   - 3 stat chips (Critiques / Moyenne / Meilleur score) — we
 *     dropped the old "Honorés" count because the honor concept is
 *     killed in v3 (it's a reward catalog entry now if admin adds it)
 *   - The per-card "Download certificate" button is GONE — Phase 3
 *     replaces it with a "Réclamations" workflow when student claims
 *     reach the certificate (if admin added it as a catalog reward)
 *
 * What's PRESERVED:
 *   - Critical alert banner listing flagged students by name
 *   - Sort-critical-to-top
 *   - Optimistic ±1 with floor/ceiling clamping + tooltips
 *   - Animated tier badge transitions via framer-motion layout
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, Minus, Plus, Info, AlertTriangle, Crown } from 'lucide-react'
import { useClasses } from '@/hooks/useClasses'
import { useEleves } from '@/hooks/useEleves'
import {
  useAdjustCivisme,
  civismeTier,
  CIVISME_FLOOR,
  CIVISME_CEILING,
  TIER_METADATA,
  formatCivismePoints,
  type CivismeTier,
} from '@/hooks/useCivisme'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReportIncidentModal } from '@/routes/_shared/civisme/ReportIncidentModal'
import { cn } from '@/lib/cn'
import { nomClasse } from '@/lib/benin'
import type { Eleve } from '@/types/models'

export function ElevesSection() {
  const [classeId, setClasseId] = useState('')
  const { data: classes = [] } = useClasses()
  const { data: eleves = [], isLoading: loadingEleves } = useEleves(
    classeId || undefined
  )

  const sortedEleves = useMemo(() => {
    return [...eleves].sort((a, b) => {
      const aP = a.civismePoints ?? 0
      const bP = b.civismePoints ?? 0
      const aCrit = aP < 0
      const bCrit = bP < 0
      if (aCrit && !bCrit) return -1
      if (!aCrit && bCrit) return 1
      return (a.nom || '').localeCompare(b.nom || '', 'fr')
    })
  }, [eleves])

  const classesSorted = useMemo(
    () =>
      [...classes].sort((a, b) =>
        nomClasse(a).toLowerCase().localeCompare(nomClasse(b).toLowerCase(), 'fr')
      ),
    [classes]
  )

  // Aggregate stats — only 3 in v3, simpler.
  const stats = useMemo(() => {
    if (!classeId || eleves.length === 0) return null
    const points = eleves.map((e) => e.civismePoints ?? 0)
    const critical = points.filter((p) => p < 0).length
    const total = points.reduce((s, p) => s + p, 0)
    const moyenne = Math.round((total / points.length) * 10) / 10
    const meilleur = Math.max(...points)
    return { critical, moyenne, meilleur, total: eleves.length }
  }, [classeId, eleves])

  const criticalStudents = useMemo(
    () => sortedEleves.filter((e) => (e.civismePoints ?? 0) < 0),
    [sortedEleves]
  )

  return (
    <Section>
      <SectionHeader
        title="Civisme par élève"
        description={`Soldes cumulatifs et ajustements manuels. Plage : ${CIVISME_FLOOR} à ${CIVISME_CEILING} pts.`}
      />

      <Select
        label="Classe"
        value={classeId}
        onChange={(e) => setClasseId(e.target.value)}
        containerClassName="mb-4"
      >
        <option value="">-- Sélectionnez une classe --</option>
        {classesSorted.map((c) => (
          <option key={c.id} value={c.id}>
            {nomClasse(c)}
          </option>
        ))}
      </Select>

      {classeId && stats && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatChip
              label="Critiques"
              value={String(stats.critical)}
              tone="critical"
              hint="Solde < 0"
            />
            <StatChip
              label="Moyenne"
              value={`${stats.moyenne}`}
              tone="neutral"
              hint={`${stats.total} él.`}
            />
            <StatChip
              label="Meilleur"
              value={String(stats.meilleur)}
              tone="success"
              hint="pts"
            />
          </div>

          {criticalStudents.length > 0 && (
            <CriticalBanner students={criticalStudents} />
          )}
        </>
      )}

      {!classeId ? (
        <EmptyState
          icon={<Award className="h-8 w-8" />}
          title="Sélectionnez une classe"
          description="Choisissez une classe pour consulter les soldes de civisme et ajuster les points manuellement."
        />
      ) : loadingEleves ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : sortedEleves.length === 0 ? (
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="Aucun élève"
          description="Cette classe n'a pas encore d'élèves inscrits."
        />
      ) : (
        <div className="space-y-2">
          {sortedEleves.map((e) => (
            <EleveCivismeCard key={e.id} classeId={classeId} eleve={e} />
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Critical banner ────────────────────────────────────────

function CriticalBanner({ students }: { students: Eleve[] }) {
  const names = students
    .slice(0, 3)
    .map((e) => e.nom.split(/\s+/).slice(0, 2).join(' '))
    .join(', ')
  const more = students.length > 3
    ? ` et ${students.length - 3} autre${students.length - 3 > 1 ? 's' : ''}`
    : ''

  return (
    <div className="mb-4 rounded-lg bg-danger-bg/60 border-[1.5px] border-danger/30 px-3.5 py-3 flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-danger/15">
        <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 text-[0.8rem] text-danger-dark">
        <p className="font-bold leading-tight">
          {students.length === 1
            ? '1 élève en situation critique'
            : `${students.length} élèves en situation critique`}
        </p>
        <p className="mt-0.5 leading-snug text-ink-700">
          {names}
          {more}. Une intervention rapide est recommandée.
        </p>
      </div>
    </div>
  )
}

// ─── Stat chip ──────────────────────────────────────────────

function StatChip({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'success' | 'neutral' | 'critical'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-[1.5px] px-3 py-2.5 bg-white',
        tone === 'success' && 'border-success/30',
        tone === 'neutral' && 'border-ink-200',
        tone === 'critical' && 'border-danger/35'
      )}
    >
      <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-400 leading-none">
        {label}
      </p>
      <p
        className={cn(
          'font-display font-bold text-[1.15rem] leading-tight mt-1',
          tone === 'success' && 'text-success-dark',
          tone === 'neutral' && 'text-navy',
          tone === 'critical' && 'text-danger-dark'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[0.62rem] text-ink-500 mt-0.5">{hint}</p>}
    </div>
  )
}

// ─── Per-eleve card ─────────────────────────────────────────

function EleveCivismeCard({
  classeId,
  eleve,
}: {
  classeId: string
  eleve: Eleve
}) {
  const mut = useAdjustCivisme()
  const toast = useToast()
  const profil = useAuthStore((s) => s.profil)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const pts = eleve.civismePoints ?? 0
  const tier = civismeTier(pts)
  const isCritical = tier === 'critical'
  const isExemplary = tier === 'exemplary'

  async function bump(delta: 1 | -1) {
    if (delta === 1 && pts >= CIVISME_CEILING) return
    if (delta === -1 && pts <= CIVISME_FLOOR) return

    try {
      await mut.mutateAsync({
        classeId,
        eleveId: eleve.id,
        delta,
        currentValue: pts,
      })
    } catch (err) {
      console.error('[ElevesSection] update failed:', err)
      toast.error('Mise à jour impossible. Réessayez.')
    }
  }

  return (
    <motion.div
      layout
      initial={false}
      animate={{
        borderColor:
          isExemplary
            ? 'rgb(201 168 76 / 0.6)'
            : isCritical
              ? 'rgb(185 28 28 / 0.55)'
              : 'rgb(228 232 238)',
      }}
      transition={{ duration: 0.25 }}
      className={cn(
        'bg-white rounded-lg border-[1.5px] px-4 py-3',
        isExemplary && 'shadow-[0_2px_12px_-4px_rgba(201,168,76,0.3)]',
        isCritical && 'border-l-[4px] shadow-[0_2px_12px_-4px_rgba(185,28,28,0.2)]'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <p className="font-display text-[0.98rem] font-bold text-navy leading-tight truncate">
              {eleve.nom}
            </p>
            <TierPill tier={tier} />
          </div>
          <p className="text-[0.8rem] text-ink-500 mt-0.5">
            Solde :{' '}
            <span
              className={cn(
                'font-display font-bold',
                tier === 'exemplary' && 'text-gold-dark',
                tier === 'committed' && 'text-success-dark',
                tier === 'engaged' && 'text-navy',
                tier === 'neutral' && 'text-ink-600',
                tier === 'critical' && 'text-danger'
              )}
            >
              {formatCivismePoints(pts)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => bump(-1)}
            disabled={pts <= CIVISME_FLOOR || mut.isPending}
            aria-label={`Retirer un point à ${eleve.nom}`}
            title={pts <= CIVISME_FLOOR ? `Plancher atteint (${CIVISME_FLOOR})` : undefined}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-md border text-[0.95rem] font-bold transition-colors',
              'bg-danger-bg text-danger border-danger/30',
              'hover:bg-danger/15 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => bump(1)}
            disabled={pts >= CIVISME_CEILING || mut.isPending}
            aria-label={`Ajouter un point à ${eleve.nom}`}
            title={pts >= CIVISME_CEILING ? `Plafond atteint (${CIVISME_CEILING})` : undefined}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-md border text-[0.95rem] font-bold transition-colors',
              'bg-success-bg text-success-dark border-success/30',
              'hover:bg-success/15 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Incident reporting — expanded action below the main row */}
      <button
        type="button"
        onClick={() => setIncidentOpen(true)}
        disabled={!profil || pts <= CIVISME_FLOOR}
        className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[0.78rem] font-bold text-danger-dark bg-danger-bg/60 hover:bg-danger/15 transition-colors ring-1 ring-danger/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Signaler un incident
      </button>

      {profil && (
        <ReportIncidentModal
          open={incidentOpen}
          onClose={() => setIncidentOpen(false)}
          classeId={classeId}
          eleveId={eleve.id}
          eleveName={eleve.nom}
          currentBalance={pts}
          parUid={profil.id}
          parNom={profil.nom}
        />
      )}
    </motion.div>
  )
}

// ─── Tier pill (compact label next to name) ─────────────────

function TierPill({ tier }: { tier: CivismeTier }) {
  const meta = TIER_METADATA[tier]
  const styles: Record<CivismeTier, string> = {
    critical: 'bg-danger text-white',
    neutral: 'bg-ink-100 text-ink-600',
    engaged: 'bg-navy/10 text-navy',
    committed: 'bg-success-bg text-success-dark',
    exemplary: 'bg-gold-pale text-gold-dark ring-1 ring-gold/40',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider shrink-0',
        styles[tier]
      )}
    >
      {tier === 'exemplary' && <Crown className="h-2.5 w-2.5" aria-hidden />}
      {meta.label}
    </span>
  )
}

/**
 * RT-SC · Prof Civisme — Incidents section.
 *
 * Lets a prof report an incident for one of their own students (any
 * classe in profil.classesIds). Admin can report for any student; a
 * prof is restricted to their classes by UI scope. Firestore rules
 * already allow any staff to write civismeHistory, so the backend
 * enforces staff-only but not the classe-ownership constraint —
 * that's enforced here in the UI.
 *
 * Layout:
 *   - Classe selector (only profil.classesIds)
 *   - Student list for the picked classe
 *   - Each row: name, solde, tier pill, "Signaler" button
 *   - "Signaler" → ReportIncidentModal (shared with admin)
 *
 * Design decision: NO ±1 buttons here. That's admin-only — profs
 * are specifically meant to report incidents through the structured
 * flow (motif + point count), not bump points freely. This keeps
 * the audit trail consistent.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, School as SchoolIcon, Info } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { elevesCol } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import {
  civismeTier,
  CIVISME_FLOOR,
  formatCivismePoints,
  TIER_METADATA,
  type CivismeTier,
} from '@/hooks/useCivisme'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReportIncidentModal } from '@/routes/_shared/civisme/ReportIncidentModal'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Eleve } from '@/types/models'

export function IncidentsProfSection() {
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [] } = useClasses()

  // Scope to classes where the prof is assigned
  const myClassIds = useMemo(
    () => new Set(profil?.classesIds ?? []),
    [profil?.classesIds]
  )
  const myClasses = useMemo(
    () => allClasses.filter((c) => myClassIds.has(c.id)),
    [allClasses, myClassIds]
  )

  const [classeId, setClasseId] = useState('')
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [loadingEleves, setLoadingEleves] = useState(false)
  const [reportTarget, setReportTarget] = useState<Eleve | null>(null)

  // Load eleves when classe changes. One-shot getDocs (not live) — a
  // prof using this tab refreshes on submit naturally via toast success
  // and the modal reopens recompute triggers a re-read.
  useEffect(() => {
    if (!classeId) {
      setEleves([])
      return
    }
    let cancelled = false
    setLoadingEleves(true)
    getDocs(collection(db, elevesCol(classeId)))
      .then((snap) => {
        if (cancelled) return
        const list: Eleve[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Eleve, 'id'>),
        }))
        setEleves(list)
      })
      .catch((err) => {
        console.error('[IncidentsProfSection] load eleves failed:', err)
      })
      .finally(() => {
        if (!cancelled) setLoadingEleves(false)
      })
    return () => {
      cancelled = true
    }
  }, [classeId])

  // After submitting, reload the list so the updated solde is visible
  function handleModalClose() {
    setReportTarget(null)
    if (classeId) {
      getDocs(collection(db, elevesCol(classeId)))
        .then((snap) => {
          const list: Eleve[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Eleve, 'id'>),
          }))
          setEleves(list)
        })
        .catch((err) =>
          console.error('[IncidentsProfSection] post-modal reload:', err)
        )
    }
  }

  const sortedEleves = useMemo(
    () => [...eleves].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [eleves]
  )

  if (!profil) return null

  if (myClasses.length === 0) {
    return (
      <Section>
        <SectionHeader
          title="Incidents"
          description="Signalez un comportement problématique pour vos élèves."
        />
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="Aucune classe assignée"
          description="Vous n'êtes affecté à aucune classe. Contactez l'administration pour recevoir vos affectations."
        />
      </Section>
    )
  }

  return (
    <Section>
      <SectionHeader
        title="Incidents"
        description="Signalez un comportement problématique pour un élève de vos classes. L'élève et ses parents verront le motif dans leur historique."
      />

      <div className="mb-4">
        <Select
          label="Classe"
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          leading={<SchoolIcon className="h-4 w-4" aria-hidden />}
        >
          <option value="">-- Choisir une classe --</option>
          {myClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {nomClasse(c)}
            </option>
          ))}
        </Select>
      </div>

      {!classeId ? (
        <EmptyState
          icon={<SchoolIcon className="h-8 w-8" />}
          title="Sélectionnez une classe"
          description="Choisissez une classe pour voir la liste de vos élèves."
        />
      ) : loadingEleves ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : sortedEleves.length === 0 ? (
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="Classe vide"
          description="Aucun élève inscrit dans cette classe."
        />
      ) : (
        <div className="space-y-2">
          {sortedEleves.map((e) => (
            <EleveRow
              key={e.id}
              eleve={e}
              onReport={() => setReportTarget(e)}
            />
          ))}
        </div>
      )}

      {reportTarget && (
        <ReportIncidentModal
          open={Boolean(reportTarget)}
          onClose={handleModalClose}
          classeId={classeId}
          eleveId={reportTarget.id}
          eleveName={reportTarget.nom}
          currentBalance={reportTarget.civismePoints ?? 0}
          parUid={profil.id}
          parNom={profil.nom}
        />
      )}
    </Section>
  )
}

// ─── Per-eleve row ──────────────────────────────────────────

function EleveRow({
  eleve,
  onReport,
}: {
  eleve: Eleve
  onReport: () => void
}) {
  const pts = eleve.civismePoints ?? 0
  const tier = civismeTier(pts)
  const isCritical = tier === 'critical'
  const atFloor = pts <= CIVISME_FLOOR

  return (
    <div
      className={cn(
        'bg-white rounded-lg border-[1.5px] px-4 py-3 flex items-center gap-3',
        isCritical
          ? 'border-danger/40 border-l-[4px]'
          : 'border-ink-100'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display text-[0.95rem] font-bold text-navy leading-tight truncate">
            {eleve.nom}
          </p>
          <TierPill tier={tier} />
        </div>
        <p className="text-[0.78rem] text-ink-500 mt-0.5">
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
      <button
        type="button"
        onClick={onReport}
        disabled={atFloor}
        title={
          atFloor
            ? `Plancher atteint (${CIVISME_FLOOR}) — plus aucune déduction possible`
            : undefined
        }
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[0.78rem] font-bold text-danger-dark bg-danger-bg/70 hover:bg-danger/15 transition-colors ring-1 ring-danger/25 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Signaler
      </button>
    </div>
  )
}

// ─── Tier pill ──────────────────────────────────────────────

function TierPill({ tier }: { tier: CivismeTier }) {
  const meta = TIER_METADATA[tier]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full text-[0.62rem] font-bold uppercase tracking-wider px-1.5 py-0.5 shrink-0',
        tier === 'exemplary' && 'bg-gold-pale text-gold-dark ring-1 ring-gold/30',
        tier === 'committed' && 'bg-success-bg text-success-dark ring-1 ring-success/30',
        tier === 'engaged' && 'bg-navy/10 text-navy ring-1 ring-navy/20',
        tier === 'neutral' && 'bg-ink-100 text-ink-600',
        tier === 'critical' && 'bg-danger-bg text-danger ring-1 ring-danger/30'
      )}
    >
      {meta.label}
    </span>
  )
}

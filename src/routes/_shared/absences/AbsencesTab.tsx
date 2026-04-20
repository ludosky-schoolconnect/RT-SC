/**
 * RT-SC · Mes absences (shared between élève and parent).
 *
 * Read-only history of self-declared absences. Drives the "Déclarer une
 * absence" button which mounts ModalDeclareAbsence.
 *
 * Future: 5d.2c will merge in prof-marked absences from /presences for a
 * unified timeline. For now this shows ONLY self-declared events, which
 * matches the legacy SC behavior.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Calendar, CalendarOff, Plus, Clock, FileText,
  CheckCircle2, XCircle, Hourglass,
} from 'lucide-react'

import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

import { useEleveAbsences } from '@/hooks/useEleveAbsences'
import { cn } from '@/lib/cn'
import { ModalDeclareAbsence } from './ModalDeclareAbsence'
import type { Absence, StatutAbsence } from '@/types/models'

interface Props {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  declaredByUid: string
  mode: 'eleve' | 'parent'
}

export function AbsencesTab({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  declaredByUid,
  mode,
}: Props) {
  const { data: absences = [], isLoading } = useEleveAbsences(classeId, eleveId)
  const [composeOpen, setComposeOpen] = useState(false)

  const firstName = (eleveName.split(/\s+/)[0] ?? eleveName).trim()

  const headerCopy =
    mode === 'parent'
      ? absences.length === 0
        ? `Aucune absence enregistrée pour ${firstName}.`
        : `${absences.length} absence${absences.length > 1 ? 's' : ''} pour ${firstName}.`
      : absences.length === 0
        ? 'Aucune absence enregistrée.'
        : `${absences.length} absence${absences.length > 1 ? 's' : ''} déclarée${absences.length > 1 ? 's' : ''}.`

  return (
    <Section>
      <SectionHeader
        kicker="Suivi"
        title={mode === 'parent' ? 'Absences' : 'Mes absences'}
        description={headerCopy}
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => setComposeOpen(true)}
          >
            Déclarer
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : absences.length === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-10 w-10" />}
          title={
            mode === 'parent'
              ? `Aucune absence pour ${firstName}`
              : 'Aucune absence'
          }
          description={
            mode === 'parent'
              ? "Si votre enfant doit s'absenter, déclarez-le ici à l'avance."
              : "Si tu dois t'absenter, déclare-le ici à l'avance pour prévenir tes professeurs."
          }
          action={
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => setComposeOpen(true)}
            >
              Déclarer une absence
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {absences.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: Math.min(i * 0.02, 0.2) },
              }}
            >
              <AbsenceRow absence={a} />
            </motion.div>
          ))}
        </div>
      )}

      <ModalDeclareAbsence
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        classeId={classeId}
        classeNom={classeNom}
        eleveId={eleveId}
        eleveName={eleveName}
        declaredByUid={declaredByUid}
        mode={mode}
      />
    </Section>
  )
}

// ─── AbsenceRow ────────────────────────────────────────────────

function AbsenceRow({ absence }: { absence: Absence }) {
  const dateStr = formatDateFR(absence.date)
  const sourceTag =
    absence.source === 'parent'
      ? 'Déclarée par parent'
      : absence.source === 'appel_prof'
        ? 'Marquée par prof'
        : 'Auto-déclarée'

  return (
    <article
      className={cn(
        'rounded-lg border bg-white p-3.5 shadow-sm',
        'border-ink-100'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-md bg-warning-bg text-warning ring-1 ring-warning/20">
          <Calendar className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h4 className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
              {dateStr}
            </h4>
            <StatutBadge statut={absence.statut} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[0.78rem] text-ink-500 flex-wrap">
            {(absence.heureDebut || absence.heureFin) && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                <span className="font-mono">
                  {absence.heureDebut ?? '?'}–{absence.heureFin ?? '?'}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" aria-hidden />
              {sourceTag}
            </span>
          </div>
          <p className="mt-2 text-[0.85rem] text-ink-700 whitespace-pre-wrap break-words">
            {absence.raison}
          </p>
        </div>
      </div>
    </article>
  )
}

// ─── Statut badge ──────────────────────────────────────────────

function StatutBadge({ statut }: { statut: StatutAbsence }) {
  if (statut === 'validée') {
    return (
      <Badge variant="success" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" />}>
        Validée
      </Badge>
    )
  }
  if (statut === 'refusée') {
    return (
      <Badge variant="danger" size="sm" leadingIcon={<XCircle className="h-3 w-3" />}>
        Refusée
      </Badge>
    )
  }
  return (
    <Badge variant="warning" size="sm" leadingIcon={<Hourglass className="h-3 w-3" />}>
      En attente
    </Badge>
  )
}

// ─── Date helper ──────────────────────────────────────────────

function formatDateFR(ts: { toDate?: () => Date } | Date | undefined): string {
  if (!ts) return '—'
  try {
    const d =
      ts instanceof Date
        ? ts
        : typeof ts.toDate === 'function'
          ? ts.toDate()
          : new Date(ts as unknown as string)
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return '—'
  }
}

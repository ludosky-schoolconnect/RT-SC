/**
 * RT-SC · Admin → Examens tab.
 *
 * CRUD for national-exam countdowns (BEPC, BAC, compositions blanches,
 * etc.). Writes to /ecole/examens.
 *
 * Design:
 *   - Overview banner: count + nearest countdown, urgency-colored
 *   - Add form: label + target + date (single row on desktop, stacked
 *     on mobile)
 *   - Countdown list: cards sorted chronologically, each with its own
 *     urgency tier (red ≤7d, amber ≤30d, teal beyond), delete button,
 *     and tasteful entrance animation
 *   - Empty state: illustrated, encouraging
 *
 * Visibility downstream:
 *   - Élèves in 3ème / Terminale see matching countdowns on their
 *     Accueil tab
 *   - Profs teaching at least one 3ème / Terminale class see them on
 *     their Mes classes tab
 *   - All other users never see the widget
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarClock,
  Hourglass,
  Plus,
  Trash2,
  Tag,
  Target,
  Calendar,
  GraduationCap,
} from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { cn } from '@/lib/cn'
import { useExamens, useUpdateExamens } from '@/hooks/useExamens'
import {
  cibleLabel,
  daysRemainingLabel,
  daysUntil,
  urgencyTier,
} from '@/lib/exam-utils'
import type { ExamCible, ExamCountdown } from '@/types/models'

// Stable random ID without extra deps
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function ExamensAdminTab() {
  const { data: examens = [], isLoading } = useExamens()
  const updateMut = useUpdateExamens()
  const toast = useToast()
  const confirm = useConfirm()

  // Add-form state
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [cible, setCible] = useState<ExamCible>('tous')
  const [formError, setFormError] = useState<string | null>(null)

  // Sorted chronologically, past ones relegated to the bottom visually
  const { upcoming, past } = useMemo(() => {
    const withJours = examens.map((e) => ({ ...e, j: daysUntil(e.date) }))
    const up = withJours.filter((e) => e.j >= 0).sort((a, b) => a.j - b.j)
    const pa = withJours.filter((e) => e.j < 0).sort((a, b) => b.j - a.j)
    return { upcoming: up, past: pa }
  }, [examens])

  const nearest = upcoming[0]

  async function handleAdd() {
    setFormError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setFormError('Donnez un nom à l’examen.')
      return
    }
    if (!date) {
      setFormError('Choisissez une date.')
      return
    }

    const next: ExamCountdown[] = [
      ...examens,
      { id: newId(), label: trimmed, date, cible },
    ]

    try {
      await updateMut.mutateAsync(next)
      toast.success(`"${trimmed}" ajouté.`)
      setLabel('')
      setDate('')
      setCible('tous')
    } catch (err) {
      console.error('[examens] add error:', err)
      toast.error("Erreur lors de l'enregistrement.")
    }
  }

  async function handleDelete(exam: ExamCountdown) {
    const ok = await confirm({
      title: 'Supprimer cet examen ?',
      message: `« ${exam.label} » ne sera plus affiché aux élèves ni aux professeurs.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return

    const next = examens.filter((e) => e.id !== exam.id)
    try {
      await updateMut.mutateAsync(next)
      toast.success(`"${exam.label}" supprimé.`)
    } catch (err) {
      console.error('[examens] delete error:', err)
      toast.error('Erreur lors de la suppression.')
    }
  }

  return (
    <Section>
      <SectionHeader
        kicker="Pédagogie"
        title="Examens nationaux"
        description="Définissez les dates du BEPC, du BAC et des examens blancs. Les élèves de 3ème et Terminale (ainsi que leurs professeurs) verront un compte à rebours sur leur accueil."
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overview banner — hero stat row */}
          <OverviewBanner
            total={examens.length}
            upcomingCount={upcoming.length}
            nearest={nearest}
          />

          {/* Add new exam */}
          <Card accent>
            <CardHeader>
              <div>
                <CardTitle>Ajouter un examen</CardTitle>
                <CardDescription>
                  Exemple : « BEPC 2026 », cible « 3ème », date 1 juin 2026.
                </CardDescription>
              </div>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2.5 items-end">
              <Field
                label="Nom de l'examen"
                icon={<Tag className="h-3.5 w-3.5" />}
              >
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="BEPC 2026"
                  maxLength={60}
                />
              </Field>

              <Field
                label="Cible"
                icon={<Target className="h-3.5 w-3.5" />}
              >
                <CibleSelect value={cible} onChange={setCible} />
              </Field>

              <Field
                label="Date"
                icon={<Calendar className="h-3.5 w-3.5" />}
              >
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>

              <Button
                onClick={handleAdd}
                loading={updateMut.isPending}
                leadingIcon={<Plus className="h-4 w-4" />}
                className="sm:self-end"
              >
                Ajouter
              </Button>
            </div>

            {formError && (
              <p className="mt-3 text-[0.8rem] text-danger-dark bg-danger-bg/60 border border-danger/20 rounded-md px-3 py-2">
                {formError}
              </p>
            )}
          </Card>

          {/* Upcoming list */}
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-500 mb-2 px-1">
              À venir
              {upcoming.length > 0 && (
                <span className="ml-1 text-ink-400 font-medium">
                  · {upcoming.length}
                </span>
              )}
            </p>

            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-10 w-10" />}
                title="Aucun examen programmé"
                description="Ajoutez la date du prochain BEPC ou BAC pour afficher un compte à rebours aux élèves de 3ème et Terminale."
              />
            ) : (
              <div className="space-y-2.5">
                <AnimatePresence mode="popLayout">
                  {upcoming.map((e, idx) => (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25, delay: idx * 0.05 }}
                    >
                      <ExamRow
                        exam={e}
                        jours={e.j}
                        highlighted={idx === 0}
                        onDelete={() => handleDelete(e)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Past list — collapsed appearance, kept for audit */}
          {past.length > 0 && (
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-400 mb-2 px-1">
                Passés
                <span className="ml-1 text-ink-400 font-medium">
                  · {past.length}
                </span>
              </p>
              <div className="space-y-2">
                {past.map((e) => (
                  <ExamRow
                    key={e.id}
                    exam={e}
                    jours={e.j}
                    past
                    onDelete={() => handleDelete(e)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ──────────────────────────────────────────────────────────────

function OverviewBanner({
  total,
  upcomingCount,
  nearest,
}: {
  total: number
  upcomingCount: number
  nearest: (ExamCountdown & { j: number }) | undefined
}) {
  // Urgency-tinted gradient when there's a nearest exam
  const tier = nearest ? urgencyTier(nearest.j) : 'calm'
  const bg = {
    critical: 'from-danger-bg/80 to-danger-bg/30',
    warning: 'from-warning-bg/80 to-warning-bg/30',
    calm: 'from-success-bg/60 to-success-bg/20',
  }[tier]
  const accent = {
    critical: 'text-danger-dark',
    warning: 'text-warning',
    calm: 'text-success-dark',
  }[tier]

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-gradient-to-br from-ink-50/80 to-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center text-ink-400">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-navy text-[0.95rem]">
              Aucun examen configuré
            </p>
            <p className="text-[0.8rem] text-ink-500 mt-0.5">
              Ajoutez un premier examen pour activer les comptes à rebours.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-100 bg-gradient-to-br p-5 sm:p-6',
        bg
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'shrink-0 w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center',
            accent
          )}
        >
          <Hourglass className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-ink-500 mb-1">
            Compte à rebours
          </p>
          {nearest ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                <h3 className="font-display text-[1.35rem] sm:text-[1.5rem] font-bold text-navy leading-tight">
                  {nearest.label}
                </h3>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500 bg-white/70 rounded px-1.5 py-0.5">
                  {cibleLabel(nearest.cible)}
                </span>
              </div>
              <p className={cn('text-[0.9rem] font-semibold', accent)}>
                {daysRemainingLabel(nearest.j)}
              </p>
              <p className="text-[0.78rem] text-ink-500 mt-1.5">
                {upcomingCount} examen{upcomingCount > 1 ? 's' : ''} programmé
                {upcomingCount > 1 ? 's' : ''}
                {total > upcomingCount &&
                  ` · ${total - upcomingCount} passé${total - upcomingCount > 1 ? 's' : ''}`}
                .
              </p>
            </>
          ) : (
            <>
              <h3 className="font-display text-[1.2rem] font-bold text-navy leading-tight">
                Pas d'examen à venir
              </h3>
              <p className="text-[0.78rem] text-ink-500 mt-1">
                Tous les examens configurés sont passés.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────

function ExamRow({
  exam,
  jours,
  highlighted,
  past,
  onDelete,
}: {
  exam: ExamCountdown
  jours: number
  highlighted?: boolean
  past?: boolean
  onDelete: () => void
}) {
  const tier = past ? null : urgencyTier(jours)

  const ring = past
    ? 'ring-ink-100'
    : {
        critical: 'ring-danger/30',
        warning: 'ring-warning/30',
        calm: 'ring-success/25',
      }[tier!]

  const highlightRing = highlighted && !past ? 'ring-2 ring-gold/50' : ring

  const iconColor = past
    ? 'text-ink-400'
    : {
        critical: 'text-danger-dark',
        warning: 'text-warning',
        calm: 'text-success-dark',
      }[tier!]

  const badgeBg = past
    ? 'bg-ink-100 text-ink-500'
    : {
        critical: 'bg-danger text-white',
        warning: 'bg-warning text-white',
        calm: 'bg-success text-white',
      }[tier!]

  const formattedDate = useMemo(() => {
    try {
      return new Date(exam.date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    } catch {
      return exam.date
    }
  }, [exam.date])

  return (
    <div
      className={cn(
        'rounded-xl bg-white p-3.5 sm:p-4 ring-1 transition-shadow',
        highlightRing,
        past && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center',
            iconColor
          )}
          aria-hidden
        >
          <Hourglass className="h-4.5 w-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-semibold text-navy text-[0.95rem] leading-tight">
              {exam.label}
            </h4>
            <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-500 bg-ink-100 rounded px-1.5 py-0.5">
              {cibleLabel(exam.cible)}
            </span>
            {highlighted && !past && (
              <span className="text-[0.62rem] font-bold uppercase tracking-wider text-gold-dark bg-gold-pale rounded px-1.5 py-0.5">
                Prochain
              </span>
            )}
          </div>
          <p className="text-[0.78rem] text-ink-500 capitalize">
            {formattedDate}
          </p>
          <div
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold mt-1.5',
              badgeBg
            )}
          >
            {past
              ? `passé depuis ${Math.abs(jours)} j`
              : daysRemainingLabel(jours)}
          </div>
        </div>

        <IconButton
          variant="danger"
          aria-label={`Supprimer ${exam.label}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-ink-600 mb-1 px-0.5">
        <span className="text-ink-400" aria-hidden>
          {icon}
        </span>
        {label}
      </span>
      {children}
    </label>
  )
}

function CibleSelect({
  value,
  onChange,
}: {
  value: ExamCible
  onChange: (v: ExamCible) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ExamCible)}
      className={cn(
        'w-full rounded-md border border-ink-200 bg-white px-3 py-2.5',
        'text-[0.9rem] text-ink-800 font-medium',
        'focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy/50',
        'transition-colors'
      )}
    >
      <option value="tous">3ème &amp; Terminale</option>
      <option value="3eme">3ème uniquement</option>
      <option value="terminale">Terminale uniquement</option>
    </select>
  )
}

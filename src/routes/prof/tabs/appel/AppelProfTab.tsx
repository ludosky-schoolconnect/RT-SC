/**
 * RT-SC · Prof → Appel tab.
 *
 * The entry point for taking attendance. Two modes:
 *
 *   1. SMART  — When a séance is currently running for this prof, that
 *               séance is the hero of the screen. One big "Faire l'appel"
 *               button starts the roll call pre-loaded with the right
 *               class + matière + seance reference. This is the 95% case.
 *
 *   2. MANUAL — Below the smart hero (or as the only content if nothing
 *               is running), a picker lets the prof choose any class +
 *               matière they teach to take a catch-up appel for today.
 *
 * Tapping into either mode mounts the AppelScreen (full-screen takeover
 * with its own header). Returning from AppelScreen drops back here.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ClipboardCheck, Clock, Calendar, ChevronRight,
} from 'lucide-react'

import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

import { useAuthStore } from '@/stores/auth'
import { useAllSeances } from '@/hooks/useSeances'
import { useClasses } from '@/hooks/useClasses'

import {
  currentJour,
  currentMinutes,
  isSeanceNow,
  parseHHMM,
} from '@/lib/seances'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'

import { AppelScreen } from './AppelScreen'
import type { Seance } from '@/types/models'

interface AppelChoice {
  classeId: string
  classeNom: string
  matiere: string
  seanceId?: string
}

export function AppelProfTab() {
  const user = useAuthStore((s) => s.user)
  const profil = useAuthStore((s) => s.profil)
  const { data: classes = [] } = useClasses()
  const { data: allSeances = [], isLoading: loadingSeances } = useAllSeances()

  // Prof's séances
  const mySeances = useMemo(
    () => (user?.uid ? allSeances.filter((s) => s.profId === user.uid) : []),
    [allSeances, user?.uid]
  )

  // Currently running séances (could be more than one if overlapping)
  const enCours = useMemo(
    () => mySeances.filter((s) => isSeanceNow(s)),
    [mySeances]
  )

  // Next séance today (after now), if any
  const nextToday = useMemo(() => {
    const today = currentJour()
    if (!today) return null
    const nowMin = currentMinutes()
    const todays = mySeances
      .filter((s) => s.jour === today && parseHHMM(s.heureDebut) > nowMin)
      .sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
    return todays[0] ?? null
  }, [mySeances])

  // Today's already-taken séances (chronological order, before now)
  const earlierToday = useMemo(() => {
    const today = currentJour()
    if (!today) return []
    const nowMin = currentMinutes()
    return mySeances
      .filter((s) => s.jour === today && parseHHMM(s.heureFin) <= nowMin)
      .sort((a, b) => parseHHMM(a.heureDebut) - parseHHMM(b.heureDebut))
  }, [mySeances])

  // Classes the prof teaches (for the manual picker)
  const teachingClasses = useMemo(
    () => classes.filter((c) => profil?.classesIds?.includes(c.id)),
    [classes, profil?.classesIds]
  )

  // Manual picker state
  const [manualClasseId, setManualClasseId] = useState<string>('')
  const [manualMatiere, setManualMatiere] = useState<string>('')
  const profMatieres = profil?.matieres ?? []

  // Auto-fill matière if prof has only one
  const effectiveMatiere =
    profMatieres.length === 1 ? profMatieres[0] : manualMatiere

  // Active appel
  const [active, setActive] = useState<AppelChoice | null>(null)

  function classeNomById(id: string): string {
    const c = classes.find((x) => x.id === id)
    return c ? nomClasse(c) : id
  }

  function startAppel(choice: AppelChoice) {
    setActive(choice)
  }

  function startFromSeance(s: Seance) {
    startAppel({
      classeId: s.classeId,
      classeNom: classeNomById(s.classeId),
      matiere: s.matiere,
      seanceId: s.id,
    })
  }

  function startManual() {
    if (!manualClasseId || !effectiveMatiere) return
    startAppel({
      classeId: manualClasseId,
      classeNom: classeNomById(manualClasseId),
      matiere: effectiveMatiere,
    })
  }

  // ─── Full-screen takeover when an appel is active ──────────
  if (active) {
    return (
      <AppelScreen
        classeId={active.classeId}
        classeNom={active.classeNom}
        matiere={active.matiere}
        seanceId={active.seanceId}
        onClose={() => setActive(null)}
      />
    )
  }

  // ─── Lobby render ──────────────────────────────────────────
  if (loadingSeances) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <Section>
      <SectionHeader
        kicker="Présences"
        title="Faire l'appel"
        description={
          enCours.length > 0
            ? "Vous avez un cours en ce moment — l'appel est prêt à être pris."
            : nextToday
              ? `Prochain cours : ${nextToday.matiere} à ${nextToday.heureDebut}.`
              : earlierToday.length > 0
                ? "Vos cours d'aujourd'hui sont terminés."
                : 'Aucun cours programmé pour vous aujourd\'hui.'
        }
      />

      {/* HERO — currently running séance(s) */}
      {enCours.length > 0 && (
        <div className="space-y-3 mb-6">
          {enCours.map((s) => (
            <HeroEnCoursCard
              key={s.id}
              seance={s}
              classeNom={classeNomById(s.classeId)}
              onStart={() => startFromSeance(s)}
            />
          ))}
        </div>
      )}

      {/* NEXT — upcoming today */}
      {enCours.length === 0 && nextToday && (
        <div className="mb-6">
          <NextSeanceCard
            seance={nextToday}
            classeNom={classeNomById(nextToday.classeId)}
            onStartEarly={() => startFromSeance(nextToday)}
          />
        </div>
      )}

      {/* EARLIER TODAY — quick re-take for already-passed séances */}
      {earlierToday.length > 0 && (
        <div className="mb-6">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1 mb-2">
            Plus tôt aujourd'hui
          </p>
          <div className="space-y-2">
            {earlierToday.map((s) => (
              <PassedSeanceRow
                key={s.id}
                seance={s}
                classeNom={classeNomById(s.classeId)}
                onTake={() => startFromSeance(s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* MANUAL — fallback class/matière picker */}
      <div className="mt-6">
        <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1 mb-3">
          Appel manuel
        </p>
        {teachingClasses.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-10 w-10" />}
            title="Aucune classe assignée"
            description="Demandez à la direction de vous attribuer au moins une classe."
          />
        ) : (
          <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-3">
            <Select
              label="Classe"
              value={manualClasseId}
              onChange={(e) => setManualClasseId(e.target.value)}
            >
              <option value="">— Choisir une classe —</option>
              {teachingClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomClasse(c)}
                </option>
              ))}
            </Select>

            {profMatieres.length >= 2 && (
              <Select
                label="Matière"
                value={manualMatiere}
                onChange={(e) => setManualMatiere(e.target.value)}
              >
                <option value="">— Choisir la matière —</option>
                {profMatieres.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
            {profMatieres.length === 1 && (
              <div className="rounded-md bg-ink-50/50 border border-ink-100 px-3 py-2 text-[0.82rem]">
                <span className="font-semibold text-ink-700">Matière :</span>{' '}
                <span className="text-ink-800">{profMatieres[0]}</span>
                <p className="text-[0.7rem] text-ink-400 mt-0.5">
                  Dérivée de votre profil.
                </p>
              </div>
            )}

            <Button
              variant="primary"
              fullWidth
              leadingIcon={<ClipboardCheck className="h-4 w-4" />}
              disabled={!manualClasseId || !effectiveMatiere}
              onClick={startManual}
            >
              Commencer l'appel
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Hero "En cours" card ──────────────────────────────────────

function HeroEnCoursCard({
  seance,
  classeNom,
  onStart,
}: {
  seance: Seance
  classeNom: string
  onStart: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'rounded-2xl p-5 ring-2 ring-success/30',
        'bg-gradient-to-br from-success-bg via-success-bg/60 to-white',
        'shadow-[0_4px_20px_-4px_rgba(26,127,75,0.25)]'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success text-white">
            <ClipboardCheck className="h-5 w-5" aria-hidden />
          </div>
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success animate-pulse ring-2 ring-white"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.7rem] font-bold uppercase tracking-wider text-success">
            En cours
          </div>
          <h3 className="font-display text-xl font-bold text-navy mt-0.5 leading-tight">
            {seance.matiere}
          </h3>
          <p className="text-[0.85rem] text-ink-600 mt-1">
            {classeNom} ·{' '}
            <span className="font-mono">
              {seance.heureDebut}–{seance.heureFin}
            </span>
            {seance.salle && <> · Salle {seance.salle}</>}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Button
          variant="primary"
          fullWidth
          leadingIcon={<ClipboardCheck className="h-4 w-4" />}
          onClick={onStart}
        >
          Faire l'appel
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Next séance card ──────────────────────────────────────────

function NextSeanceCard({
  seance,
  classeNom,
  onStartEarly,
}: {
  seance: Seance
  classeNom: string
  onStartEarly: () => void
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
          <Clock className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.68rem] font-bold uppercase tracking-wider text-warning">
            Prochain cours
          </div>
          <h3 className="font-display text-[1.1rem] font-bold text-navy mt-0.5 leading-tight">
            {seance.matiere}
          </h3>
          <p className="text-[0.82rem] text-ink-600 mt-0.5">
            {classeNom} ·{' '}
            <span className="font-mono">
              {seance.heureDebut}–{seance.heureFin}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onStartEarly}
          trailingIcon={<ChevronRight className="h-4 w-4" />}
        >
          Préparer l'appel
        </Button>
      </div>
    </div>
  )
}

// ─── Earlier-today row (compact) ──────────────────────────────

function PassedSeanceRow({
  seance,
  classeNom,
  onTake,
}: {
  seance: Seance
  classeNom: string
  onTake: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTake}
      className="w-full text-left flex items-center gap-3 rounded-lg border border-ink-100 bg-white px-3 py-2.5 hover:bg-ink-50/50 transition-colors"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-100 text-ink-500">
        <Calendar className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.88rem] font-semibold text-ink-800 truncate">
          {seance.matiere}
        </div>
        <div className="text-[0.72rem] text-ink-500 truncate">
          {classeNom} · {seance.heureDebut}–{seance.heureFin}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" aria-hidden />
    </button>
  )
}

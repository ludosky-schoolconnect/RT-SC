/**
 * RT-SC · Appel screen.
 *
 * The actual roll-call UI. Given a (classeId, matiere, optional seance),
 * loads the class roster + any existing presence slot for that day/matière,
 * lets the prof toggle each student between Présent / Retard / Absent,
 * and saves the whole batch on commit.
 *
 * Default state = Présent for everyone. The prof only flips students who
 * aren't there. Less typing on a 50-student class.
 *
 * If the slot was already saved earlier (pris_par exists), the screen still
 * loads the existing marks so the prof can amend. The "Déjà pris par X"
 * banner makes that visible.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, Check, Clock, Search, X, Save,
  AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

import { useEleves } from '@/hooks/useEleves'
import { usePresenceDoc } from '@/hooks/usePresence'
import {
  useSaveAppel,
  todayISO,
  nowHHMM,
} from '@/hooks/usePresenceMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

import { cn } from '@/lib/cn'
import { safeMatiereId } from '@/lib/benin'
import type {
  AbsentMark,
  RetardMark,
  PresenceSlot,
} from '@/types/models'

type Etat = 'present' | 'retard' | 'absent'

interface Props {
  classeId: string
  classeNom: string
  matiere: string
  /** Optional reference: the séance this appel belongs to. */
  seanceId?: string
  /** Optional: a date other than today (catch-up appel). Default = today. */
  dateISO?: string
  /** Back navigation — usually unmount the appel screen. */
  onClose: () => void
}

export function AppelScreen({
  classeId,
  classeNom,
  matiere,
  seanceId,
  dateISO: dateISOProp,
  onClose,
}: Props) {
  const dateISO = dateISOProp ?? todayISO()
  const matiereSlug = useMemo(() => safeMatiereId(matiere), [matiere])

  const { data: eleves = [], isLoading: loadingEleves } = useEleves(classeId)
  const { data: presenceDoc } = usePresenceDoc(classeId, dateISO)
  const saveMut = useSaveAppel()
  const toast = useToast()
  const confirm = useConfirm()

  const existingSlot: PresenceSlot | undefined = presenceDoc?.[matiereSlug]
  const dejaPris = !!existingSlot?.pris_par

  // Lock body scroll while the appel is mounted — without this, the
  // dashboard underneath can scroll and bleeds through behind our
  // overlay. Restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ── Local marks (everyone defaults to present) ──────────────
  const [marks, setMarks] = useState<Map<string, Etat>>(new Map())
  // Per-élève raison string (only meaningful when state is 'absent').
  // Empty string = "raison non précisée"; non-empty = saved verbatim.
  const [raisons, setRaisons] = useState<Map<string, string>>(new Map())
  const [seedFromSlotId, setSeedFromSlotId] = useState<string | null>(null)

  // Hydrate from existing slot once élèves arrive (or when slot itself
  // changes via snapshot, e.g. another prof edited concurrently).
  useEffect(() => {
    if (loadingEleves) return
    const sig = `${dateISO}-${matiereSlug}-${existingSlot?.pris_a?.toMillis?.() ?? 'fresh'}`
    if (sig === seedFromSlotId) return

    const nextMarks = new Map<string, Etat>()
    const nextRaisons = new Map<string, string>()
    eleves.forEach((e) => nextMarks.set(e.id, 'present'))
    if (existingSlot) {
      Object.entries(existingSlot.absents ?? {}).forEach(([id, mark]) => {
        nextMarks.set(id, 'absent')
        // Preserve raison if present in stored doc
        if (mark?.raison) nextRaisons.set(id, mark.raison)
      })
      Object.keys(existingSlot.retards ?? {}).forEach((id) =>
        nextMarks.set(id, 'retard')
      )
    }
    setMarks(nextMarks)
    setRaisons(nextRaisons)
    setSeedFromSlotId(sig)
  }, [eleves, existingSlot, loadingEleves, dateISO, matiereSlug, seedFromSlotId])

  // Stats
  const counts = useMemo(() => {
    let absent = 0
    let retard = 0
    marks.forEach((v) => {
      if (v === 'absent') absent++
      else if (v === 'retard') retard++
    })
    const present = eleves.length - absent - retard
    return { total: eleves.length, present, absent, retard }
  }, [marks, eleves.length])

  // Search filter
  const [searchQ, setSearchQ] = useState('')
  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return eleves
    return eleves.filter((e) => e.nom.toLowerCase().includes(q))
  }, [eleves, searchQ])

  function setEtat(eleveId: string, etat: Etat) {
    setMarks((prev) => {
      const next = new Map(prev)
      next.set(eleveId, etat)
      return next
    })
    // When a student is no longer absent, drop their raison so it doesn't
    // ghost back into the save payload if they're flipped to absent again.
    if (etat !== 'absent') {
      setRaisons((prev) => {
        if (!prev.has(eleveId)) return prev
        const next = new Map(prev)
        next.delete(eleveId)
        return next
      })
    }
  }

  function setRaison(eleveId: string, raison: string) {
    setRaisons((prev) => {
      const next = new Map(prev)
      const trimmed = raison.slice(0, 40)
      if (trimmed) next.set(eleveId, trimmed)
      else next.delete(eleveId)
      return next
    })
  }

  // ── Mass actions ────────────────────────────────────────────
  function markAllPresent() {
    const next = new Map<string, Etat>()
    eleves.forEach((e) => next.set(e.id, 'present'))
    setMarks(next)
    setRaisons(new Map())
  }

  // ── Save ────────────────────────────────────────────────────
  async function handleSave() {
    // Compose the absents + retards payload
    const heure = nowHHMM()
    const absents: { [id: string]: AbsentMark } = {}
    const retards: { [id: string]: RetardMark } = {}
    eleves.forEach((e) => {
      const v = marks.get(e.id) ?? 'present'
      if (v === 'absent') {
        const r = raisons.get(e.id)?.trim()
        absents[e.id] = r
          ? { nom: e.nom, heure, raison: r }
          : { nom: e.nom, heure }
      } else if (v === 'retard') {
        retards[e.id] = { nom: e.nom, heure }
      }
    })

    // Friendly confirm if NO ONE was marked absent or late — likely a mistake
    if (Object.keys(absents).length === 0 && Object.keys(retards).length === 0) {
      const ok = await confirm({
        title: 'Tous les élèves sont présents ?',
        message:
          'Aucun élève n\'a été marqué absent ou en retard. Confirmez-vous que toute la classe est là ?',
        confirmLabel: 'Oui, tous présents',
        variant: 'info',
      })
      if (!ok) return
    }

    try {
      await saveMut.mutateAsync({
        classeId,
        dateISO,
        matiere,
        absents,
        retards,
        totalEleves: eleves.length,
        seanceId,
      })
      toast.success('Appel enregistré.')
      onClose()
    } catch (err) {
      console.error('[AppelScreen] save error:', err)
      toast.error("Échec de l'enregistrement. Vérifiez votre connexion.")
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-ink-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-navy text-white shadow-md">
        <div className="px-4 py-3 flex items-center gap-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'appel"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 transition-colors -ml-2"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[1.05rem] font-bold truncate leading-tight">
              {matiere}
            </h1>
            <p className="text-[0.72rem] text-white/70 mt-0.5 truncate">
              {classeNom} · {formatDateFR(dateISO)}
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 pb-3 flex gap-2">
          <StatPill
            color="success"
            value={counts.present}
            label="Présents"
            aria-label={`${counts.present} présents`}
          />
          <StatPill
            color="warning"
            value={counts.retard}
            label="Retards"
            aria-label={`${counts.retard} retards`}
          />
          <StatPill
            color="danger"
            value={counts.absent}
            label="Absents"
            aria-label={`${counts.absent} absents`}
          />
        </div>
      </header>

      {/* Scrollable middle */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* Already-submitted banner */}
        {dejaPris && (
          <div className="px-4 pt-3">
            <div className="rounded-md border border-info/40 bg-info-bg/50 px-3 py-2.5 text-[0.82rem] text-ink-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden />
              <div>
                <strong className="font-semibold">Déjà pris par {existingSlot?.pris_par}.</strong>{' '}
                Vous pouvez amender — l'enregistrement remplacera l'ancien.
              </div>
            </div>
          </div>
        )}

        {/* Search bar */}
        {eleves.length > 8 && (
          <div className="px-4 pt-3">
            <Input
              type="search"
              placeholder={`Rechercher parmi ${eleves.length} élèves…`}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              leading={<Search className="h-4 w-4 text-ink-400" />}
              containerClassName="!gap-1"
            />
          </div>
        )}

        {/* Quick action: reset all to present */}
        <div className="px-4 pt-3 flex justify-end">
          <button
            type="button"
            onClick={markAllPresent}
            className="text-[0.78rem] font-semibold text-navy hover:text-gold-dark transition-colors px-2 py-1 rounded !min-h-0 !min-w-0"
          >
            Réinitialiser (tous présents)
          </button>
        </div>

        {/* Élève list */}
        <div className="px-4 pt-3 pb-6 space-y-2">
          {loadingEleves ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : eleves.length === 0 ? (
            <EmptyState
              icon={<X className="h-10 w-10" />}
              title="Aucun élève"
              description="Cette classe n'a aucun élève enregistré."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="Aucun résultat"
              description={`Aucun élève ne correspond à « ${searchQ} ».`}
            />
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { delay: Math.min(i * 0.012, 0.15) },
                  }}
                >
                  <EleveAppelRow
                    nom={e.nom}
                    genre={e.genre}
                    etat={marks.get(e.id) ?? 'present'}
                    raison={raisons.get(e.id) ?? ''}
                    onChange={(etat) => setEtat(e.id, etat)}
                    onRaisonChange={(r) => setRaison(e.id, r)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Save bar (in-flow, anchored at bottom of column) */}
      <div
        className="shrink-0 bg-white border-t border-ink-100 px-4 py-3 shadow-[0_-4px_12px_-2px_rgba(11,37,69,0.08)]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0 text-[0.78rem] text-ink-500">
            <span className="font-semibold text-ink-700">{counts.present}</span>{' '}
            sur {counts.total} présent{counts.present > 1 ? 's' : ''}
            {counts.retard > 0 && (
              <>
                {' · '}
                <span className="text-warning font-semibold">{counts.retard}</span> retard{counts.retard > 1 ? 's' : ''}
              </>
            )}
            {counts.absent > 0 && (
              <>
                {' · '}
                <span className="text-danger font-semibold">{counts.absent}</span> absent{counts.absent > 1 ? 's' : ''}
              </>
            )}
          </div>
          <Button
            variant="primary"
            loading={saveMut.isPending}
            leadingIcon={<Save className="h-4 w-4" />}
            onClick={handleSave}
            disabled={loadingEleves || eleves.length === 0}
          >
            {dejaPris ? 'Mettre à jour' : "Enregistrer l'appel"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── StatPill ─────────────────────────────────────────────────

function StatPill({
  color,
  value,
  label,
  ...rest
}: {
  color: 'success' | 'warning' | 'danger'
  value: number
  label: string
  'aria-label'?: string
}) {
  const tone = {
    success: 'bg-white/15 ring-success/30 text-success',
    warning: 'bg-white/15 ring-warning/30 text-warning',
    danger: 'bg-white/15 ring-danger/30 text-danger',
  }[color]
  const labelTone = {
    success: 'text-success/80',
    warning: 'text-warning/80',
    danger: 'text-danger/80',
  }[color]
  return (
    <div
      className={cn(
        'flex-1 rounded-md ring-1 px-3 py-2 flex flex-col items-center justify-center',
        tone
      )}
      {...rest}
    >
      <div className="font-mono text-[1.1rem] font-bold leading-none">{value}</div>
      <div className={cn('text-[0.62rem] font-semibold uppercase tracking-wider mt-1', labelTone)}>
        {label}
      </div>
    </div>
  )
}

// ─── EleveAppelRow ────────────────────────────────────────────

function EleveAppelRow({
  nom,
  genre,
  etat,
  raison,
  onChange,
  onRaisonChange,
}: {
  nom: string
  genre: 'M' | 'F' | string
  etat: Etat
  raison: string
  onChange: (etat: Etat) => void
  onRaisonChange: (raison: string) => void
}) {
  const initials = nom.charAt(0).toUpperCase()
  const stripeColor =
    etat === 'absent'
      ? 'bg-danger'
      : etat === 'retard'
        ? 'bg-warning'
        : 'bg-success'

  return (
    <div
      className={cn(
        'rounded-lg border bg-white shadow-sm transition-colors overflow-hidden',
        etat === 'absent' && 'border-danger/30 bg-danger-bg/30',
        etat === 'retard' && 'border-warning/30 bg-warning-bg/30',
        etat === 'present' && 'border-ink-100'
      )}
    >
      <div className="flex items-center gap-3 pl-0 pr-2 py-2.5">
        {/* Color stripe */}
        <div className={cn('h-12 w-1 rounded-r-md ml-0', stripeColor)} aria-hidden />

        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.85rem]">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[0.92rem] font-semibold text-ink-900 truncate">
            {nom}
          </div>
          <div className="text-[0.7rem] text-ink-400">
            {genre === 'F' ? '♀' : '♂'}
          </div>
        </div>

        {/* 3-state segmented control */}
        <div
          role="radiogroup"
          aria-label={`État de présence pour ${nom}`}
          className="flex gap-1 shrink-0"
        >
          <SegmentBtn
            active={etat === 'present'}
            color="success"
            icon={<Check className="h-4 w-4" />}
            ariaLabel="Présent"
            onClick={() => onChange('present')}
          />
          <SegmentBtn
            active={etat === 'retard'}
            color="warning"
            icon={<Clock className="h-4 w-4" />}
            ariaLabel="Retard"
            onClick={() => onChange('retard')}
          />
          <SegmentBtn
            active={etat === 'absent'}
            color="danger"
            icon={<X className="h-4 w-4" />}
            ariaLabel="Absent"
            onClick={() => onChange('absent')}
          />
        </div>
      </div>

      {/* Raison input — only when marked absent */}
      {etat === 'absent' && (
        <div className="px-3 pb-3 -mt-1 flex items-stretch gap-2">
          <input
            type="text"
            value={raison}
            maxLength={40}
            onChange={(e) => onRaisonChange(e.target.value)}
            placeholder="Raison (optionnel · 40 car. max)"
            aria-label={`Raison de l'absence pour ${nom}`}
            className="flex-1 min-w-0 rounded-md border border-danger/30 bg-white/80 px-3 py-2 text-[0.85rem] text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger/50"
          />
          {raison && (
            <button
              type="button"
              onClick={() => onRaisonChange('')}
              aria-label="Effacer la raison"
              className="shrink-0 px-2 text-[0.78rem] font-semibold text-ink-500 hover:text-danger transition-colors !min-h-0 !min-w-0"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SegmentBtn({
  active,
  color,
  icon,
  ariaLabel,
  onClick,
}: {
  active: boolean
  color: 'success' | 'warning' | 'danger'
  icon: React.ReactNode
  ariaLabel: string
  onClick: () => void
}) {
  const activeTone = {
    success: 'bg-success text-white ring-success',
    warning: 'bg-warning text-white ring-warning',
    danger: 'bg-danger text-white ring-danger',
  }[color]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'h-11 w-11 inline-flex items-center justify-center rounded-md ring-1 transition-all',
        active
          ? activeTone + ' shadow-sm'
          : 'bg-white text-ink-400 ring-ink-200 hover:text-ink-700 hover:ring-ink-300'
      )}
    >
      {icon}
    </button>
  )
}

// ─── Date helper ──────────────────────────────────────────────

function formatDateFR(iso: string): string {
  // "2026-04-20" → "Lundi 20 avril 2026" (fallbacks gracefully)
  try {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return iso
  }
}

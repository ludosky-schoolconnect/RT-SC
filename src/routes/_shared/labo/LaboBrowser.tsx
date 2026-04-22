/**
 * RT-SC · LaboBrowser — shared PhET simulation catalog viewer.
 *
 * Used by both the prof Labo Virtuel tab and the student Labo widget
 * modal. Presents filter pills (subject, level) + a scrollable list
 * of simulation cards. Tapping a card opens the launcher modal with
 * the PhET HTML5 simulation embedded in an iframe.
 *
 * Content is static (local catalog, no Firestore reads). Completely
 * free at Spark tier — no rate limits beyond what PhET imposes on
 * their own servers (effectively none for this use).
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, PlayCircle } from 'lucide-react'
import {
  LABO_DATABASE,
  type LaboLevel,
  type LaboSim,
  type LaboSubject,
} from '@/data/laboDatabase'
import { cn } from '@/lib/cn'
import { LaboLauncherModal } from './LaboLauncherModal'

// ─── Filter state types ─────────────────────────────────────

type SubjectFilter = LaboSubject | 'Toutes'
type LevelFilter = LaboLevel | 'Tous niveaux'

const SUBJECT_TABS: {
  id: SubjectFilter
  label: string
  accent: string
}[] = [
  { id: 'Toutes', label: 'Toutes', accent: 'navy' },
  { id: 'Physique', label: 'Physique', accent: 'blue' },
  { id: 'Chimie', label: 'Chimie', accent: 'purple' },
  { id: 'SVT', label: 'SVT', accent: 'green' },
]

const LEVEL_TABS: { id: LevelFilter; label: string }[] = [
  { id: 'Tous niveaux', label: 'Tous' },
  { id: 'Collège', label: 'Collège' },
  { id: 'Lycée', label: 'Lycée' },
]

// Subject → color token mapping for the badge on each card.
const SUBJECT_STYLES: Record<
  LaboSubject,
  { bg: string; text: string; ring: string }
> = {
  Physique: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
  },
  Chimie: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    ring: 'ring-purple-200',
  },
  SVT: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
  },
}

// ─── Component ──────────────────────────────────────────────

export function LaboBrowser() {
  const [subject, setSubject] = useState<SubjectFilter>('Toutes')
  const [level, setLevel] = useState<LevelFilter>('Tous niveaux')
  const [openedSim, setOpenedSim] = useState<LaboSim | null>(null)

  const filtered = useMemo(() => {
    return LABO_DATABASE.filter((sim) => {
      const matchSubject = subject === 'Toutes' || sim.subject === subject
      // "Tous" sims show for any level filter (they're universal)
      const matchLevel =
        level === 'Tous niveaux' ||
        sim.level === level ||
        sim.level === 'Tous'
      return matchSubject && matchLevel
    })
  }, [subject, level])

  return (
    <div className="space-y-3">
      {/* Filter row — subject pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
        {SUBJECT_TABS.map((t) => (
          <FilterPill
            key={t.id}
            active={subject === t.id}
            onClick={() => setSubject(t.id)}
          >
            {t.label}
          </FilterPill>
        ))}
      </div>

      {/* Filter row — level pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
        {LEVEL_TABS.map((t) => (
          <FilterPill
            key={t.id}
            active={level === t.id}
            onClick={() => setLevel(t.id)}
            size="sm"
          >
            {t.label}
          </FilterPill>
        ))}
      </div>

      {/* Counter */}
      <p className="text-[0.72rem] text-ink-500 px-1">
        {filtered.length} simulation{filtered.length !== 1 ? 's' : ''}
        {filtered.length === 0
          ? ''
          : filtered.length === LABO_DATABASE.length
            ? ''
            : ` · ${LABO_DATABASE.length} au total`}
      </p>

      {/* Sim list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg bg-ink-50/60 border border-ink-100 p-6 text-center">
          <FlaskConical
            className="h-8 w-8 text-ink-400 mx-auto mb-2"
            aria-hidden
          />
          <p className="text-[0.85rem] text-ink-600 font-bold">
            Aucune simulation ne correspond.
          </p>
          <p className="text-[0.78rem] text-ink-500 mt-1">
            Essayez d'élargir les filtres.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((sim, i) => (
            <motion.li
              key={sim.url}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015, duration: 0.18 }}
            >
              <SimCard sim={sim} onClick={() => setOpenedSim(sim)} />
            </motion.li>
          ))}
        </ul>
      )}

      {/* Launcher modal */}
      <LaboLauncherModal
        sim={openedSim}
        onClose={() => setOpenedSim(null)}
      />
    </div>
  )
}

// ─── Filter pill ────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full font-bold transition-all min-h-[36px] border-[1.5px]',
        size === 'md' ? 'px-3.5 text-[0.82rem]' : 'px-3 text-[0.78rem]',
        active
          ? 'bg-navy text-white border-navy shadow-[0_2px_6px_-2px_rgba(11,37,69,0.3)]'
          : 'bg-white text-ink-700 border-ink-200 hover:border-navy/40'
      )}
    >
      {children}
    </button>
  )
}

// ─── Sim card ───────────────────────────────────────────────

function SimCard({
  sim,
  onClick,
}: {
  sim: LaboSim
  onClick: () => void
}) {
  const style = SUBJECT_STYLES[sim.subject]
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] hover:ring-navy/30 hover:shadow-[0_4px_12px_-2px_rgba(11,37,69,0.1)] active:scale-[0.995] transition-all text-left"
    >
      <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg bg-ink-50 text-[1.4rem] ring-1 ring-ink-100">
        {sim.img}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-navy text-[0.88rem] leading-tight truncate">
          {sim.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[0.66rem] font-bold ring-1',
              style.bg,
              style.text,
              style.ring
            )}
          >
            {sim.subject}
          </span>
          <span className="inline-flex items-center rounded-full bg-ink-50 px-2 py-0.5 text-[0.66rem] font-bold text-ink-600 ring-1 ring-ink-200">
            {sim.level}
          </span>
        </div>
      </div>
      <PlayCircle
        className="h-5 w-5 text-ink-400 group-hover:text-navy transition-colors shrink-0"
        aria-hidden
      />
    </button>
  )
}

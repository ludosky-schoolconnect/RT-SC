/**
 * RT-SC · AnnoncesWidget — live Accueil tile for élève/parent.
 *
 * Replaces the "Bientôt" Annonces PreviewWidget that was on the Accueil.
 * Reads `useAnnoncesFor([classeIds])` — filtered by scope + expiration.
 *
 * Three visual states:
 *   - LOADING: skeleton
 *   - EMPTY: compact ShieldCheck-style quiet tile
 *   - HAS ANNONCES: card shows count + latest title + priority dot.
 *     Tapping opens ModalAnnoncesList (which lets you drill into each).
 */

import { motion } from 'framer-motion'
import { Megaphone, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useAnnoncesFor } from '@/hooks/useAnnonces'
import { cn } from '@/lib/cn'
import { ModalAnnoncesList } from './ModalAnnoncesList'
import type { AnnoncePriority } from '@/types/models'

interface Props {
  /** classeIds this consumer is associated with (1 for élève, 1..N for parent) */
  classeIds: string[]
}

export function AnnoncesWidget({ classeIds }: Props) {
  const annonces = useAnnoncesFor(classeIds)
  const [listOpen, setListOpen] = useState(false)

  const count = annonces.length
  const latest = annonces[0]

  if (count === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg/60 text-warning/70 ring-1 ring-warning/20">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
              Annonces récentes
            </p>
            <p className="text-[0.75rem] text-ink-500 mt-0.5 leading-snug">
              Rien de nouveau pour le moment.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setListOpen(true)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.25 }}
        className="w-full text-left rounded-xl bg-white px-4 py-3.5 ring-1 ring-ink-100 hover:ring-warning/40 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/25">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display text-[0.95rem] text-navy font-bold leading-tight truncate">
                {count === 1
                  ? '1 annonce'
                  : `${count} annonces`}
              </p>
              {latest && <PriorityDot priority={latest.priority} />}
            </div>
            <p className="text-[0.78rem] text-ink-600 mt-0.5 leading-snug truncate">
              {latest ? latest.title : 'Consultez les communications.'}
            </p>
          </div>
          <ChevronRight
            className="h-4 w-4 text-ink-300 group-hover:text-navy group-hover:translate-x-0.5 transition-all shrink-0"
            aria-hidden
          />
        </div>
      </motion.button>

      <ModalAnnoncesList
        open={listOpen}
        onClose={() => setListOpen(false)}
        annonces={annonces}
      />
    </>
  )
}

// ─── Priority dot ──────────────────────────────────────────

function PriorityDot({ priority }: { priority: AnnoncePriority }) {
  const toneClass = {
    info: 'bg-navy/50',
    important: 'bg-warning',
    urgent: 'bg-danger animate-pulse',
  }[priority]
  return (
    <span
      aria-hidden
      className={cn('h-2 w-2 rounded-full shrink-0', toneClass)}
    />
  )
}

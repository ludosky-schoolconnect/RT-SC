/**
 * RT-SC · LaboWidget — student Accueil teaser for the virtual lab.
 *
 * Compact card that opens the full LaboBrowser in a large modal
 * when tapped. Saves a bottom-nav slot on mobile while still giving
 * students one-tap access to 30 PhET simulations.
 *
 * Shows a rotating "featured sim" thumbnail each day — deterministic
 * index (day-of-year % catalog length) so the whole school shares
 * the same pick, matching the English Hub word-of-the-day rhythm.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, ChevronRight } from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { LABO_DATABASE, type LaboSim } from '@/data/laboDatabase'
import { LaboBrowser } from './LaboBrowser'

function pickFeaturedSim(): LaboSim {
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  return LABO_DATABASE[dayIndex % LABO_DATABASE.length]
}

export function LaboWidget() {
  const featured = useMemo(() => pickFeaturedSim(), [])
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full text-left rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] hover:ring-emerald-300/60 hover:shadow-[0_4px_12px_-2px_rgba(11,37,69,0.1)] active:scale-[0.995] transition-all overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <FlaskConical className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.15em] font-bold text-ink-500">
              Laboratoire virtuel
            </p>
            <p className="font-display text-[1rem] font-black text-navy leading-tight mt-0.5 truncate">
              {featured.title}
            </p>
            <p className="text-[0.72rem] text-ink-500 mt-0.5">
              {featured.subject} · {featured.level} · {LABO_DATABASE.length}{' '}
              simulations
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-ink-400">
            <span className="text-[1.4rem]" aria-hidden>
              {featured.img}
            </span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </div>
        </div>
      </motion.button>

      <Modal open={open} onClose={() => setOpen(false)} size="xl">
        <ModalHeader onClose={() => setOpen(false)}>
          <ModalTitle>
            <span className="flex items-center gap-2">
              <FlaskConical
                className="h-5 w-5 text-emerald-600"
                aria-hidden
              />
              Laboratoire virtuel
            </span>
          </ModalTitle>
        </ModalHeader>
        <ModalBody className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto">
          <LaboBrowser />
        </ModalBody>
      </Modal>
    </>
  )
}

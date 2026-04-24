/**
 * RT-SC · LaboLauncherModal — full-screen PhET simulation viewer.
 *
 * Renders as a full-screen portal overlay (not inside the Modal
 * component) so the iframe gets every available pixel. The previous
 * xl-modal approach left header/footer chrome eating into the sim
 * area and caused layout issues on some Android browsers.
 *
 * Escape key and the × button both close. Body scroll is locked while open.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink } from 'lucide-react'
import type { LaboSim } from '@/data/laboDatabase'

interface Props {
  sim: LaboSim | null
  onClose: () => void
}

export function LaboLauncherModal({ sim, onClose }: Props) {
  const open = sim !== null

  // Lock body scroll + Escape handler
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const root = document.getElementById('modal-root') ?? document.body

  return createPortal(
    <AnimatePresence>
      {open && sim && (
        <motion.div
          key="labo-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-slate-900"
        >
          {/* Header bar */}
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-800 shrink-0">
            <span className="text-xl shrink-0">{sim.img}</span>
            <span className="flex-1 min-w-0 font-semibold text-white text-sm truncate">
              {sim.title}
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-[0.65rem] font-bold text-slate-300">
              {sim.subject}
            </span>
            <a
              href={sim.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[0.72rem] font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              title="Ouvrir dans un nouvel onglet"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Ouvrir</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Simulation iframe — fills all remaining space */}
          <iframe
            key={sim.url}
            src={sim.url}
            title={sim.title}
            className="flex-1 w-full border-0"
            allow="accelerometer; gyroscope; fullscreen"
            allowFullScreen
            loading="lazy"
          />

          {/* Attribution strip */}
          <div className="shrink-0 px-3 py-1 bg-slate-800 text-[0.6rem] text-slate-500 text-center">
            Simulation PhET · University of Colorado Boulder · CC-BY-4.0
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    root
  )
}

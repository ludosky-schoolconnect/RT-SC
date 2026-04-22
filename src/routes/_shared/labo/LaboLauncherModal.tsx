/**
 * RT-SC · LaboLauncherModal — embeds a PhET simulation.
 *
 * Shown when a user taps a sim card in LaboBrowser. Renders the
 * PhET HTML5 URL inside an iframe inside a large modal.
 *
 * Fallback: PhET serves their sims with frame-ancestors permissive
 * enough to embed, but older Android browsers or certain phones
 * on strict data plans may block the iframe. We ship a clear
 * "Ouvrir dans un nouvel onglet" button that opens the sim outside
 * the app as an escape hatch.
 *
 * No Firestore interaction. Zero cost.
 */

import { ExternalLink } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '@/components/ui/Modal'
import type { LaboSim } from '@/data/laboDatabase'

interface Props {
  sim: LaboSim | null
  onClose: () => void
}

export function LaboLauncherModal({ sim, onClose }: Props) {
  const open = sim !== null
  return (
    <Modal open={open} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <ModalTitle>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[1.3rem] shrink-0">{sim?.img}</span>
            <span className="font-display text-[1.05rem] font-bold text-navy truncate">
              {sim?.title ?? ''}
            </span>
          </span>
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="p-0">
        {sim && (
          <div className="flex flex-col">
            {/* Meta row: subject + level badges + open-external link */}
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-ink-100 bg-ink-50/40">
              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-bold text-navy ring-1 ring-ink-200">
                {sim.subject}
              </span>
              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-bold text-ink-700 ring-1 ring-ink-200">
                {sim.level}
              </span>
              <a
                href={sim.url}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.72rem] font-bold text-navy hover:bg-navy/10 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Ouvrir
              </a>
            </div>

            {/* Iframe container — full height on mobile, capped on desktop.
                We use a near-square aspect ratio that matches how PhET
                sims render; user can scroll-out if needed. */}
            <div className="relative w-full bg-slate-900 aspect-[4/5] sm:aspect-video">
              <iframe
                key={sim.url}
                src={sim.url}
                title={sim.title}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; gyroscope; fullscreen"
                allowFullScreen
                loading="lazy"
              />
            </div>

            {/* Footer help text + attribution.
                PhET sims are CC-BY-4.0; we credit the source. */}
            <div className="px-4 py-2.5 border-t border-ink-100 bg-ink-50/40 space-y-1">
              <p className="text-[0.72rem] text-ink-600 leading-snug">
                Si la simulation n'apparaît pas, appuyez sur{' '}
                <span className="font-bold text-navy">Ouvrir</span> pour
                la lancer dans un nouvel onglet.
              </p>
              <p className="text-[0.66rem] text-ink-400 leading-snug">
                Simulation PhET · University of Colorado Boulder ·
                CC-BY-4.0
              </p>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  )
}

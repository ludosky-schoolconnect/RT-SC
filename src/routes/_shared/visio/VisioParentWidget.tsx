/**
 * RT-SC · Visio — parent Accueil widget.
 *
 * Compact card that lets the parent join an ad-hoc video meeting
 * for their currently-active child. Matches the legacy SchoolConnect
 * "Visio Parent" flow:
 *
 *   1. Parent sees a "Visio avec l'école" card on their Accueil
 *   2. Tap opens a warning modal: "Le professeur ou l'administration
 *      doit ouvrir la salle en premier — connectez-vous à l'heure
 *      exacte convenue"
 *   3. Parent taps "Rejoindre" → Jitsi overlay opens on the room for
 *      their child. If the host is already there, they connect. If
 *      not, Jitsi shows a waiting-for-host state.
 *
 * Room name matches the host side — buildRoomName(ecoleId, eleveId).
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MonitorPlay, Clock, Video } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import {
  VisioOverlay,
  buildRoomName,
} from '@/routes/_shared/visio/VisioOverlay'

interface Props {
  eleveId: string
  eleveName: string
}

export function VisioParentWidget({ eleveId, eleveName }: Props) {
  const { data: config } = useEcoleConfig()
  const [warningOpen, setWarningOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  const ecoleId = config?.nom ? config.nom : 'ecole'
  const roomName = buildRoomName(ecoleId, eleveId)
  const firstName = eleveName.split(' ').pop() || eleveName

  function handleJoin() {
    setWarningOpen(false)
    // Small delay so the modal exit animation plays before the
    // full-screen overlay mounts — avoids a jarring double-transition.
    setTimeout(() => setOverlayOpen(true), 200)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setWarningOpen(true)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-navy/[0.02] active:scale-[0.995] transition-all"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-bg text-info ring-1 ring-info/25">
            <MonitorPlay className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
              Visio avec l'école
            </p>
            <p className="text-[0.76rem] text-ink-500 mt-0.5 leading-snug">
              Rejoindre une réunion vidéo pour {firstName}
            </p>
          </div>
          <Video
            className="h-4 w-4 text-info shrink-0"
            aria-hidden
          />
        </button>
      </motion.div>

      {/* Warning modal — explains the rules before joining */}
      <Modal open={warningOpen} onClose={() => setWarningOpen(false)} size="sm">
        <ModalHeader onClose={() => setWarningOpen(false)}>
          <ModalTitle>
            <span className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-info" aria-hidden />
              Rejoindre la visio
            </span>
          </ModalTitle>
          <ModalDescription>
            Réunion vidéo pour <strong>{eleveName}</strong>.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <div className="rounded-lg bg-warning-bg/60 border border-warning/25 p-3 flex items-start gap-2">
              <Clock
                className="h-4 w-4 text-warning-dark shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="text-[0.82rem] text-ink-700 leading-snug space-y-1">
                <p className="font-bold text-warning-dark">
                  Règle de la salle
                </p>
                <p>
                  Le professeur ou l'administration doit ouvrir la
                  salle <strong>en premier</strong> pour agir comme
                  hôte. Connectez-vous à l'heure convenue avec l'école.
                </p>
              </div>
            </div>
            <p className="text-[0.78rem] text-ink-600 leading-snug">
              Si la salle n'est pas encore ouverte, vous verrez un
              écran d'attente. La visio démarre automatiquement dès que
              l'hôte arrive.
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setWarningOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleJoin}
            leadingIcon={<Video className="h-4 w-4" aria-hidden />}
          >
            J'ai compris, rejoindre
          </Button>
        </ModalFooter>
      </Modal>

      {/* Full-screen Jitsi */}
      <VisioOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        roomName={roomName}
        userName={`[INVITÉ] Parent de ${firstName}`}
        subject={`Rendez-vous pédagogique · ${eleveName}`}
      />
    </>
  )
}

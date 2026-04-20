/**
 * RT-SC · ModalAbsencesClasse — inline drill-in.
 *
 * Wraps AbsencesClasseView in a large modal so any prof can pop open
 * a class's absences from the Mes-classes flow without navigating away.
 *
 * Read-only by default (canManage=false). Admin would never use this
 * surface — they go through the Vie scolaire tab in their dashboard.
 */

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from '@/components/ui/Modal'
import { CalendarOff } from 'lucide-react'
import { AbsencesClasseView } from './AbsencesClasseView'

interface Props {
  open: boolean
  onClose: () => void
  classeId: string
  classeNom: string
  canManage?: boolean
}

export function ModalAbsencesClasse({
  open,
  onClose,
  classeId,
  classeNom,
  canManage = false,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
            <CalendarOff className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <ModalTitle>Absences · {classeNom}</ModalTitle>
            <ModalDescription>
              Suivi des absences déclarées et marquées par l'appel.
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="!p-4">
        <AbsencesClasseView classeId={classeId} canManage={canManage} />
      </ModalBody>
    </Modal>
  )
}

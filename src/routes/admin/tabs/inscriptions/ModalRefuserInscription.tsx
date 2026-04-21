/**
 * RT-SC · Refuse pre-inscription modal.
 *
 * Single-step: admin types a refusal reason, click confirm → dossier
 * statut becomes 'Refusé' with `raisonRefus` set. Parent will see the
 * reason when checking status via tracking code.
 *
 * The reason is required (min 5 chars) so admin can't accidentally
 * refuse without explanation. Parents need to know why.
 */

import { useEffect, useState } from 'react'
import { XCircle, AlertTriangle } from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/stores/toast'
import { useRefuseInscription } from '@/hooks/usePreInscriptions'
import type { PreInscription } from '@/types/models'

interface Props {
  open: boolean
  inscription: PreInscription | null
  onClose: () => void
}

export function ModalRefuserInscription({ open, inscription, onClose }: Props) {
  const refuseMut = useRefuseInscription()
  const toast = useToast()
  const [raison, setRaison] = useState('')

  useEffect(() => {
    if (open) setRaison('')
  }, [open, inscription])

  const valid = raison.trim().length >= 5

  async function execute() {
    if (!inscription || !valid) return
    try {
      await refuseMut.mutateAsync({
        inscriptionId: inscription.id,
        raison: raison.trim(),
      })
      toast.success(`Dossier refusé.`)
      onClose()
    } catch (err) {
      console.error('[refuse] error:', err)
      toast.error('Échec du refus.')
    }
  }

  return (
    <Modal open={open && !!inscription} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>Refuser le dossier</ModalTitle>
        <ModalDescription>
          {inscription?.nom} — {inscription?.niveauSouhaite}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <div className="rounded-md bg-warning-bg border border-warning/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.8rem] text-warning-dark leading-snug">
              Le parent verra cette raison en consultant son code de suivi.
              Soyez clair et professionnel.
            </p>
          </div>

          <Textarea
            label="Raison du refus"
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            placeholder="Ex : Niveau souhaité incompatible avec l'âge de l'élève. Recommandation : reprenez votre demande pour le niveau inférieur."
            rows={5}
            maxLength={500}
            hint={`${raison.length}/500 caractères`}
          />

          {raison && !valid && (
            <p className="text-[0.7rem] text-danger">
              Au moins 5 caractères requis.
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button
          variant="danger"
          onClick={execute}
          disabled={!valid || refuseMut.isPending}
          loading={refuseMut.isPending}
          leadingIcon={<XCircle className="h-4 w-4" />}
        >
          Refuser le dossier
        </Button>
      </ModalFooter>
    </Modal>
  )
}

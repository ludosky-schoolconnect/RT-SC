/**
 * RT-SC · Approve pre-inscription modal.
 *
 * Three-step flow:
 *   1. Pick destination class (filtered to classes matching the
 *      `niveauSouhaite` of the dossier, with "show all" toggle if
 *      none match)
 *   2. App calculates the next available RV (35-place quota,
 *      weekend-skipped, today + 3 days minimum)
 *   3. Confirm — writes statut + classeCible + dateRV
 *
 * Once approved:
 *   - The dossier moves to "Rendez-vous" view
 *   - Parent can verify status via tracking code on the public form
 *   - Parent can reprogram up to 3 times if the date doesn't suit
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Checkbox } from '@/components/ui/Checkbox'
import { useToast } from '@/stores/toast'
import { useClasses } from '@/hooks/useClasses'
import { useApproveInscription } from '@/hooks/usePreInscriptions'
import { useSettingsInscription } from '@/hooks/useSettingsInscription'
import {
  DEFAULT_DELAI_MIN_JOURS,
  DEFAULT_PLACES_PAR_JOUR,
} from '@/lib/inscription-rdv'
import { nomClasse } from '@/lib/benin'
import type { PreInscription } from '@/types/models'

interface Props {
  open: boolean
  inscription: PreInscription | null
  onClose: () => void
}

type Step = 'pick' | 'computing' | 'done' | 'error'

export function ModalApprouverInscription({ open, inscription, onClose }: Props) {
  const { data: classes = [] } = useClasses()
  const { data: settings } = useSettingsInscription()
  const approveMut = useApproveInscription()
  const toast = useToast()

  const [classeId, setClasseId] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [resultDateRV, setResultDateRV] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Reset when modal opens for a new inscription
  useEffect(() => {
    if (open && inscription) {
      setStep('pick')
      setClasseId('')
      setShowAll(false)
      setResultDateRV('')
      setErrorMsg('')
    }
  }, [open, inscription])

  // Filter classes by requested niveau (unless admin checked "show all")
  const filteredClasses = useMemo(() => {
    if (!inscription || showAll) return classes
    const wanted = (inscription.niveauSouhaite ?? '').toLowerCase()
    if (!wanted) return classes
    return classes.filter((c) => (c.niveau ?? '').toLowerCase() === wanted)
  }, [classes, inscription, showAll])

  // Auto-pick the only filtered class if there's exactly one
  useEffect(() => {
    if (step === 'pick' && filteredClasses.length === 1 && !classeId) {
      setClasseId(filteredClasses[0].id)
    }
  }, [filteredClasses, classeId, step])

  const placesParJour =
    settings?.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR
  const delaiMinJours =
    settings?.rendezVousDelaiMinJours ?? DEFAULT_DELAI_MIN_JOURS

  async function execute() {
    if (!inscription || !classeId) return
    setStep('computing')
    setErrorMsg('')
    try {
      const res = await approveMut.mutateAsync({
        inscriptionId: inscription.id,
        classeId,
        placesParJour,
        delaiMinJours,
      })
      setResultDateRV(res.dateRV)
      setStep('done')
      toast.success(`Approuvé. RV fixé au ${res.dateRV}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[approve] error:', err)
      setErrorMsg(msg)
      setStep('error')
      toast.error(msg)
    }
  }

  const inFlight = step === 'computing'

  return (
    <Modal
      open={open && !!inscription}
      onClose={inFlight ? () => {} : onClose}
      size="md"
      disableOverlayClose={inFlight}
      disableEscClose={inFlight}
    >
      <ModalHeader>
        <ModalTitle>Approuver le dossier</ModalTitle>
        <ModalDescription>
          {inscription?.nom} — niveau souhaité <strong>{inscription?.niveauSouhaite}</strong>
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {step === 'pick' && (
          <div className="space-y-4">
            <div className="rounded-md bg-info-bg/60 border border-info/20 p-3 flex items-start gap-2">
              <Calendar className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden />
              <p className="text-[0.8rem] text-navy leading-snug">
                Le système attribuera automatiquement le prochain rendez-vous
                disponible (max <strong>{placesParJour}</strong> places/jour,
                au plus tôt à <strong>+{delaiMinJours} jours</strong>, week-ends
                exclus).
              </p>
            </div>

            <Select
              label="Classe de destination"
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
            >
              <option value="">Sélectionner une classe…</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomClasse(c)}
                </option>
              ))}
            </Select>

            {filteredClasses.length === 0 && !showAll && (
              <div className="rounded-md bg-warning-bg border border-warning/30 p-3 text-[0.78rem] text-warning-dark">
                Aucune classe ne correspond au niveau « {inscription?.niveauSouhaite} ».
                Cochez ci-dessous pour afficher toutes les classes.
              </div>
            )}

            <Checkbox
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked)
                setClasseId('')
              }}
              label="Afficher toutes les classes"
              description="Cochez si le niveau souhaité ne correspond à aucune classe ou si vous voulez réorienter l'élève."
            />
          </div>
        )}

        {step === 'computing' && (
          <div className="py-6 text-center">
            <Spinner size="lg" />
            <p className="mt-3 text-[0.85rem] text-ink-600">
              Calcul du prochain créneau…
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" aria-hidden />
            <p className="font-display text-xl font-semibold text-navy">
              Dossier approuvé
            </p>
            <p className="text-[0.85rem] text-ink-600 mt-2">
              Rendez-vous physique fixé au :
            </p>
            <p className="mt-2 font-mono text-[1.4rem] font-bold text-navy">
              {resultDateRV}
            </p>
            <p className="text-[0.72rem] text-ink-500 mt-3">
              Le parent peut suivre son dossier avec le code{' '}
              <span className="font-mono font-semibold">{inscription?.trackingCode}</span>{' '}
              et reprogrammer jusqu'à 3 fois si nécessaire.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="py-4 text-center">
            <AlertCircle className="h-14 w-14 text-danger mx-auto mb-3" aria-hidden />
            <p className="font-display text-xl font-semibold text-navy">
              Échec de l'approbation
            </p>
            <p className="text-[0.85rem] text-ink-600 mt-2">{errorMsg}</p>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === 'pick' && (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button
              onClick={execute}
              disabled={!classeId}
              leadingIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Approuver & fixer le RV
            </Button>
          </>
        )}
        {step === 'computing' && (
          <Button variant="secondary" disabled>Calcul en cours…</Button>
        )}
        {(step === 'done' || step === 'error') && (
          <Button onClick={onClose}>Fermer</Button>
        )}
      </ModalFooter>
    </Modal>
  )
}

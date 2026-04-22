/**
 * RT-SC · Report Incident modal (shared).
 *
 * Mounted in two places:
 *   - Admin ElevesSection — a "Signaler" button on each student row
 *   - Prof Civisme tab — a dedicated Incidents sub-section that lists
 *     a prof's students and lets them report
 *
 * Required fields: motif (free text), pointsADeduire (≥ 1).
 * The motif ends up in the civismeHistory entry, visible to student,
 * parent, and all staff — so the tone of the motif matters.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Minus, Save } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useReportIncident } from '@/hooks/useIncident'
import { useToast } from '@/stores/toast'

interface Props {
  open: boolean
  onClose: () => void
  classeId: string
  eleveId: string
  eleveName: string
  currentBalance: number
  parUid: string
  parNom: string
}

export function ReportIncidentModal({
  open,
  onClose,
  classeId,
  eleveId,
  eleveName,
  currentBalance,
  parUid,
  parNom,
}: Props) {
  const [motif, setMotif] = useState('')
  const [points, setPoints] = useState<string>('3')
  const [error, setError] = useState<string | null>(null)
  const reportMut = useReportIncident()
  const toast = useToast()
  const submitting = reportMut.isPending

  useEffect(() => {
    if (!open) return
    setMotif('')
    setPoints('3')
    setError(null)
  }, [open])

  async function handleSubmit() {
    setError(null)
    const trimmedMotif = motif.trim()
    if (!trimmedMotif) return setError('Le motif est requis.')
    const ptsNum = Number(points)
    if (!Number.isFinite(ptsNum) || ptsNum < 1)
      return setError('Le nombre de points à retirer doit être ≥ 1.')

    try {
      const res = await reportMut.mutateAsync({
        classeId,
        eleveId,
        motif: trimmedMotif,
        pointsADeduire: Math.round(ptsNum),
        parUid,
        parNom,
      })
      toast.success(
        `Incident enregistré. Nouveau solde de ${eleveName} : ${res.newBalance} pts.`
      )
      onClose()
    } catch (err) {
      console.error('[ReportIncidentModal] submit failed:', err)
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur s'est produite."
      )
    }
  }

  const ptsNum = Number(points)
  const willBe =
    Number.isFinite(ptsNum) && ptsNum > 0
      ? currentBalance - Math.round(ptsNum)
      : null

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
            Signaler un incident
          </span>
        </ModalTitle>
        <ModalDescription>
          Retirer des points à <strong className="text-navy">{eleveName}</strong>{' '}
          suite à un comportement problématique. Le motif sera visible dans
          l'historique de l'élève et de ses parents.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        <Input
          label="Motif"
          placeholder="Ex: Bagarre dans la cour du 21/04"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          autoFocus
          leading={<FileText className="h-4 w-4" aria-hidden />}
          disabled={submitting}
          hint="Soyez précis et factuel — l'élève et ses parents verront ce motif."
        />

        <Input
          label="Points à retirer"
          type="number"
          inputMode="numeric"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          leading={<Minus className="h-4 w-4" aria-hidden />}
          disabled={submitting}
          min={1}
          max={20}
          hint={
            willBe !== null
              ? `Solde actuel : ${currentBalance} pts → Nouveau : ${willBe} pts`
              : `Solde actuel : ${currentBalance} pts`
          }
        />

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2.5 text-[0.82rem] text-danger-dark">
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Annuler
        </Button>
        <Button
          variant="danger"
          onClick={handleSubmit}
          loading={submitting}
          leadingIcon={<Save className="h-4 w-4" aria-hidden />}
        >
          Signaler
        </Button>
      </ModalFooter>
    </Modal>
  )
}

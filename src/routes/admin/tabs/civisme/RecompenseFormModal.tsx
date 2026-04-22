/**
 * RT-SC · Recompense form modal (add + edit, dual-purpose).
 *
 * Pass `existing` to edit, omit to add. Admin uid is captured from
 * auth store and stamped onto createdBy when adding.
 *
 * Validation:
 *   - nom: required, trimmed, non-empty
 *   - pointsRequis: required, integer ≥ 0
 *   - description: optional
 *   - disponible: defaults true on add
 */

import { useEffect, useState } from 'react'
import { Coins, Tag, FileText, Save, ToggleRight } from 'lucide-react'
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
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import {
  useAddRecompense,
  useUpdateRecompense,
} from '@/hooks/useRecompenses'
import { useToast } from '@/stores/toast'
import type { Recompense } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  existing?: Recompense
  /** Required for ADD mode */
  currentUserUid: string
}

export function RecompenseFormModal({
  open,
  onClose,
  existing,
  currentUserUid,
}: Props) {
  const isEdit = Boolean(existing)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState<string>('')
  const [disponible, setDisponible] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const addMut = useAddRecompense()
  const updateMut = useUpdateRecompense()
  const toast = useToast()
  const submitting = addMut.isPending || updateMut.isPending

  useEffect(() => {
    if (!open) return
    if (existing) {
      setNom(existing.nom ?? '')
      setDescription(existing.description ?? '')
      setPoints(String(existing.pointsRequis))
      setDisponible(existing.disponible)
    } else {
      setNom('')
      setDescription('')
      setPoints('')
      setDisponible(true)
    }
    setError(null)
  }, [open, existing])

  async function handleSubmit() {
    setError(null)
    const trimmedNom = nom.trim()
    if (!trimmedNom) return setError('Le nom est requis.')
    const ptsNum = Number(points)
    if (!Number.isFinite(ptsNum) || ptsNum < 0)
      return setError('Le coût en points doit être un entier ≥ 0.')

    try {
      if (isEdit && existing) {
        await updateMut.mutateAsync({
          id: existing.id,
          nom: trimmedNom,
          description,
          pointsRequis: Math.round(ptsNum),
          disponible,
        })
        toast.success('Récompense modifiée.')
      } else {
        await addMut.mutateAsync({
          nom: trimmedNom,
          description: description.trim() || undefined,
          pointsRequis: Math.round(ptsNum),
          disponible,
          createdBy: currentUserUid,
        })
        toast.success('Récompense ajoutée au catalogue.')
      }
      onClose()
    } catch (err) {
      console.error('[RecompenseFormModal] submit failed:', err)
      setError("Une erreur s'est produite. Vérifiez votre connexion et réessayez.")
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>
          {isEdit ? 'Modifier la récompense' : 'Nouvelle récompense'}
        </ModalTitle>
        <ModalDescription>
          Définissez ce que les élèves peuvent réclamer avec leurs points
          de civisme. Les élèves verront ce nom et son coût en points.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        <Input
          label="Nom de la récompense"
          placeholder="Ex: Calculatrice scientifique"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          autoFocus
          leading={<Tag className="h-4 w-4" aria-hidden />}
          disabled={submitting}
        />

        <Input
          label="Coût en points"
          type="number"
          inputMode="numeric"
          placeholder="Ex: 20"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          leading={<Coins className="h-4 w-4" aria-hidden />}
          disabled={submitting}
          min={0}
          max={999}
          hint="L'élève doit avoir au moins ce solde pour réclamer."
        />

        <Input
          label="Description (facultatif)"
          placeholder="Ex: Casio FX-92, idéale pour le BEPC."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          leading={<FileText className="h-4 w-4" aria-hidden />}
          disabled={submitting}
        />

        <div className="flex items-center justify-between gap-3 rounded-md border-[1.5px] border-ink-100 bg-white px-3.5 py-2.5">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <ToggleRight className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-[0.82rem] font-bold text-navy leading-tight">
                Disponible
              </p>
              <p className="text-[0.72rem] text-ink-500 mt-0.5 leading-snug">
                Les élèves voient cette récompense dans leur catalogue. Désactivez si rupture de stock.
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={disponible}
            onChange={setDisponible}
            disabled={submitting}
            ariaLabel="Récompense disponible"
          />
        </div>

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
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          leadingIcon={<Save className="h-4 w-4" aria-hidden />}
        >
          {isEdit ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

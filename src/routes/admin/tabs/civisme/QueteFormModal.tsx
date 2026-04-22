/**
 * RT-SC · Quete form modal (admin create + edit, dual-purpose).
 *
 * Field set:
 *   - titre (required)
 *   - description (optional)
 *   - pointsRecompense (required, ≥ 1)
 *   - slotsTotal (required, ≥ 1) — locked-down on edit if slots already taken
 *     to a minimum of `slotsTaken` (enforced server-side too)
 *   - classeIdFilter (optional — null = école entière)
 *   - echeance (optional date)
 *
 * Edit mode: slotsTotal can only INCREASE if slots have been taken.
 * The classe filter cannot be changed on edit (would orphan existing
 * claims from other classes).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ListChecks,
  Coins,
  Users,
  Calendar,
  School as SchoolIcon,
  Save,
  FileText,
} from 'lucide-react'
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
import { Select } from '@/components/ui/Select'
import {
  useCreateQuete,
  useUpdateQuete,
} from '@/hooks/useQuetes'
import { useClasses } from '@/hooks/useClasses'
import { useToast } from '@/stores/toast'
import { nomClasse } from '@/lib/benin'
import type { Quete } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, edit mode; otherwise create */
  existing?: Quete
  currentUserUid: string
}

export function QueteFormModal({
  open,
  onClose,
  existing,
  currentUserUid,
}: Props) {
  const isEdit = Boolean(existing)
  const { data: classes = [] } = useClasses()
  const createMut = useCreateQuete()
  const updateMut = useUpdateQuete()
  const toast = useToast()
  const submitting = createMut.isPending || updateMut.isPending

  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState<string>('')
  const [slots, setSlots] = useState<string>('')
  const [classeId, setClasseId] = useState<string>('')
  const [echeance, setEcheance] = useState<string>('') // yyyy-mm-dd
  const [error, setError] = useState<string | null>(null)

  const classesSorted = useMemo(
    () =>
      [...classes].sort((a, b) =>
        nomClasse(a).toLowerCase().localeCompare(nomClasse(b).toLowerCase(), 'fr')
      ),
    [classes]
  )

  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitre(existing.titre ?? '')
      setDescription(existing.description ?? '')
      setPoints(String(existing.pointsRecompense))
      setSlots(String(existing.slotsTotal))
      setClasseId(existing.classeIdFilter ?? '')
      setEcheance(
        existing.echeance ? toDateInput(existing.echeance.toDate()) : ''
      )
    } else {
      setTitre('')
      setDescription('')
      setPoints('5')
      setSlots('1')
      setClasseId('')
      setEcheance('')
    }
    setError(null)
  }, [open, existing])

  const minSlots = existing ? Math.max(1, existing.slotsTaken) : 1

  async function handleSubmit() {
    setError(null)
    const trimmedTitre = titre.trim()
    if (!trimmedTitre) return setError('Le titre est requis.')
    const ptsNum = Number(points)
    if (!Number.isFinite(ptsNum) || ptsNum < 1)
      return setError('La récompense doit être un entier ≥ 1.')
    const slotsNum = Number(slots)
    if (!Number.isFinite(slotsNum) || slotsNum < 1)
      return setError('Le nombre de créneaux doit être ≥ 1.')
    if (isEdit && slotsNum < minSlots) {
      return setError(
        `Impossible de réduire en dessous de ${minSlots} (créneaux déjà pris).`
      )
    }

    let echeanceDate: Date | undefined
    if (echeance.trim()) {
      const d = new Date(`${echeance}T23:59:59`)
      if (Number.isNaN(d.getTime())) return setError('Date d\'échéance invalide.')
      echeanceDate = d
    }

    try {
      if (isEdit && existing) {
        await updateMut.mutateAsync({
          id: existing.id,
          titre: trimmedTitre,
          description,
          pointsRecompense: Math.round(ptsNum),
          slotsTotal: Math.round(slotsNum),
          echeance: echeanceDate ?? null,
        })
        toast.success('Quête modifiée.')
      } else {
        const selectedClasse = classesSorted.find((c) => c.id === classeId)
        await createMut.mutateAsync({
          titre: trimmedTitre,
          description: description.trim() || undefined,
          pointsRecompense: Math.round(ptsNum),
          slotsTotal: Math.round(slotsNum),
          classeIdFilter: classeId || undefined,
          classeNomFilter: selectedClasse ? nomClasse(selectedClasse) : undefined,
          echeance: echeanceDate,
          createdBy: currentUserUid,
        })
        toast.success('Quête publiée.')
      }
      onClose()
    } catch (err) {
      console.error('[QueteFormModal] submit failed:', err)
      const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      setError(msg)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>
          {isEdit ? 'Modifier la quête' : 'Publier une nouvelle quête'}
        </ModalTitle>
        <ModalDescription>
          Décrivez une mission concrète. Les élèves la verront et pourront
          la prendre. Vous validerez ensuite leur travail pour leur attribuer les points.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        <Input
          label="Titre de la quête"
          placeholder="Ex: Nettoyage des toilettes"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          autoFocus
          leading={<ListChecks className="h-4 w-4" aria-hidden />}
          disabled={submitting}
        />

        <Input
          label="Description (facultatif)"
          placeholder="Ex: Vendredi matin avant la récréation."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          leading={<FileText className="h-4 w-4" aria-hidden />}
          disabled={submitting}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Points"
            type="number"
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            leading={<Coins className="h-4 w-4" aria-hidden />}
            disabled={submitting}
            min={1}
            max={999}
          />
          <Input
            label="Créneaux"
            type="number"
            inputMode="numeric"
            value={slots}
            onChange={(e) => setSlots(e.target.value)}
            leading={<Users className="h-4 w-4" aria-hidden />}
            disabled={submitting}
            min={minSlots}
            hint={
              isEdit && existing && existing.slotsTaken > 0
                ? `Min: ${minSlots} (déjà pris)`
                : undefined
            }
          />
        </div>

        {!isEdit && (
          <Select
            label="Visibilité"
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            disabled={submitting}
          >
            <option value="">École entière (toutes classes)</option>
            {classesSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c)} uniquement
              </option>
            ))}
          </Select>
        )}

        {isEdit && existing?.classeNomFilter && (
          <div className="flex items-center gap-2 rounded-md border-[1.5px] border-ink-100 bg-ink-50/50 px-3 py-2.5 text-[0.82rem] text-ink-600">
            <SchoolIcon className="h-4 w-4 text-ink-400" aria-hidden />
            <span>
              Réservée à <strong>{existing.classeNomFilter}</strong> — non modifiable
            </span>
          </div>
        )}

        <Input
          label="Échéance (facultatif)"
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          leading={<Calendar className="h-4 w-4" aria-hidden />}
          disabled={submitting}
          hint="Date indicative — non bloquante."
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
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          leadingIcon={<Save className="h-4 w-4" aria-hidden />}
        >
          {isEdit ? 'Enregistrer' : 'Publier'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

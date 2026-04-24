/**
 * RT-SC · Admin "Nouvelle réclamation" modal.
 *
 * Use case: a phoneless student walks up to admin with enough points
 * and wants something from the catalog. Admin picks the class, the
 * student, the reward → a Reclamation is created with
 * demandeeParType: 'admin'. The admin can then hit Honorer on the
 * row that appears in the queue to finalize.
 *
 * Why go through the queue instead of a direct "hand it over now"
 * shortcut? Audit consistency. Every reward handover leaves the
 * same paper trail (Reclamation + civismeHistory) regardless of
 * who initiated it. Parent/student can see it uniformly.
 *
 * Affordability is checked inline — the Reward dropdown greys out
 * rewards the selected student can't afford.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Save,
  Lock,
} from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useClasses } from '@/hooks/useClasses'
import { useRecompenses } from '@/hooks/useRecompenses'
import { useCreateReclamation } from '@/hooks/useReclamations'
import { useToast } from '@/stores/toast'
import { elevesCol } from '@/lib/firestore-keys'
import { nomClasse } from '@/lib/benin'
import type { Eleve } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  adminUid: string
  adminNom: string
}

export function NouvelleReclamationModal({
  open,
  onClose,
  adminUid,
  adminNom,
}: Props) {
  const [classeId, setClasseId] = useState('')
  const [eleveId, setEleveId] = useState('')
  const [recompenseId, setRecompenseId] = useState('')
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [loadingEleves, setLoadingEleves] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: classes = [] } = useClasses()
  const { data: recompenses = [] } = useRecompenses()
  const createMut = useCreateReclamation()
  const toast = useToast()
  const submitting = createMut.isPending

  const classesSorted = useMemo(
    () =>
      [...classes].sort((a, b) =>
        nomClasse(a).toLowerCase().localeCompare(nomClasse(b).toLowerCase(), 'fr')
      ),
    [classes]
  )

  // Only show disponible rewards in the catalog dropdown
  const visibleRewards = useMemo(
    () => recompenses.filter((r) => r.disponible),
    [recompenses]
  )

  const sortedEleves = useMemo(
    () => [...eleves].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [eleves]
  )

  const selectedEleve = sortedEleves.find((e) => e.id === eleveId)
  const selectedReward = visibleRewards.find((r) => r.id === recompenseId)
  const selectedClasse = classesSorted.find((c) => c.id === classeId)
  const studentBalance = selectedEleve?.civismePoints ?? 0
  const canAfford = selectedReward
    ? studentBalance >= selectedReward.pointsRequis
    : true

  // Reset when the modal reopens
  useEffect(() => {
    if (!open) return
    setClasseId('')
    setEleveId('')
    setRecompenseId('')
    setEleves([])
    setError(null)
  }, [open])

  // Load eleves when classe changes
  useEffect(() => {
    if (!classeId) {
      setEleves([])
      return
    }
    setLoadingEleves(true)
    setEleveId('')
    getDocs(collection(db, elevesCol(classeId)))
      .then((snap) => {
        const list: Eleve[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Eleve, 'id'>),
        }))
        setEleves(list)
      })
      .catch((err) => {
        console.error('[NouvelleReclamationModal] eleves load failed:', err)
        toast.error('Impossible de charger les élèves.')
      })
      .finally(() => setLoadingEleves(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId])

  async function handleSubmit() {
    setError(null)
    if (!classeId || !selectedClasse)
      return setError('Choisissez une classe.')
    if (!eleveId || !selectedEleve) return setError('Choisissez un élève.')
    if (!recompenseId || !selectedReward)
      return setError('Choisissez une récompense.')
    if (!canAfford)
      return setError(
        `Solde insuffisant : ${studentBalance} pts, ${selectedReward.pointsRequis} requis.`
      )

    try {
      await createMut.mutateAsync({
        eleveId: selectedEleve.id,
        eleveNom: selectedEleve.nom,
        classeId,
        classeNom: nomClasse(selectedClasse),
        recompenseId: selectedReward.id,
        recompenseNom: selectedReward.nom,
        pointsCout: selectedReward.pointsRequis,
        demandeeParType: 'admin',
        demandeeParUid: adminUid,
        demandeeParNom: adminNom,
      })
      toast.success(
        `Réclamation créée pour ${selectedEleve.nom}. Utilisez « Honorer » dans la liste pour finaliser.`
      )
      onClose()
    } catch (err) {
      console.error('[NouvelleReclamationModal] submit failed:', err)
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur s'est produite."
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>Nouvelle réclamation</ModalTitle>
        <ModalDescription>
          Créez une réclamation au nom d'un élève (par exemple si l'élève
          n'a pas d'appareil). Elle apparaîtra dans la file « En attente »
          où vous pourrez l'honorer après remise physique.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        <Select
          label="Classe"
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          disabled={submitting}
        >
          <option value="">-- Choisir une classe --</option>
          {classesSorted.map((c) => (
            <option key={c.id} value={c.id}>
              {nomClasse(c)}
            </option>
          ))}
        </Select>

        <Select
          label="Élève"
          value={eleveId}
          onChange={(e) => setEleveId(e.target.value)}
          disabled={!classeId || loadingEleves || submitting}
          hint={
            !classeId
              ? "Choisissez d'abord une classe."
              : loadingEleves
                ? 'Chargement…'
                : selectedEleve
                  ? `Solde : ${studentBalance} pts`
                  : `${sortedEleves.length} élève${sortedEleves.length > 1 ? 's' : ''}`
          }
        >
          <option value="">-- Choisir un élève --</option>
          {sortedEleves.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom} ({e.civismePoints ?? 0} pts)
            </option>
          ))}
        </Select>

        <Select
          label="Récompense"
          value={recompenseId}
          onChange={(e) => setRecompenseId(e.target.value)}
          disabled={!eleveId || submitting || visibleRewards.length === 0}
          hint={
            visibleRewards.length === 0
              ? 'Aucune récompense dans le catalogue.'
              : selectedReward
                ? canAfford
                  ? `Coût : ${selectedReward.pointsRequis} pts · Solde après : ${studentBalance - selectedReward.pointsRequis} pts`
                  : `Solde insuffisant : manque ${selectedReward.pointsRequis - studentBalance} pts`
                : undefined
          }
        >
          <option value="">-- Choisir une récompense --</option>
          {visibleRewards.map((r) => {
            const affordable =
              selectedEleve && studentBalance >= r.pointsRequis
            return (
              <option key={r.id} value={r.id}>
                {r.nom} ({r.pointsRequis} pts){!affordable && selectedEleve ? ' — verrouillée' : ''}
              </option>
            )
          })}
        </Select>

        {selectedReward && selectedEleve && !canAfford && (
          <div className="rounded-md border border-warning/30 bg-warning-bg/60 px-3 py-2.5 text-[0.82rem] text-warning-dark flex items-start gap-2">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              {selectedEleve.nom} n'a pas assez de points ({studentBalance} /{' '}
              {selectedReward.pointsRequis}). Attendez qu'il gagne des points
              via des quêtes avant de créer la réclamation.
            </span>
          </div>
        )}

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
          disabled={!canAfford || !selectedReward || !selectedEleve}
          loading={submitting}
          leadingIcon={<Save className="h-4 w-4" aria-hidden />}
        >
          Créer la réclamation
        </Button>
      </ModalFooter>
    </Modal>
  )
}

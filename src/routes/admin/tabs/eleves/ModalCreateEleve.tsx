/**
 * RT-SC · Add élève modal.
 *
 * Required: nom, genre, date de naissance.
 * Optional: contact parent.
 *
 * Validations:
 *   - Nom must be non-empty after trim
 *   - Date is mandatory (legacy behavior)
 *   - Strict duplicate check on (nom, genre, date_naissance), case-insensitive
 *
 * On success, shows a success toast with the generated PIN + parent code
 * (admin can copy them from the vault later, but it's nice to see right away).
 */

import { useEffect, useState } from 'react'
import { Plus, User, Phone } from 'lucide-react'
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
import { useCreateEleve } from '@/hooks/useElevesMutations'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { findDuplicate } from '@/lib/duplicate-check'
import type { Eleve, Genre } from '@/types/models'

interface ModalCreateEleveProps {
  open: boolean
  onClose: () => void
  classeId: string
  classeName: string
  existing: Eleve[]  // for duplicate check
}

export function ModalCreateEleve({
  open,
  onClose,
  classeId,
  classeName,
  existing,
}: ModalCreateEleveProps) {
  const toast = useToast()
  const adminUid = useAuthStore((s) => s.user?.uid)
  const createMut = useCreateEleve()

  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [contactParent, setContactParent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNom('')
      setGenre('')
      setDateNaissance('')
      setContactParent('')
      setError(null)
    }
  }, [open])

  async function submit() {
    setError(null)

    const cleanNom = nom.trim()
    if (!cleanNom) return setError('Veuillez saisir le nom complet.')
    if (!genre) return setError('Choisissez le genre.')
    if (!dateNaissance) return setError('La date de naissance est obligatoire.')

    // Strict duplicate check
    const dup = findDuplicate(existing, {
      nom: cleanNom,
      genre,
      dateNaissance,
    })
    if (dup) {
      return setError(
        `Un élève identique (${cleanNom}, ${genre === 'F' ? 'Féminin' : 'Masculin'}, ${dateNaissance}) existe déjà dans cette classe.`
      )
    }

    try {
      const res = await createMut.mutateAsync({
        classeId,
        nom: cleanNom,
        genre,
        dateNaissance,
        contactParent: contactParent.trim(),
        ajoutePar: adminUid,
      })
      toast.success(
        `${cleanNom} ajouté · PIN : ${res.codePin} · Code parent : ${res.passkeyParent}`,
        7000
      )
      onClose()
    } catch (err) {
      console.error('[ModalCreateEleve] error:', err)
      setError("Erreur lors de l'ajout. Réessayez.")
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Nouvel élève</ModalTitle>
        <ModalDescription>
          Classe {classeName}. Le PIN et le code parent seront générés automatiquement.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Nom complet"
            placeholder="Tel qu'inscrit officiellement"
            value={nom}
            onChange={(e) => {
              setNom(e.target.value)
              setError(null)
            }}
            autoCapitalize="words"
            leading={<User className="h-4 w-4" />}
            autoFocus
          />

          <Select
            label="Genre"
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value as Genre | '')
              setError(null)
            }}
          >
            <option value="">— Choisir —</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </Select>

          <Input
            label="Date de naissance"
            type="date"
            value={dateNaissance}
            onChange={(e) => {
              setDateNaissance(e.target.value)
              setError(null)
            }}
            hint="Obligatoire — utilisée pour la vérification d'identité de l'élève."
          />

          <Input
            label="Contact parent (facultatif)"
            placeholder="22901XXXXXXXX"
            value={contactParent}
            onChange={(e) => setContactParent(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            leading={<Phone className="h-4 w-4" />}
            error={error ?? undefined}
          />
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button
          onClick={submit}
          loading={createMut.isPending}
          leadingIcon={!createMut.isPending ? <Plus className="h-4 w-4" /> : undefined}
        >
          Ajouter l'élève
        </Button>
      </ModalFooter>
    </Modal>
  )
}

/**
 * RT-SC · Annale form modal.
 *
 * Dual-purpose: used for both ADD and EDIT. Pass `existing` to edit,
 * omit to add. The only structural difference is:
 *   - Add: we record ajoutePar/ajouteParUid/ajouteParRole from the
 *     current user via the input props
 *   - Edit: those fields are unchanged on update (server preserves)
 *
 * Fields:
 *   - Titre (required)
 *   - Matière (required)
 *   - Classe cible (required, free text — supports "3ème" or "3ème M1")
 *   - Lien du sujet (required, Google Drive URL)
 *   - Lien du corrigé (optional)
 *
 * Validation is light because profs need to iterate fast — we just
 * block empty required fields and obviously-invalid URLs.
 */

import { useEffect, useState } from 'react'
import { BookOpenCheck, Link as LinkIcon, GraduationCap, Save } from 'lucide-react'
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
import { useAddAnnale, useUpdateAnnale } from '@/hooks/useAnnales'
import { useToast } from '@/stores/toast'
import type { Annale } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  /** Existing annale to edit — leave undefined for add mode */
  existing?: Annale
  /** Required for add mode: current user context */
  currentUser: {
    uid: string
    displayName: string
    role: 'admin' | 'prof'
  }
  /** Optional default classe prefill (for prof adding from a specific class context) */
  defaultClasse?: string
}

export function AnnaleFormModal({
  open,
  onClose,
  existing,
  currentUser,
  defaultClasse,
}: Props) {
  const isEdit = Boolean(existing)
  const [titre, setTitre] = useState('')
  const [matiere, setMatiere] = useState('')
  const [classe, setClasse] = useState('')
  const [lien, setLien] = useState('')
  const [corrige, setCorrige] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addMut = useAddAnnale()
  const updateMut = useUpdateAnnale()
  const toast = useToast()
  const submitting = addMut.isPending || updateMut.isPending

  // Reset / hydrate on open
  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitre(existing.titre ?? '')
      setMatiere(existing.matiere ?? '')
      setClasse(existing.classe ?? '')
      setLien(existing.lien ?? '')
      setCorrige(existing.corrige ?? '')
    } else {
      setTitre('')
      setMatiere('')
      setClasse(defaultClasse ?? '')
      setLien('')
      setCorrige('')
    }
    setError(null)
  }, [open, existing, defaultClasse])

  async function handleSubmit() {
    setError(null)

    if (!titre.trim()) return setError('Le titre est requis.')
    if (!matiere.trim()) return setError('La matière est requise.')
    if (!classe.trim()) return setError('La classe cible est requise.')
    if (!lien.trim()) return setError('Le lien du sujet est requis.')

    // Very light URL sanity check — accepts any http(s) URL
    if (!isHttpUrl(lien)) {
      return setError('Le lien du sujet doit être une URL valide (http/https).')
    }
    if (corrige.trim() && !isHttpUrl(corrige)) {
      return setError('Le lien du corrigé doit être une URL valide (http/https).')
    }

    try {
      if (isEdit && existing) {
        await updateMut.mutateAsync({
          id: existing.id,
          titre,
          matiere,
          classe,
          lien,
          corrige, // trimmed inside the hook
        })
        toast.success('Annale modifiée.')
      } else {
        await addMut.mutateAsync({
          titre,
          matiere,
          classe,
          lien,
          corrige: corrige.trim() || undefined,
          ajoutePar: currentUser.displayName,
          ajouteParUid: currentUser.uid,
          ajouteParRole: currentUser.role,
        })
        toast.success('Annale ajoutée.')
      }
      onClose()
    } catch (err) {
      console.error('[AnnaleFormModal] submit failed:', err)
      setError(
        "Une erreur s'est produite. Vérifiez votre connexion et réessayez."
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>
          {isEdit ? "Modifier l'annale" : 'Ajouter une annale'}
        </ModalTitle>
        <ModalDescription>
          Partagez un sujet d'examen ou un devoir depuis Google Drive.
          Les élèves verront les annales correspondant à leur classe.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        <Input
          label="Titre"
          placeholder="Ex: BEPC Blanc 2024"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          autoFocus
          leading={<BookOpenCheck className="h-4 w-4" aria-hidden />}
          disabled={submitting}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Matière"
            placeholder="Ex: PCT"
            value={matiere}
            onChange={(e) => setMatiere(e.target.value)}
            disabled={submitting}
          />
          <Input
            label="Classe cible"
            placeholder="Ex: 3ème M1 ou 3ème"
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            leading={<GraduationCap className="h-4 w-4" aria-hidden />}
            hint={classe.trim() && !classe.includes(' ') ? 'Tous les niveaux correspondants' : undefined}
            disabled={submitting}
          />
        </div>

        <Input
          label="Lien du sujet (Google Drive)"
          placeholder="https://drive.google.com/..."
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          leading={<LinkIcon className="h-4 w-4" aria-hidden />}
          type="url"
          disabled={submitting}
        />

        <Input
          label="Lien du corrigé (facultatif)"
          placeholder="https://drive.google.com/..."
          value={corrige}
          onChange={(e) => setCorrige(e.target.value)}
          leading={<LinkIcon className="h-4 w-4" aria-hidden />}
          type="url"
          disabled={submitting}
          hint="Laissez vide si vous n'avez pas de corrigé à partager."
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
          {isEdit ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function isHttpUrl(s: string): boolean {
  const trimmed = s.trim()
  return /^https?:\/\//i.test(trimmed)
}

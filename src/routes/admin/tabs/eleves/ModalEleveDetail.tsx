/**
 * RT-SC · Élève detail modal.
 *
 * Opened when admin taps an élève row.
 * - Edit: nom, genre, date_naissance, contactParent
 *   (all fields editable; same duplicate check as create, excluding self)
 * - Codes: display PIN + parent passkey with copy buttons (regen lives in Vault)
 * - Delete: cascading subcollection cleanup with strong confirm
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Trash2, User, Phone, Copy, KeyRound, Users } from 'lucide-react'
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
import { IconButton } from '@/components/ui/IconButton'
import { useUpdateEleve, useDeleteEleve } from '@/hooks/useElevesMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { findDuplicate } from '@/lib/duplicate-check'
import { calculerAge } from '@/lib/benin'
import type { Eleve, Genre } from '@/types/models'

interface ModalEleveDetailProps {
  eleve: Eleve | null
  classeId: string
  classeName: string
  existing: Eleve[]
  onClose: () => void
}

export function ModalEleveDetail({
  eleve,
  classeId,
  classeName,
  existing,
  onClose,
}: ModalEleveDetailProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const updateMut = useUpdateEleve()
  const deleteMut = useDeleteEleve()

  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [contactParent, setContactParent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (eleve) {
      setNom(eleve.nom)
      setGenre(eleve.genre)
      setDateNaissance(eleve.date_naissance ?? '')
      setContactParent(eleve.contactParent ?? '')
      setError(null)
    }
  }, [eleve])

  const isDirty = useMemo(() => {
    if (!eleve) return false
    return (
      nom.trim() !== eleve.nom ||
      genre !== eleve.genre ||
      dateNaissance !== (eleve.date_naissance ?? '') ||
      contactParent.trim() !== (eleve.contactParent ?? '')
    )
  }, [eleve, nom, genre, dateNaissance, contactParent])

  if (!eleve) {
    return (
      <Modal open={false} onClose={onClose}>
        {null}
      </Modal>
    )
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copié.`)
    } catch {
      toast.error('Copie impossible.')
    }
  }

  async function save() {
    if (!eleve) return
    setError(null)

    const cleanNom = nom.trim()
    if (!cleanNom) return setError('Veuillez saisir le nom.')
    if (!genre) return setError('Choisissez le genre.')
    if (!dateNaissance) return setError('La date de naissance est obligatoire.')

    // Duplicate check excluding self
    const dup = findDuplicate(
      existing,
      { nom: cleanNom, genre, dateNaissance },
      eleve.id
    )
    if (dup) {
      return setError(
        `Un autre élève (${dup.nom}) a déjà ces mêmes informations dans cette classe.`
      )
    }

    try {
      await updateMut.mutateAsync({
        classeId,
        eleveId: eleve.id,
        patch: {
          nom: cleanNom,
          genre,
          date_naissance: dateNaissance,
          contactParent: contactParent.trim(),
        },
      })
      toast.success('Élève modifié.')
      onClose()
    } catch (err) {
      console.error('[ModalEleveDetail] save error:', err)
      setError("Erreur lors de l'enregistrement.")
    }
  }

  async function handleDelete() {
    if (!eleve) return
    const ok = await confirm({
      title: `Supprimer ${eleve.nom} ?`,
      message:
        'Toutes les données associées (notes, bulletins, paiements, absences, colles) seront définitivement supprimées. Cette action est irréversible.',
      confirmLabel: 'Supprimer définitivement',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await deleteMut.mutateAsync({ classeId, eleveId: eleve.id })
      toast.success(`${eleve.nom} supprimé.`)
      onClose()
    } catch {
      toast.error('Erreur lors de la suppression.')
    }
  }

  const age = calculerAge(eleve.date_naissance)

  return (
    <Modal open={!!eleve} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-1">
            Classe {classeName}
          </p>
          <ModalTitle>{eleve.nom}</ModalTitle>
          <ModalDescription>
            {eleve.genre === 'F' ? 'Féminin' : 'Masculin'}
            {age !== null && ` · ${age} ans`}
          </ModalDescription>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Codes preview */}
        <div className="rounded-md border border-ink-100 bg-ink-50/40 p-3 mb-5 space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
            Codes d'accès
          </p>
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-ink-400 shrink-0" aria-hidden />
            <span className="text-[0.7rem] uppercase tracking-wider font-bold text-ink-600 w-28">
              PIN élève
            </span>
            <code className="font-mono text-sm font-bold text-navy tracking-wider flex-1 truncate">
              {eleve.codePin}
            </code>
            <IconButton
              aria-label="Copier le PIN"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => copy(eleve.codePin, 'PIN')}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-ink-400 shrink-0" aria-hidden />
            <span className="text-[0.7rem] uppercase tracking-wider font-bold text-ink-600 w-28">
              Code parent
            </span>
            <code className="font-mono text-sm font-bold text-navy tracking-wider flex-1 truncate">
              {eleve.passkeyParent}
            </code>
            <IconButton
              aria-label="Copier le code parent"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => copy(eleve.passkeyParent, 'Code parent')}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </div>
          <p className="text-[0.7rem] text-ink-400 italic mt-1">
            Régénération via le « Coffre des codes » de la classe.
          </p>
        </div>

        {/* Edit form */}
        <div className="space-y-4">
          <Input
            label="Nom complet"
            value={nom}
            onChange={(e) => {
              setNom(e.target.value)
              setError(null)
            }}
            autoCapitalize="words"
            leading={<User className="h-4 w-4" />}
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
          />
          <Input
            label="Contact parent"
            placeholder="22901XXXXXXXX"
            value={contactParent}
            onChange={(e) => setContactParent(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            leading={<Phone className="h-4 w-4" />}
            error={error ?? undefined}
          />
        </div>

        {/* Danger zone */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mt-6 pt-4 border-t border-danger/20"
        >
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-danger mb-3">
            Zone dangereuse
          </p>
          <div className="rounded-md bg-danger-bg border border-danger/20 p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-danger">
                Supprimer cet élève
              </p>
              <p className="text-[0.78rem] text-danger/80 mt-0.5 leading-snug">
                Notes, bulletins, paiements, absences — tout sera perdu.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteMut.isPending}
              leadingIcon={<Trash2 className="h-4 w-4" />}
            >
              Supprimer
            </Button>
          </div>
        </motion.div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
        <Button
          onClick={save}
          disabled={!isDirty}
          loading={updateMut.isPending}
          leadingIcon={!updateMut.isPending ? <Save className="h-4 w-4" /> : undefined}
        >
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  )
}

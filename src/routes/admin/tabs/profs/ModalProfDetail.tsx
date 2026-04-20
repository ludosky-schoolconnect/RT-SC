/**
 * RT-SC · Prof detail modal.
 *
 * Opens when admin taps an active prof row.
 * - Shows assigned classes as badges (read-only — assignment is in its own modal)
 * - Edit matières (comma-separated)
 * - Danger zone: remove prof (deletes the prof doc and removes from
 *   each class's professeursIds; does NOT delete the Firebase Auth account)
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Trash2, Mail, BookOpen, Link as LinkIcon } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { useUpdateProfMatieres, useDeleteProf } from './profUpdateExtras'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useClasses } from '@/hooks/useClasses'
import { nomClasse } from '@/lib/benin'
import type { Professeur } from '@/types/models'

interface ModalProfDetailProps {
  prof: Professeur | null
  onAssignClasses: (prof: Professeur) => void
  onClose: () => void
}

export function ModalProfDetail({
  prof,
  onAssignClasses,
  onClose,
}: ModalProfDetailProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const updateMut = useUpdateProfMatieres()
  const deleteMut = useDeleteProf()
  const { data: classes = [] } = useClasses()

  const [matieres, setMatieres] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (prof) {
      setMatieres((prof.matieres ?? []).join(', '))
      setError(null)
    }
  }, [prof])

  const isDirty = useMemo(() => {
    if (!prof) return false
    const cleaned = matieres
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    const current = prof.matieres ?? []
    if (cleaned.length !== current.length) return true
    return cleaned.some((m, i) => m !== current[i])
  }, [prof, matieres])

  const assignedClasses = useMemo(() => {
    if (!prof) return []
    const ids = new Set(prof.classesIds ?? [])
    return classes.filter((c) => ids.has(c.id))
  }, [prof, classes])

  if (!prof) {
    return (
      <Modal open={false} onClose={onClose}>
        {null}
      </Modal>
    )
  }

  async function save() {
    if (!prof) return
    setError(null)

    const cleaned = matieres
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    if (cleaned.length === 0) {
      return setError('Indiquez au moins une matière.')
    }

    try {
      await updateMut.mutateAsync({ profId: prof.id, matieres: cleaned })
      toast.success('Matières mises à jour.')
      onClose()
    } catch {
      setError("Erreur lors de l'enregistrement.")
    }
  }

  async function handleDelete() {
    if (!prof) return
    const ok = await confirm({
      title: `Retirer ${prof.nom} ?`,
      message: `Le professeur n'aura plus accès à la plateforme et sera retiré de toutes ses classes (${prof.classesIds?.length ?? 0}). Le compte Firebase reste créé. Action irréversible côté SchoolConnect.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await deleteMut.mutateAsync(prof.id)
      toast.success(`${prof.nom} retiré.`)
      onClose()
    } catch {
      toast.error('Erreur lors de la suppression.')
    }
  }

  return (
    <Modal open={!!prof} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-info-bg text-navy font-display font-bold">
            {prof.nom.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <ModalTitle>{prof.nom}</ModalTitle>
            <ModalDescription className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{prof.email}</span>
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Assigned classes */}
        <div className="rounded-md border border-ink-100 bg-ink-50/40 p-3 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
              Classes assignées
            </p>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<LinkIcon className="h-3.5 w-3.5" />}
              onClick={() => onAssignClasses(prof)}
            >
              Modifier
            </Button>
          </div>
          {assignedClasses.length === 0 ? (
            <p className="text-sm text-ink-400 italic">
              Aucune classe assignée.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {assignedClasses.map((c) => (
                <Badge key={c.id} variant="navy" size="sm">
                  {nomClasse(c)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Matières edit */}
        <Textarea
          label="Matières enseignées"
          value={matieres}
          onChange={(e) => {
            setMatieres(e.target.value)
            setError(null)
          }}
          hint="Séparez les matières par des virgules. Ex : Mathématiques, Physique-Chimie"
          rows={2}
          error={error ?? undefined}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {matieres
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
            .map((m) => (
              <Badge key={m} variant="neutral" size="sm" leadingIcon={<BookOpen className="h-3 w-3" />}>
                {m}
              </Badge>
            ))}
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
                Retirer ce professeur
              </p>
              <p className="text-[0.78rem] text-danger/80 mt-0.5 leading-snug">
                Désactive l'accès et le retire de toutes ses classes.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteMut.isPending}
              leadingIcon={<Trash2 className="h-4 w-4" />}
            >
              Retirer
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

/**
 * RT-SC · ModalClasseDetail
 *
 * Opens when admin taps a class card. Three sections:
 *   1. Read-only header showing class name + cycle/série badges + élève count
 *   2. Edit form: niveau, série (if second), salle
 *   3. Actions: regenerate passkey, delete class (in danger zone)
 *
 * Uses optimistic mutations from useClassesMutations.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, RefreshCw, Trash2, KeyRound, Users } from 'lucide-react'
import {
  Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'

import {
  useUpdateClasse,
  useRegeneratePasskey,
  useDeleteClasse,
} from '@/hooks/useClassesMutations'
import { useClasseEleveCount } from '@/hooks/useClasses'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

import { niveauxDuCycle, SERIES, nomClasse } from '@/lib/benin'
import type { Classe, Niveau, Serie } from '@/types/models'

interface ModalClasseDetailProps {
  classe: Classe | null
  onClose: () => void
}

export function ModalClasseDetail({ classe, onClose }: ModalClasseDetailProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const updateMut = useUpdateClasse()
  const regenMut = useRegeneratePasskey()
  const deleteMut = useDeleteClasse()

  const [niveau, setNiveau] = useState<Niveau | ''>('')
  const [serie, setSerie] = useState<Serie | ''>('')
  const [salle, setSalle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: eleveCount } = useClasseEleveCount(classe?.id)

  // Sync local form when a different class is opened
  useEffect(() => {
    if (classe) {
      setNiveau(classe.niveau)
      setSerie((classe.serie ?? '') as Serie | '')
      setSalle(classe.salle)
      setError(null)
    }
  }, [classe])

  const niveauOptions = useMemo(
    () => (classe ? niveauxDuCycle(classe.cycle) : []),
    [classe]
  )

  const isDirty = useMemo(() => {
    if (!classe) return false
    return (
      niveau !== classe.niveau ||
      ((classe.serie ?? '') as Serie | '') !== serie ||
      salle.trim() !== classe.salle
    )
  }, [classe, niveau, serie, salle])

  if (!classe) {
    return <Modal open={false} onClose={onClose}>{null}</Modal>
  }

  async function saveEdits() {
    if (!classe) return
    setError(null)

    if (!niveau) return setError('Choisissez un niveau.')
    if (classe.cycle === 'second' && !serie) return setError('Choisissez une série.')
    if (!salle.trim()) return setError('Indiquez la salle.')

    try {
      await updateMut.mutateAsync({
        id: classe.id,
        patch: {
          niveau: niveau as Niveau,
          serie: classe.cycle === 'second' ? (serie as Serie) : null,
          salle: salle.trim(),
        },
      })
      toast.success('Classe modifiée.')
      onClose()
    } catch (err) {
      console.error('[ModalClasseDetail] save error:', err)
      setError("Erreur lors de l'enregistrement.")
    }
  }

  async function regenPasskey() {
    if (!classe) return
    const ok = await confirm({
      title: 'Régénérer le code de classe ?',
      message:
        'Les élèves devront utiliser le nouveau code lors de leur prochaine connexion. L\'ancien code sera invalide.',
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const newKey = await regenMut.mutateAsync(classe.id)
      toast.success(`Nouveau code : ${newKey}`)
    } catch {
      toast.error('Erreur lors de la régénération.')
    }
  }

  async function handleDelete() {
    if (!classe) return
    const ok = await confirm({
      title: `Supprimer ${nomClasse(classe)} ?`,
      message:
        eleveCount && eleveCount > 0
          ? `Cette classe contient ${eleveCount} élève(s). Toutes les données associées (notes, bulletins, paiements, absences) seront définitivement supprimées. Cette action est irréversible.`
          : 'Cette classe sera définitivement supprimée. Cette action est irréversible.',
      confirmLabel: 'Supprimer définitivement',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(classe.id)
      toast.success('Classe supprimée.')
      onClose()
    } catch {
      toast.error('Erreur lors de la suppression.')
    }
  }

  const serieBadgeMap = {
    A: 'serie-a', B: 'serie-b', C: 'serie-c', D: 'serie-d',
    G1: 'serie-d', G2: 'serie-d', G3: 'serie-d',
  } as const

  return (
    <Modal open={!!classe} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-1">
            {classe.cycle === 'premier' ? 'Premier cycle' : 'Second cycle'}
          </p>
          <ModalTitle>{nomClasse(classe)}</ModalTitle>
          <ModalDescription>
            Modifiez les informations de la classe.
          </ModalDescription>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Top mini stats */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Badge variant="navy" size="sm" leadingIcon={<Users className="h-3 w-3" />}>
            {eleveCount ?? 0} {eleveCount === 1 ? 'élève' : 'élèves'}
          </Badge>
          {classe.serie && (
            <Badge variant={serieBadgeMap[classe.serie]} size="sm">
              Série {classe.serie}
            </Badge>
          )}
          <Badge variant="gold" size="sm" leadingIcon={<KeyRound className="h-3 w-3" />}>
            {classe.passkey}
          </Badge>
        </div>

        {/* Edit form */}
        <div className="space-y-4">
          <Select
            label="Niveau"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value as Niveau | '')}
          >
            <option value="">— Choisir —</option>
            {niveauOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>

          {classe.cycle === 'second' && (
            <Select
              label="Série"
              value={serie}
              onChange={(e) => setSerie(e.target.value as Serie | '')}
            >
              <option value="">— Choisir —</option>
              {SERIES.map((s) => (
                <option key={s} value={s}>
                  Série {s}
                </option>
              ))}
            </Select>
          )}

          <Input
            label="Salle / groupe"
            value={salle}
            onChange={(e) => setSalle(e.target.value)}
            maxLength={4}
            error={error ?? undefined}
          />
        </div>

        {/* Actions row */}
        <div className="mt-6 pt-4 border-t border-ink-100">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-3">
            Actions
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={regenPasskey}
              loading={regenMut.isPending}
              leadingIcon={<RefreshCw className="h-4 w-4" />}
            >
              Régénérer le code
            </Button>
          </div>
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
                Supprimer cette classe
              </p>
              <p className="text-[0.78rem] text-danger/80 mt-0.5 leading-snug">
                Toutes les données associées seront perdues. Action irréversible.
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
          onClick={saveEdits}
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

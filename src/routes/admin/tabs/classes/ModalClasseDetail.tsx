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
import { Save, RefreshCw, Trash2, KeyRound, Users, Crown, X } from 'lucide-react'
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
import { useSetProfPrincipal } from '@/hooks/useProfsMutations'
import { useProfs } from '@/hooks/useProfs'
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
  const setPPMut = useSetProfPrincipal()
  const { data: allProfs = [] } = useProfs()

  const [niveau, setNiveau] = useState<Niveau | ''>('')
  const [serie, setSerie] = useState<Serie | ''>('')
  const [salle, setSalle] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Selected prof id in the PP dropdown (uncommitted local state
   *  until admin taps "Assigner" — matches the vanilla flow). */
  const [ppDraft, setPpDraft] = useState<string>('')

  const { data: eleveCount } = useClasseEleveCount(classe?.id)

  // Sync local form when a different class is opened
  useEffect(() => {
    if (classe) {
      setNiveau(classe.niveau)
      setSerie((classe.serie ?? '') as Serie | '')
      setSalle(classe.salle)
      setError(null)
      setPpDraft(classe.profPrincipalId ?? '')
    }
  }, [classe])

  const niveauOptions = useMemo(
    () => (classe ? niveauxDuCycle(classe.cycle) : []),
    [classe]
  )

  // Eligible PPs = active profs who teach this class. Filtering to
  // classesIds matches the operational rule: only someone who teaches
  // the class should run its conseil de classe. Admins and caissiers
  // are excluded because role !== 'prof'.
  const eligibleProfs = useMemo(() => {
    if (!classe) return []
    return allProfs.filter(
      (p) =>
        p.role === 'prof' &&
        p.statut === 'actif' &&
        p.classesIds.includes(classe.id)
    )
  }, [allProfs, classe])

  // Currently-assigned PP (may or may not still teach the class —
  // look up in the full list, not eligibleProfs).
  const currentPP = useMemo(() => {
    if (!classe?.profPrincipalId) return null
    return allProfs.find((p) => p.id === classe.profPrincipalId) ?? null
  }, [allProfs, classe])

  const ppIsDirty = (classe?.profPrincipalId ?? '') !== ppDraft

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

  async function savePP() {
    if (!classe) return
    try {
      await setPPMut.mutateAsync({ classeId: classe.id, profId: ppDraft })
      toast.success(
        ppDraft
          ? 'Professeur Principal assigné.'
          : 'Professeur Principal retiré.'
      )
    } catch {
      toast.error("Erreur lors de l'assignation.")
    }
  }

  async function clearPP() {
    if (!classe || !classe.profPrincipalId) return
    const ok = await confirm({
      title: 'Retirer le Professeur Principal ?',
      message:
        "Le PP ne pourra plus clôturer les bulletins de cette classe jusqu'à ce qu'un nouveau soit assigné.",
      confirmLabel: 'Retirer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      await setPPMut.mutateAsync({ classeId: classe.id, profId: '' })
      setPpDraft('')
      toast.success('Professeur Principal retiré.')
    } catch {
      toast.error('Erreur lors du retrait.')
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

        {/* ─── Professeur Principal ───────────────────────── */}
        <div className="mt-6 pt-4 border-t border-ink-100">
          <div className="flex items-start gap-2 mb-3">
            <Crown className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-navy">
                Professeur Principal
              </p>
              <p className="text-[0.78rem] text-ink-500 leading-tight mt-0.5">
                Responsable de la clôture des bulletins + calcul des moyennes générales.
              </p>
            </div>
          </div>

          {/* Current state banner — gold pill when assigned, muted
              warning bar when not. */}
          {currentPP ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-md bg-gold-pale border border-gold/30 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[0.72rem] font-bold uppercase tracking-widest text-warning">
                  Actuellement
                </p>
                <p className="text-[0.9rem] font-semibold text-navy truncate">
                  {currentPP.nom}
                </p>
              </div>
              <button
                type="button"
                onClick={clearPP}
                disabled={setPPMut.isPending}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-danger/30 bg-white px-2 py-1 text-[0.75rem] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Retirer le Professeur Principal"
              >
                <X className="h-3 w-3" aria-hidden />
                Retirer
              </button>
            </div>
          ) : (
            <div className="mb-3 rounded-md bg-ink-50/40 border border-ink-100 px-3 py-2">
              <p className="text-[0.8125rem] italic text-ink-500">
                Aucun Professeur Principal assigné.
              </p>
            </div>
          )}

          {/* Dropdown of eligible profs. When the class has no teachers
              assigned yet, the dropdown is disabled with helper text
              steering admin to set classesIds first. */}
          {eligibleProfs.length === 0 ? (
            <p className="text-[0.8125rem] text-ink-500 italic leading-snug">
              Assignez d'abord des professeurs à cette classe (onglet Profs)
              avant de pouvoir choisir un PP.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  label="Choisir un PP"
                  value={ppDraft}
                  onChange={(e) => setPpDraft(e.target.value)}
                  disabled={setPPMut.isPending}
                >
                  <option value="">— Aucun —</option>
                  {eligibleProfs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={savePP}
                disabled={!ppIsDirty || setPPMut.isPending}
                loading={setPPMut.isPending}
                className="shrink-0"
              >
                Assigner
              </Button>
            </div>
          )}
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

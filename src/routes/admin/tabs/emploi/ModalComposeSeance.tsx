/**
 * RT-SC · Modal compose séance (admin).
 *
 * Create OR edit a séance. Drives the central CRUD surface of the emploi
 * du temps. Admin-only (client gate + rules gate in production).
 *
 * Flow:
 *   1. Admin picks a classe (locked when tab has a selected classe;
 *      otherwise free-choice).
 *   2. Admin picks a prof — dropdown shows ALL active profs, with a hint
 *      flagging profs who aren't assigned to that class (still allowed,
 *      but highlighted so admin knows it's a cross-class teaching).
 *   3. Matière resolution:
 *       - If prof has exactly 1 matière → auto-fill, no picker.
 *       - If prof has ≥2 → matière picker shows prof's matières.
 *       - If prof has 0 → free-text fallback (rare: legacy profile).
 *   4. Jour (Lundi…Samedi) + debut/fin times. Duration shown live.
 *   5. Salle (optional). If blank, falls back to the classe's default salle.
 *   6. Live conflict panel: as soon as all required fields are set, we
 *      compute findConflicts() and display them. Save button remains
 *      enabled (admin override) but labels change to "Enregistrer malgré
 *      conflit" to make the override deliberate.
 *
 * Edit mode: when editAnnonce is provided, pre-fill state, keep same flow,
 * and the conflict exclusion ignores itself so "saving the same slot"
 * doesn't self-conflict.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Clock, Save } from 'lucide-react'

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

import { useClasses } from '@/hooks/useClasses'
import { useProfs } from '@/hooks/useProfs'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useAllSeances } from '@/hooks/useSeances'
import {
  useCreateSeance,
  useUpdateSeance,
} from '@/hooks/useSeancesMutations'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/cn'
import { nomClasse, safeMatiereId } from '@/lib/benin'
import {
  findConflicts,
  formatDuree,
  parseHHMM,
  seanceDurationMinutes,
} from '@/lib/seances'
import { JOURS_ORDRE } from '@/types/models'
import type { Jour, Seance } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fills classe (and locks the picker to that classe). */
  defaultClasseId?: string
  /** Pre-fills jour (convenient when adding from within a day). */
  defaultJour?: Jour
  /** When provided, edit mode. */
  editSeance?: Seance
}

export function ModalComposeSeance({
  open,
  onClose,
  defaultClasseId,
  defaultJour,
  editSeance,
}: Props) {
  const { data: classes = [] } = useClasses()
  const { data: profs = [] } = useProfs()
  const { data: config } = useEcoleConfig()
  const { data: allSeances = [] } = useAllSeances()
  const createMut = useCreateSeance()
  const updateMut = useUpdateSeance()
  const toast = useToast()

  const isEdit = !!editSeance

  const [classeId, setClasseId] = useState(
    editSeance?.classeId ?? defaultClasseId ?? ''
  )
  const [profId, setProfId] = useState(editSeance?.profId ?? '')
  const [matiere, setMatiere] = useState(editSeance?.matiere ?? '')
  const [jour, setJour] = useState<Jour>(
    editSeance?.jour ?? defaultJour ?? 'Lundi'
  )
  const [heureDebut, setHeureDebut] = useState(editSeance?.heureDebut ?? '08:00')
  const [heureFin, setHeureFin] = useState(editSeance?.heureFin ?? '10:00')
  const [salle, setSalle] = useState(editSeance?.salle ?? '')

  const [profErr, setProfErr] = useState<string | null>(null)
  const [matiereErr, setMatiereErr] = useState<string | null>(null)
  const [timeErr, setTimeErr] = useState<string | null>(null)
  const [classeErr, setClasseErr] = useState<string | null>(null)

  // Re-hydrate on editSeance change (edit mode)
  useEffect(() => {
    if (!editSeance) return
    setClasseId(editSeance.classeId)
    setProfId(editSeance.profId)
    setMatiere(editSeance.matiere)
    setJour(editSeance.jour)
    setHeureDebut(editSeance.heureDebut)
    setHeureFin(editSeance.heureFin)
    setSalle(editSeance.salle ?? '')
    setProfErr(null)
    setMatiereErr(null)
    setTimeErr(null)
    setClasseErr(null)
  }, [editSeance])

  // Sync on modal OPEN in CREATE mode:
  // the composer stays mounted across open/close cycles, so useState's
  // initial values become stale after the first open. Whenever we transition
  // to open && !editSeance, reset the form to the defaults from props.
  useEffect(() => {
    if (!open) return
    if (editSeance) return // edit mode is handled above
    setClasseId(defaultClasseId ?? '')
    setProfId('')
    setMatiere('')
    setJour(defaultJour ?? 'Lundi')
    setHeureDebut('08:00')
    setHeureFin('10:00')
    setSalle('')
    setProfErr(null)
    setMatiereErr(null)
    setTimeErr(null)
    setClasseErr(null)
  }, [open, editSeance, defaultClasseId, defaultJour])

  // The picked prof
  const prof = useMemo(
    () => profs.find((p) => p.id === profId) ?? null,
    [profs, profId]
  )

  // Matière resolution logic
  const profMatieres = prof?.matieres ?? []
  const needsMatierePicker = profMatieres.length >= 2
  const hasZeroMatiereProf = !!prof && profMatieres.length === 0

  // When prof changes and they have exactly one matière → auto-fill
  useEffect(() => {
    if (!prof) return
    if (profMatieres.length === 1) {
      setMatiere(profMatieres[0])
      setMatiereErr(null)
      return
    }
    // Multi-matière: if current matière isn't one of theirs, reset.
    if (needsMatierePicker && !profMatieres.includes(matiere)) {
      setMatiere('')
    }
    // Zero matière: leave free-text input for admin to type.
  }, [profId]) // eslint-disable-line react-hooks/exhaustive-deps

  const classe = useMemo(
    () => classes.find((c) => c.id === classeId) ?? null,
    [classes, classeId]
  )

  // Is the selected prof assigned to this class?
  const profTeachesThisClass =
    prof && classeId ? prof.classesIds.includes(classeId) : true

  // Live conflict detection — paused while a mutation is in flight so the
  // button label doesn't flicker. After save, the snapshot will include the
  // new doc (which would self-conflict on a create since we have no
  // excludeId), but by then the modal is closing anyway.
  const isPending = createMut.isPending || updateMut.isPending
  const conflicts = useMemo(() => {
    if (isPending) return []
    if (!classeId || !profId || !jour || !heureDebut || !heureFin) return []
    const a = parseHHMM(heureDebut)
    const b = parseHHMM(heureFin)
    if (Number.isNaN(a) || Number.isNaN(b) || a >= b) return []
    return findConflicts(
      { classeId, profId, jour, heureDebut, heureFin },
      allSeances,
      editSeance?.id
    )
  }, [isPending, classeId, profId, jour, heureDebut, heureFin, allSeances, editSeance?.id])

  const profConflicts = conflicts.filter((c) => c.kind === 'prof')
  const classeConflicts = conflicts.filter((c) => c.kind === 'classe')

  // Duration preview
  const dureeMin = seanceDurationMinutes({ heureDebut, heureFin })

  // Reset on close when not editing
  function resetForm() {
    setClasseId(defaultClasseId ?? '')
    setProfId('')
    setMatiere('')
    setJour(defaultJour ?? 'Lundi')
    setHeureDebut('08:00')
    setHeureFin('10:00')
    setSalle('')
    setProfErr(null)
    setMatiereErr(null)
    setTimeErr(null)
    setClasseErr(null)
  }

  function validate(): boolean {
    let ok = true
    setClasseErr(null)
    setProfErr(null)
    setMatiereErr(null)
    setTimeErr(null)

    if (!classeId) {
      setClasseErr('Choisissez une classe.')
      ok = false
    }
    if (!profId) {
      setProfErr('Choisissez un professeur.')
      ok = false
    }
    if (!matiere.trim()) {
      setMatiereErr('La matière est requise.')
      ok = false
    }
    const a = parseHHMM(heureDebut)
    const b = parseHHMM(heureFin)
    if (Number.isNaN(a) || Number.isNaN(b)) {
      setTimeErr('Heures invalides.')
      ok = false
    } else if (a >= b) {
      setTimeErr("L'heure de début doit être antérieure à l'heure de fin.")
      ok = false
    }
    return ok
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      const payload = {
        classeId,
        profId,
        matiere: matiere.trim(),
        matiereId: safeMatiereId(matiere.trim()),
        jour,
        heureDebut,
        heureFin,
        salle: salle.trim() || null,
        anneeScolaireId: config?.anneeActive,
      }
      if (isEdit && editSeance) {
        await updateMut.mutateAsync({ ...payload, id: editSeance.id })
        toast.success('Séance mise à jour.')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Séance ajoutée.')
      }
      resetForm()
      onClose()
    } catch (err) {
      console.error('[ModalComposeSeance] error:', err)
      toast.error(
        isEdit
          ? 'Échec de la mise à jour.'
          : "Échec de l'ajout. Vérifiez vos droits et réessayez."
      )
    }
  }

  const hasConflicts = conflicts.length > 0

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy/10 text-navy ring-1 ring-navy/20">
            <Clock className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <ModalTitle>
              {isEdit ? 'Modifier la séance' : 'Nouvelle séance'}
            </ModalTitle>
            <ModalDescription>
              {isEdit
                ? 'Les modifications seront visibles immédiatement sur tous les appareils.'
                : "Ajoutez un cours à l'emploi du temps. Les conflits éventuels sont détectés automatiquement."}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ModalBody className="space-y-4">
          {/* Classe — pre-filled from tab selection but always editable */}
          <Select
            label="Classe"
            value={classeId}
            onChange={(e) => {
              setClasseId(e.target.value)
              setClasseErr(null)
            }}
            error={classeErr ?? undefined}
            hint={
              defaultClasseId && classeId === defaultClasseId
                ? 'Pré-sélectionnée depuis votre vue actuelle (modifiable).'
                : undefined
            }
          >
            <option value="">— Choisir une classe —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c)}
              </option>
            ))}
          </Select>

          {/* Prof */}
          <Select
            label="Professeur"
            value={profId}
            onChange={(e) => {
              setProfId(e.target.value)
              setProfErr(null)
            }}
            error={profErr ?? undefined}
            hint={
              prof && !profTeachesThisClass
                ? `${prof.nom} n'est pas officiellement affecté à cette classe. L'ajout est toutefois possible.`
                : undefined
            }
          >
            <option value="">— Choisir un professeur —</option>
            {profs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
                {p.matieres?.length > 0 ? ` — ${p.matieres.join(', ')}` : ''}
              </option>
            ))}
          </Select>

          {/* Matière */}
          {needsMatierePicker ? (
            <Select
              label="Matière"
              value={matiere}
              onChange={(e) => {
                setMatiere(e.target.value)
                setMatiereErr(null)
              }}
              error={matiereErr ?? undefined}
              hint={`${prof?.nom ?? ''} enseigne plusieurs matières — choisissez celle de cette séance.`}
            >
              <option value="">— Choisir la matière —</option>
              {profMatieres.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          ) : hasZeroMatiereProf ? (
            <Input
              label="Matière"
              value={matiere}
              onChange={(e) => {
                setMatiere(e.target.value)
                setMatiereErr(null)
              }}
              error={matiereErr ?? undefined}
              hint="Aucune matière enregistrée pour ce professeur — saisissez-la manuellement."
              placeholder="ex. Mathématiques"
            />
          ) : prof ? (
            <div className="rounded-md border border-ink-100 bg-ink-50/50 px-4 py-3">
              <div className="text-[0.8125rem] font-semibold text-ink-800">
                Matière
              </div>
              <div className="mt-1 text-[0.95rem] text-ink-900">
                {matiere || '—'}
              </div>
              <p className="mt-1 text-[0.72rem] text-ink-400">
                Dérivée automatiquement du profil de {prof.nom}.
              </p>
            </div>
          ) : null}

          {/* Jour */}
          <Select
            label="Jour"
            value={jour}
            onChange={(e) => setJour(e.target.value as Jour)}
          >
            {JOURS_ORDRE.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="time"
              label="Heure de début"
              value={heureDebut}
              onChange={(e) => {
                setHeureDebut(e.target.value)
                setTimeErr(null)
              }}
              error={timeErr ?? undefined}
            />
            <Input
              type="time"
              label="Heure de fin"
              value={heureFin}
              onChange={(e) => {
                setHeureFin(e.target.value)
                setTimeErr(null)
              }}
              hint={
                dureeMin > 0 && !timeErr
                  ? `Durée : ${formatDuree(dureeMin)}`
                  : undefined
              }
            />
          </div>
          {timeErr && (
            <div className="-mt-2 flex items-center gap-1.5 text-[0.8125rem] text-danger">
              <AlertCircle className="h-4 w-4" aria-hidden />
              {timeErr}
            </div>
          )}

          {/* Salle */}
          <Input
            label="Salle (optionnel)"
            value={salle}
            onChange={(e) => setSalle(e.target.value)}
            placeholder={
              classe?.salle
                ? `Laisser vide pour utiliser la salle de la classe (${classe.salle})`
                : 'ex. A1, 12, Bibliothèque'
            }
          />

          {/* Conflict panel */}
          {hasConflicts && (
            <div
              className={cn(
                'rounded-md border px-3 py-2.5 text-[0.82rem]',
                'border-warning/40 bg-warning-bg/60 text-ink-800'
              )}
              role="alert"
            >
              <div className="flex items-center gap-2 font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} détecté
                {conflicts.length > 1 ? 's' : ''}
              </div>
              <ul className="mt-1.5 space-y-1 text-[0.78rem]">
                {profConflicts.length > 0 && (
                  <li>
                    <span className="font-semibold">Professeur :</span>{' '}
                    {prof?.nom} a déjà{' '}
                    {profConflicts.length} autre
                    {profConflicts.length > 1 ? 's' : ''} séance
                    {profConflicts.length > 1 ? 's' : ''} qui se chevauche
                    {profConflicts.length > 1 ? 'nt' : ''} (
                    {profConflicts
                      .map(
                        (c) =>
                          `${c.other.heureDebut}–${c.other.heureFin} en ${
                            classes.find((k) => k.id === c.other.classeId)
                              ?.niveau ?? '—'
                          }`
                      )
                      .join(', ')}
                    ).
                  </li>
                )}
                {classeConflicts.length > 0 && (
                  <li>
                    <span className="font-semibold">Classe :</span>{' '}
                    {classe ? nomClasse(classe) : '—'} a déjà{' '}
                    {classeConflicts.length} autre
                    {classeConflicts.length > 1 ? 's' : ''} cours
                    {' '}qui se chevauche
                    {classeConflicts.length > 1 ? 'nt' : ''} (
                    {classeConflicts
                      .map(
                        (c) =>
                          `${c.other.heureDebut}–${c.other.heureFin} : ${c.other.matiere}`
                      )
                      .join(', ')}
                    ).
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[0.72rem] text-ink-500">
                Vous pouvez enregistrer malgré tout — utile pour corriger une
                erreur ou ajuster un créneau partagé.
              </p>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant={hasConflicts ? 'secondary' : 'primary'}
            loading={isPending}
            leadingIcon={<Save className="h-4 w-4" />}
          >
            {hasConflicts
              ? 'Enregistrer malgré le conflit'
              : isEdit
                ? 'Enregistrer'
                : 'Ajouter la séance'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

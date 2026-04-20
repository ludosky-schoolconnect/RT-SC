/**
 * RT-SC · Assign classes modal.
 *
 * Opens for one prof. Lists every class as a checkbox. Pre-checks classes
 * the prof is currently assigned to.
 *
 * Submitting fires useAssignClasses, which:
 *   1. Updates prof.classesIds = selected list (single write)
 *   2. Bidirectionally syncs each class's professeursIds array
 *      (arrayUnion for added, arrayRemove for removed)
 */

import { useEffect, useMemo, useState } from 'react'
import { Save, Link as LinkIcon } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { useClasses } from '@/hooks/useClasses'
import { useAssignClasses } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { nomClasse } from '@/lib/benin'
import type { Professeur, Classe } from '@/types/models'

interface ModalAssignClassesProps {
  prof: Professeur | null
  onClose: () => void
}

export function ModalAssignClasses({ prof, onClose }: ModalAssignClassesProps) {
  const toast = useToast()
  const { data: classes = [] } = useClasses()
  const assignMut = useAssignClasses()

  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (prof) setSelected(new Set(prof.classesIds ?? []))
  }, [prof])

  // Group classes by cycle for nicer scanning
  const grouped = useMemo(() => {
    const premier: Classe[] = []
    const second: Classe[] = []
    for (const c of classes) {
      if (c.cycle === 'second') second.push(c)
      else premier.push(c)
    }
    return { premier, second }
  }, [classes])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!prof) return
    try {
      await assignMut.mutateAsync({
        profId: prof.id,
        selectedClasseIds: Array.from(selected),
      })
      toast.success(
        selected.size === 0
          ? `Classes retirées pour ${prof.nom}.`
          : `${selected.size} classe${selected.size > 1 ? 's' : ''} assignée${selected.size > 1 ? 's' : ''} à ${prof.nom}.`
      )
      onClose()
    } catch {
      toast.error("Échec de l'enregistrement.")
    }
  }

  if (!prof) {
    return (
      <Modal open={false} onClose={onClose}>
        {null}
      </Modal>
    )
  }

  const empty = classes.length === 0

  return (
    <Modal open={!!prof} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-bg text-navy">
            <LinkIcon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Assigner des classes</ModalTitle>
            <ModalDescription>{prof.nom}</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {empty ? (
          <EmptyState
            title="Aucune classe créée"
            description="Allez dans l'onglet Classes pour créer au moins une classe avant d'assigner un professeur."
          />
        ) : (
          <div className="space-y-5">
            {/* Selection counter */}
            <div className="flex items-center justify-between text-[0.8125rem]">
              <span className="text-ink-600">
                <strong className="text-navy font-semibold">
                  {selected.size}
                </strong>{' '}
                / {classes.length} classe{classes.length > 1 ? 's' : ''}
              </span>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-ink-400 hover:text-navy font-medium underline-offset-2 hover:underline"
                >
                  Tout désélectionner
                </button>
              )}
              {selected.size < classes.length && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set(classes.map((c) => c.id)))}
                  className="text-navy hover:text-navy-light font-semibold underline-offset-2 hover:underline"
                >
                  Tout sélectionner
                </button>
              )}
            </div>

            {/* Premier cycle */}
            {grouped.premier.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
                  Premier cycle
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grouped.premier.map((c) => (
                    <ClassToggle
                      key={c.id}
                      classe={c}
                      checked={selected.has(c.id)}
                      onToggle={() => toggle(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Second cycle */}
            {grouped.second.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
                  Second cycle
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grouped.second.map((c) => (
                    <ClassToggle
                      key={c.id}
                      classe={c}
                      checked={selected.has(c.id)}
                      onToggle={() => toggle(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button
          onClick={save}
          loading={assignMut.isPending}
          disabled={empty}
          leadingIcon={!assignMut.isPending ? <Save className="h-4 w-4" /> : undefined}
        >
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  )
}

interface ClassToggleProps {
  classe: Classe
  checked: boolean
  onToggle: () => void
}

function ClassToggle({ classe, checked, onToggle }: ClassToggleProps) {
  return (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      label={
        <span className="font-display font-semibold text-navy">
          {nomClasse(classe)}
        </span>
      }
      description={
        classe.cycle === 'second' && classe.serie
          ? `Série ${classe.serie}`
          : classe.cycle === 'premier'
            ? 'Premier cycle'
            : undefined
      }
      containerClassName={`p-3 rounded-md border-[1.5px] cursor-pointer transition-colors ${
        checked
          ? 'border-navy bg-info-bg'
          : 'border-ink-100 bg-white hover:border-navy/40'
      }`}
    />
  )
}

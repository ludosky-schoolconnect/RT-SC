/**
 * RT-SC · ModalCreateClasse
 *
 * Modal form to create a class:
 *   - Cycle (radio: premier / second)
 *   - Niveau (select, options depend on cycle)
 *   - Série (select, only shown for second cycle)
 *   - Salle (free text, e.g. "M1", "A", "1")
 *
 * Uses the active année from ecole/config.
 */

import { useState, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
import {
  Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Radio } from '@/components/ui/Checkbox'
import { useCreateClasse } from '@/hooks/useClassesMutations'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import { niveauxDuCycle, SERIES, nomClasse } from '@/lib/benin'
import type { Cycle, Niveau, Serie } from '@/types/models'

interface ModalCreateClasseProps {
  open: boolean
  onClose: () => void
}

export function ModalCreateClasse({ open, onClose }: ModalCreateClasseProps) {
  const toast = useToast()
  const { data: config } = useEcoleConfig()
  const createMut = useCreateClasse()

  const [cycle, setCycle] = useState<Cycle>('premier')
  const [niveau, setNiveau] = useState<Niveau | ''>('')
  const [serie, setSerie] = useState<Serie | ''>('')
  const [salle, setSalle] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset when opened
  useEffect(() => {
    if (open) {
      setCycle('premier')
      setNiveau('')
      setSerie('')
      setSalle('')
      setError(null)
    }
  }, [open])

  // When cycle changes, reset niveau and série
  useEffect(() => {
    setNiveau('')
    setSerie('')
  }, [cycle])

  const niveauOptions = useMemo(() => niveauxDuCycle(cycle), [cycle])

  // Live preview of class name
  const preview = useMemo(() => {
    if (!niveau || !salle.trim()) return null
    if (cycle === 'second' && !serie) return null
    return nomClasse({
      cycle,
      niveau,
      serie: cycle === 'second' ? (serie || null) : null,
      salle: salle.trim(),
    })
  }, [cycle, niveau, serie, salle])

  async function submit() {
    setError(null)

    if (!niveau) return setError('Choisissez un niveau.')
    if (cycle === 'second' && !serie) return setError('Choisissez une série.')
    if (!salle.trim()) return setError('Indiquez la salle ou groupe (ex: M1, A, 1).')
    if (!config?.anneeActive) {
      return setError("L'année active n'est pas configurée. Allez dans l'onglet Année.")
    }

    try {
      await createMut.mutateAsync({
        cycle,
        niveau: niveau as Niveau,
        serie: cycle === 'second' ? (serie as Serie) : null,
        salle: salle.trim(),
        annee: config.anneeActive,
      })
      toast.success(`Classe ${preview} créée.`)
      onClose()
    } catch (err) {
      console.error('[ModalCreateClasse] error:', err)
      setError("Erreur lors de la création. Réessayez.")
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Nouvelle classe</ModalTitle>
        <ModalDescription>
          Définissez le cycle, le niveau et la salle. Un code d'accès unique
          sera généré automatiquement.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-5">
          {/* Cycle */}
          <fieldset className="space-y-2">
            <legend className="text-[0.8125rem] font-semibold text-ink-800 mb-2">
              Cycle
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <Radio
                name="cycle"
                checked={cycle === 'premier'}
                onChange={() => setCycle('premier')}
                label="Premier cycle"
                description="6ème → 3ème"
                containerClassName="bg-white border border-ink-100 hover:border-navy rounded-md p-3 transition-colors"
              />
              <Radio
                name="cycle"
                checked={cycle === 'second'}
                onChange={() => setCycle('second')}
                label="Second cycle"
                description="2nde → Terminale"
                containerClassName="bg-white border border-ink-100 hover:border-navy rounded-md p-3 transition-colors"
              />
            </div>
          </fieldset>

          {/* Niveau */}
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

          {/* Série (second cycle only) */}
          {cycle === 'second' && (
            <Select
              label="Série"
              value={serie}
              onChange={(e) => setSerie(e.target.value as Serie | '')}
              hint="A & B littéraires · C & D scientifiques"
            >
              <option value="">— Choisir —</option>
              {SERIES.map((s) => (
                <option key={s} value={s}>
                  Série {s}
                </option>
              ))}
            </Select>
          )}

          {/* Salle */}
          <Input
            label="Salle / groupe"
            value={salle}
            onChange={(e) => setSalle(e.target.value)}
            placeholder="Ex: M1, A, 1"
            hint="Identifiant court, distingue les classes du même niveau."
            maxLength={4}
            error={error ?? undefined}
          />

          {/* Live preview */}
          {preview && (
            <div className="rounded-md bg-info-bg border border-navy/15 px-4 py-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-navy/70">
                Aperçu
              </p>
              <p className="font-display text-lg font-bold text-navy mt-0.5">
                {preview}
              </p>
            </div>
          )}
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
          Créer la classe
        </Button>
      </ModalFooter>
    </Modal>
  )
}

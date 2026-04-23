/**
 * RT-SC · BulletinObservationsEditor (Bulletin v2, Session 2).
 *
 * Inline editor rendered inside the bulletin detail modal, above the
 * <BulletinView />. Only shown to admin and to the class's professeur
 * principal (see ModalBulletinDetail's canEdit check). Lets them:
 *   - Write observations du chef d'établissement (≤ 500 chars, counter shown)
 *   - Pick a décision du conseil from a fixed list (or "Aucune décision")
 *
 * Saves via useUpdateBulletinObservations, merging into the bulletin doc.
 * Does NOT mutate any other bulletin field — this is purely the editor
 * overlay on top of engine-computed data.
 *
 * Design notes:
 *   - The local editable state is seeded from the view's observationsChef
 *     / decisionConseil and resets whenever those upstream values change
 *     (e.g. another admin edited concurrently and the snapshot refreshed).
 *   - We show the card collapsed by default ONLY when both fields are
 *     empty — reduces clutter for newly-generated bulletins. When any
 *     value exists, the card expands so the reviewer sees it immediately.
 */

import { useEffect, useMemo, useState } from 'react'
import { MessageSquareText, Save, Sparkles, Undo2 } from 'lucide-react'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useUpdateBulletinObservations } from '@/hooks/useBulletinObservations'
import { useToast } from '@/stores/toast'
import type { DecisionConseil, Periode } from '@/types/models'

const MAX_OBSERVATIONS = 500

const DECISION_OPTIONS: DecisionConseil[] = [
  "Tableau d'Honneur",
  'Félicitations',
  'Encouragement',
  'Avertissement',
  'Blâme',
]

interface BulletinObservationsEditorProps {
  classeId: string
  eleveId: string
  /**
   * Period name for the bulletin doc — typically a real period like
   * "Trimestre 1" / "Semestre 2", or the literal "Année" for the
   * annual bulletin. Both write to /bulletins/{periode}.
   */
  periode: Periode
  /** Currently stored observations (from the enriched view). */
  currentObservations?: string
  /** Currently stored décision (from the enriched view). */
  currentDecision?: DecisionConseil
  /**
   * Session 5 — when true, the editor renders with annual-bulletin
   * copy ("Observations annuelles", "Décision du conseil annuel").
   * Behavior is otherwise identical: the same fields are written to
   * the same doc structure (just under doc id "Année").
   */
  isAnnual?: boolean
}

export function BulletinObservationsEditor({
  classeId,
  eleveId,
  periode,
  currentObservations,
  currentDecision,
  isAnnual = false,
}: BulletinObservationsEditorProps) {
  const mut = useUpdateBulletinObservations()
  const toast = useToast()

  const [observations, setObservations] = useState(currentObservations ?? '')
  const [decision, setDecision] = useState<DecisionConseil | ''>(
    currentDecision ?? ''
  )

  // Reset local state whenever the upstream values change — this covers
  // two cases: the modal opens for a different (élève × period), OR a
  // concurrent write lands while the modal is open.
  useEffect(() => {
    setObservations(currentObservations ?? '')
  }, [currentObservations])
  useEffect(() => {
    setDecision(currentDecision ?? '')
  }, [currentDecision])

  const isDirty = useMemo(() => {
    if ((currentObservations ?? '') !== observations) return true
    if ((currentDecision ?? '') !== decision) return true
    return false
  }, [currentObservations, currentDecision, observations, decision])

  const charCount = observations.length
  const overLimit = charCount > MAX_OBSERVATIONS

  async function handleSave() {
    if (overLimit) {
      toast.warning(`Les observations dépassent ${MAX_OBSERVATIONS} caractères.`)
      return
    }
    try {
      await mut.mutateAsync({
        classeId,
        eleveId,
        periode,
        observationsChef: observations,
        decisionConseil: decision || undefined,
      })
      toast.success('Observations enregistrées.')
    } catch {
      toast.error("Erreur lors de l'enregistrement.")
    }
  }

  function handleReset() {
    setObservations(currentObservations ?? '')
    setDecision(currentDecision ?? '')
  }

  const hasAny = Boolean(currentObservations || currentDecision)

  return (
    <section
      className="rounded-lg border-[1.5px] border-gold/30 bg-gold-pale/30 p-4 mb-4 print:hidden"
      aria-label="Éditeur d'observations et de décision"
    >
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white border-[1.5px] border-gold/30 text-gold-dark">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[0.875rem] font-semibold text-navy leading-tight">
              {isAnnual ? 'Observations annuelles' : 'Observations & décision'}
            </p>
            <p className="text-[0.7rem] text-ink-500 leading-snug">
              Visible uniquement par l'admin et le PP de la classe.
            </p>
          </div>
        </div>
        {hasAny && (
          <Badge variant="gold" size="sm">
            Renseigné
          </Badge>
        )}
      </header>

      <div className="space-y-3">
        <Textarea
          label="Observations du chef d'établissement"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Un mot du ou de la directrice à l'élève…"
          rows={4}
          error={overLimit ? `Limite : ${MAX_OBSERVATIONS} caractères.` : undefined}
          hint={
            !overLimit
              ? `${charCount} / ${MAX_OBSERVATIONS} caractères · visible par l'élève et ses parents`
              : undefined
          }
          className="bg-white"
        />

        <Select
          label={
            isAnnual
              ? 'Décision du conseil annuel'
              : 'Décision du conseil de classe'
          }
          value={decision}
          onChange={(e) =>
            setDecision(e.target.value as DecisionConseil | '')
          }
          hint="Laisser sur « Aucune décision » pour ne rien afficher."
        >
          <option value="">Aucune décision</option>
          {DECISION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>

        {/* Action row.
            Session 6 fix — used to be a single horizontal flex with
            help-text on the left and buttons on the right. On narrow
            phone screens the help-text would overflow and squeeze
            "Enregistrer" past the modal's right edge. Now: help-text
            on its own row first, buttons in their own right-aligned
            row below. Always-visible "Enregistrer" regardless of
            screen width or text wrapping. */}
        <div className="pt-1 space-y-2">
          <div className="flex items-start gap-2">
            <MessageSquareText className="h-3.5 w-3.5 text-ink-400 shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.7rem] text-ink-500 leading-snug">
              Les modifications sont sauvegardées séparément des notes du
              bulletin.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={mut.isPending}
                leadingIcon={<Undo2 className="h-3.5 w-3.5" />}
              >
                Annuler
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || overLimit}
              loading={mut.isPending}
              leadingIcon={<Save className="h-3.5 w-3.5" />}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

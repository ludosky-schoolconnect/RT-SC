/**
 * RT-SC · ModalGiveColle — issue, view, or delete colles for an élève.
 *
 * Lock semantics — TWO independent gates, both result in read-only mode:
 *
 *   1. The PROF has clôturé THEIR matière for this period
 *      (Note doc has estCloture = true for this élève × matière × période).
 *      → "You committed your matière for this period; if discipline issues
 *         come up after clôture, give the colle for the NEXT period or
 *         contact the PP."
 *
 *   2. The bulletin for (élève × période) has been GENERATED
 *      → "Period is finalized; the PP must déverrouiller to make changes."
 *
 * Either lock disables both adding AND deleting. Why both?
 * Adding changes total heures up; deleting changes it down. Both shift
 * the conduite calculation, both create silent drift if done after the
 * relevant commitment moment.
 *
 * The "Déjà sur cette période" panel is ALWAYS shown (even when locked)
 * so profs always have full visibility into discipline history.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, type Timestamp } from 'firebase/firestore'
import { AlertOctagon, Lock, Calendar, Trash2 } from 'lucide-react'
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
import { Spinner } from '@/components/ui/Spinner'
import { useColles, useAddColle, useDeleteColle } from '@/hooks/useColles'
import { useProfs } from '@/hooks/useProfs'
import { noteIdFor } from '@/hooks/useNotes'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { db } from '@/firebase'
import { bulletinDoc, notesCol } from '@/lib/firestore-keys'
import { cn } from '@/lib/cn'
import type { Colle, Periode } from '@/types/models'

interface ModalGiveColleProps {
  open: boolean
  onClose: () => void
  classeId: string
  eleveId: string
  eleveName: string
  matiere: string
  periode: Periode
}

const PRESETS = [2, 4, 6, 8]
const DEFAULT_HEURES = 2
const MAX_HEURES = 24

export function ModalGiveColle({
  open,
  onClose,
  classeId,
  eleveId,
  eleveName,
  matiere,
  periode,
}: ModalGiveColleProps) {
  const profilUid = useAuthStore((s) => s.user?.uid)
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const addMut = useAddColle()
  const deleteMut = useDeleteColle()
  const { data: allColles = [] } = useColles(classeId, eleveId)
  const { data: profs = [] } = useProfs()

  const profNameById = new Map(profs.map((p) => [p.id, p.nom]))
  const periodColles = allColles.filter((c) => c.periode === periode)
  const totalForPeriod = periodColles.reduce(
    (sum, c) => sum + (c.heures ?? 0),
    0
  )
  const ptsLostForPeriod = Math.floor(totalForPeriod / 2)

  // ─── Lock check ───
  //
  // Two independent gates, both treated identically (same notice, same
  // disabled buttons). Either one being true freezes the colle state for
  // this (élève × période × matière) view.
  //
  //   • matière clôturé — the prof committed their matière for this period
  //   • bulletin generated — the PP finalized the period
  //
  // Why same notice for both? Two reasons. (a) The prof doesn't need to
  // know the internal cause; their action is the same: contact the PP for
  // any change. (b) For the matière-closure case, "give it for the next
  // period" is encouraged elsewhere (the prof can just switch the period
  // selector at the top of Saisie); we don't repeat that workflow inside
  // a sub-modal.
  const { data: lockState, isLoading: lockChecking } = useQuery<{
    locked: boolean
  }>({
    queryKey: ['colle-modal-locks', classeId, eleveId, matiere, periode],
    enabled: open && !!classeId && !!eleveId && !!matiere && !!periode,
    staleTime: 30_000,
    queryFn: async () => {
      const notePath = `${notesCol(classeId, eleveId)}/${noteIdFor(periode, matiere)}`
      const [noteSnap, bullSnap] = await Promise.all([
        getDoc(doc(db, notePath)),
        getDoc(doc(db, bulletinDoc(classeId, eleveId, periode))),
      ])
      const noteData = noteSnap.exists() ? (noteSnap.data() as { estCloture?: boolean }) : null
      const matiereClotured = noteData?.estCloture === true
      const bulletinExists = bullSnap.exists()
      return { locked: matiereClotured || bulletinExists }
    },
  })

  const locked = lockState?.locked === true

  // ─── Form state ───
  const [heures, setHeures] = useState<number>(DEFAULT_HEURES)
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState<string>('')
  const [motif, setMotif] = useState('')

  // Validation. In CUSTOM mode, the source of truth is the input string,
  // not the lagging `heures` state — so we re-derive validity from the
  // string, not from `heures`. Otherwise typing "3" but never updating
  // `heures` (which stays at 2) would falsely report valid.
  const customParsedNum = customMode ? parseInt(customValue.trim(), 10) : NaN
  const customParseError =
    customMode && customValue !== ''
      ? !/^\d+$/.test(customValue.trim())
        ? 'Nombre entier requis.'
        : isNaN(customParsedNum) || customParsedNum <= 0 || customParsedNum > MAX_HEURES
          ? `Entre 2 et ${MAX_HEURES} heures.`
          : customParsedNum % 2 !== 0
            ? 'Doit être un nombre pair (les colles sont par tranches de 2h).'
            : null
      : null

  const isHeuresValid = customMode
    ? customValue.trim() !== '' && customParseError === null
    : heures > 0 && heures <= MAX_HEURES && heures % 2 === 0

  // The actual hours that will be saved — derived, not from a possibly-stale state
  const heuresToSave = customMode ? customParsedNum : heures

  function reset() {
    setHeures(DEFAULT_HEURES)
    setCustomMode(false)
    setCustomValue('')
    setMotif('')
  }

  function chooseHeures(n: number) {
    setCustomMode(false)
    setHeures(n)
  }

  function onCustomChange(v: string) {
    setCustomValue(v)
  }

  async function submit() {
    if (locked || lockChecking) return
    if (!profilUid) {
      toast.error('Session prof invalide.')
      return
    }
    if (!isHeuresValid) {
      toast.error("Nombre d'heures invalide. Doit être un nombre pair.")
      return
    }
    try {
      await addMut.mutateAsync({
        classeId,
        eleveId,
        periode,
        matiere,
        heures: heuresToSave,
        professeurId: profilUid,
        motif: motif.trim() || undefined,
      })
      toast.success(
        `Colle de ${heuresToSave}h enregistrée pour ${eleveName} (${periode}).`
      )
      reset()
      onClose()
    } catch (err) {
      console.error('[ModalGiveColle] write failed:', err)
      toast.error("Échec de l'enregistrement. Réessayez.")
    }
  }

  async function deleteColle(colle: Colle) {
    if (locked || lockChecking) return
    const ok = await confirm({
      title: 'Supprimer cette colle ?',
      message: `Supprimer la colle de ${colle.heures}h de ${colle.matiere} (${periode}) pour ${eleveName} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({
        classeId,
        eleveId,
        colleId: colle.id,
      })
      toast.success(`Colle de ${colle.heures}h supprimée.`)
      // Force refetch so the list re-renders. The onSnapshot in useColles
      // will also fire; this just makes it instant.
      qc.invalidateQueries({ queryKey: ['colles', classeId, eleveId] })
    } catch (err) {
      console.error('[ModalGiveColle] delete failed:', err)
      toast.error('Échec de la suppression.')
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader onClose={handleClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-danger-bg text-danger ring-1 ring-danger/30">
            <AlertOctagon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Donner une colle</ModalTitle>
            <ModalDescription>
              {eleveName} · {matiere} · {periode}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {lockChecking ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Existing colles for this period */}
            <ExistingCollesPanel
              colles={periodColles}
              periode={periode}
              totalHeures={totalForPeriod}
              ptsLost={ptsLostForPeriod}
              profNameById={profNameById}
              onDelete={locked ? undefined : deleteColle}
              deletingId={deleteMut.isPending ? deleteMut.variables?.colleId : undefined}
            />

            {locked ? (
              <LockedNotice />
            ) : (
              <>
                {/* Hours preset buttons */}
                <div>
                  <p className="text-[0.8125rem] font-semibold text-ink-700 mb-2">
                    Nouvelle colle · nombre d'heures
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESETS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => chooseHeures(h)}
                        className={cn(
                          'min-w-[3rem] rounded-md border-[1.5px] px-3 py-2 font-mono font-bold tabular-nums transition-all',
                          heures === h && !customMode
                            ? 'border-danger bg-danger-bg text-danger ring-2 ring-danger/30'
                            : 'border-ink-100 bg-white text-ink-600 hover:border-ink-200'
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomMode(true)
                        if (!customValue) setCustomValue(String(heures))
                      }}
                      className={cn(
                        'min-w-[4rem] rounded-md border-[1.5px] px-3 py-2 text-[0.78rem] font-semibold transition-all',
                        customMode
                          ? 'border-danger bg-danger-bg text-danger ring-2 ring-danger/30'
                          : 'border-ink-100 bg-white text-ink-500 hover:border-ink-200'
                      )}
                    >
                      Autre
                    </button>
                  </div>

                  {customMode && (
                    <div className="mt-2">
                      <Input
                        type="number"
                        value={customValue}
                        onChange={(e) => onCustomChange(e.target.value)}
                        min={2}
                        max={MAX_HEURES}
                        step={2}
                        placeholder="Nombre d'heures (pair)"
                        hint={
                          customParseError ?? `Nombre pair entre 2 et ${MAX_HEURES} heures.`
                        }
                        error={customParseError ?? undefined}
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                {/* Motif */}
                <Input
                  label="Motif (facultatif)"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="ex. Bavardage répété, devoir non fait…"
                  maxLength={120}
                  hint="Optionnel — visible uniquement par les profs."
                />

                {/* Impact preview */}
                <ImpactPreview heures={heuresToSave} valid={isHeuresValid} />
              </>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {locked ? (
          <Button variant="primary" onClick={handleClose}>
            Fermer
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={addMut.isPending}
              disabled={!isHeuresValid || lockChecking}
            >
              Enregistrer la colle
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  )
}

// ─── ExistingCollesPanel ─────────────────────────────────────

function ExistingCollesPanel({
  colles,
  periode,
  totalHeures,
  ptsLost,
  profNameById,
  onDelete,
  deletingId,
}: {
  colles: Colle[]
  periode: Periode
  totalHeures: number
  ptsLost: number
  profNameById: Map<string, string>
  /** When undefined, delete buttons are not rendered (locked mode). */
  onDelete?: (c: Colle) => void
  deletingId?: string
}) {
  const empty = colles.length === 0

  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/30 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-ink-50/60 border-b border-ink-100">
        <p className="text-[0.7rem] uppercase tracking-wider font-bold text-ink-600">
          Déjà sur cette période ({periode})
        </p>
        {!empty && (
          <p className="text-[0.78rem] font-mono tabular-nums">
            <span className="font-bold text-danger">{totalHeures}h</span>
            {ptsLost > 0 && (
              <span className="text-warning ml-1.5 text-[0.7rem] font-semibold">
                · −{ptsLost} pt{ptsLost > 1 ? 's' : ''} conduite
              </span>
            )}
          </p>
        )}
      </div>

      {empty ? (
        <p className="px-3.5 py-4 text-[0.8125rem] text-ink-500 text-center">
          Aucune colle pour cette période.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {colles.map((c) => (
            <ColleRow
              key={c.id}
              colle={c}
              profName={profNameById.get(c.professeurId) ?? '—'}
              onDelete={onDelete}
              isDeleting={deletingId === c.id}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ColleRow({
  colle,
  profName,
  onDelete,
  isDeleting,
}: {
  colle: Colle
  profName: string
  onDelete?: (c: Colle) => void
  isDeleting: boolean
}) {
  const dateLabel = formatColleDate(colle.date)
  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <p className="text-[0.875rem] font-semibold text-navy">
          <span className="font-mono tabular-nums text-danger">{colle.heures}h</span>
          {' · '}
          {colle.matiere}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[0.7rem] text-ink-500 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden />
            {dateLabel}
          </p>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(colle)}
              disabled={isDeleting}
              aria-label={`Supprimer la colle de ${colle.heures}h`}
              title="Supprimer cette colle"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-danger hover:bg-danger-bg/60 active:bg-danger-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed !min-h-0 !min-w-0"
            >
              {isDeleting ? (
                <Spinner size="sm" className="!gap-0" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
      <p className="text-[0.7rem] text-ink-500">
        Donnée par <span className="font-medium text-ink-700">{profName}</span>
        {colle.motif && (
          <>
            <span className="mx-1.5">·</span>
            <span className="italic">"{colle.motif}"</span>
          </>
        )}
      </p>
    </li>
  )
}

// ─── LockedNotice ────────────────────────────────────────────

function LockedNotice() {
  return (
    <div className="rounded-lg bg-warning-bg/60 border border-warning/30 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning ring-1 ring-warning/30">
          <Lock className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] text-navy font-bold leading-tight">
            Période verrouillée
          </p>
          <p className="text-[0.78rem] text-ink-700 mt-1 leading-snug">
            Cette colle ne peut plus être ajoutée ni supprimée. Pour toute
            modification, contactez le{' '}
            <span className="font-semibold">professeur principal</span>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── ImpactPreview ───────────────────────────────────────────

function ImpactPreview({ heures, valid }: { heures: number; valid: boolean }) {
  const ptsLost = Number.isFinite(heures) ? Math.floor(heures / 2) : 0
  return (
    <div className="rounded-md bg-info-bg/40 border border-navy/10 px-3 py-2.5 text-[0.78rem] text-ink-700 leading-snug">
      <span className="font-semibold text-navy">Impact sur la conduite</span>
      {' : '}
      {valid && Number.isFinite(heures) && heures > 0 ? (
        <>
          cette colle retire{' '}
          <span className="font-bold text-danger">
            {ptsLost} point{ptsLost > 1 ? 's' : ''}
          </span>{' '}
          sur la note de conduite de cette période (1 point par tranche de 2
          heures). Les colles d'autres périodes ne sont pas affectées.
        </>
      ) : (
        <>Choisissez un nombre d'heures valide pour voir l'impact.</>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

function formatColleDate(date: Timestamp | null | undefined): string {
  if (!date) return '—'
  try {
    const d = date.toDate()
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return '—'
  }
}

/**
 * RT-SC · Delete archived year — danger-gated modal.
 *
 * Three-step flow:
 *   1. 'confirm' — loads counts, shows full inventory of what will be
 *      deleted, admin must type the year string to proceed
 *   2. 'execute' — runs the recursive delete with progress bar
 *   3. 'done' — success or error, single Close button
 *
 * No overlay-close and no Escape-close during 'execute' step — once
 * deletion starts, interrupting produces a partially-deleted tree which
 * looks broken in the archive view but isn't corruptible (the rollover
 * doesn't re-write, so orphans just sit there. Admin can retry and
 * finish the job.)
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/stores/toast'
import { useQueryClient } from '@tanstack/react-query'
import {
  countArchivedYearDocs,
  useDeleteArchivedYear,
} from '@/hooks/useDeleteArchivedYear'

interface Props {
  open: boolean
  annee: string
  onClose: () => void
}

type Step = 'confirm' | 'execute' | 'done'

interface Counts {
  classes: number
  eleves: number
  bulletins: number
  notes: number
  absences: number
  paiements: number
  colles: number
  annonces: number
  seances: number
}

export function ModalDeleteArchivedYear({ open, annee, onClose }: Props) {
  const [step, setStep] = useState<Step>('confirm')
  const [confirmText, setConfirmText] = useState('')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [progress, setProgress] = useState({ stage: '', done: 0, total: 0 })
  const [err, setErr] = useState<string | null>(null)

  const toast = useToast()
  const qc = useQueryClient()
  const deleteMut = useDeleteArchivedYear()

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep('confirm')
      setConfirmText('')
      setCounts(null)
      setErr(null)
      setProgress({ stage: '', done: 0, total: 0 })

      setCountsLoading(true)
      countArchivedYearDocs(annee)
        .then((c) => setCounts(c))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setCountsLoading(false))
    }
  }, [open, annee])

  const confirmMatches = confirmText.trim() === annee.trim()
  const canExecute = confirmMatches && !!counts && step === 'confirm'

  async function execute() {
    if (!canExecute) return
    setStep('execute')
    try {
      await deleteMut.mutateAsync({
        annee,
        onProgress: (p) => setProgress(p),
      })
      setStep('done')
      qc.invalidateQueries({ queryKey: ['archive', 'years'] })
      qc.invalidateQueries({ queryKey: ['archive', annee] })
      toast.success(`Archive ${annee} supprimée définitivement.`)
    } catch (e) {
      console.error('[DeleteArchivedYear] fatal:', e)
      setErr(e instanceof Error ? e.message : String(e))
      setStep('done')
      toast.error("Échec de la suppression.")
    }
  }

  const inExecute = step === 'execute'
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0

  return (
    <Modal
      open={open}
      onClose={inExecute ? () => {} : onClose}
      size="md"
      disableOverlayClose={inExecute}
      disableEscClose={inExecute}
    >
      <ModalHeader>
        <ModalTitle>Supprimer l'archive {annee}</ModalTitle>
        <ModalDescription>
          Cette action est <strong className="text-danger">définitive</strong>.
          L'archive complète de l'année sera détruite.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {step === 'confirm' && (
          <ConfirmStep
            annee={annee}
            counts={counts}
            loading={countsLoading}
            err={err}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            confirmMatches={confirmMatches}
          />
        )}
        {step === 'execute' && (
          <ExecuteStep stage={progress.stage} done={progress.done} total={progress.total} pct={pct} />
        )}
        {step === 'done' && <DoneStep err={err} annee={annee} />}
      </ModalBody>

      <ModalFooter>
        {step === 'confirm' && (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button
              variant="danger"
              leadingIcon={<Trash2 className="h-4 w-4" />}
              disabled={!canExecute}
              onClick={execute}
            >
              Supprimer définitivement
            </Button>
          </>
        )}
        {step === 'execute' && (
          <Button variant="secondary" disabled>
            Suppression en cours…
          </Button>
        )}
        {step === 'done' && (
          <Button onClick={onClose}>Fermer</Button>
        )}
      </ModalFooter>
    </Modal>
  )
}

// ─── Confirm step ─────────────────────────────────────────────

function ConfirmStep({
  annee,
  counts,
  loading,
  err,
  confirmText,
  setConfirmText,
  confirmMatches,
}: {
  annee: string
  counts: Counts | null
  loading: boolean
  err: string | null
  confirmText: string
  setConfirmText: (s: string) => void
  confirmMatches: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-danger-bg border border-danger/30 p-3 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold text-danger text-[0.9rem]">
            Action irréversible
          </p>
          <p className="text-[0.82rem] text-danger/90 mt-0.5 leading-snug">
            Tous les dossiers élèves de l'année {annee} — bulletins, notes,
            absences, paiements — seront définitivement effacés. Aucun moyen
            de les récupérer après coup.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size="md" />
        </div>
      ) : err ? (
        <div className="rounded-md bg-warning-bg border border-warning/30 p-3 text-[0.82rem] text-warning-dark">
          Impossible de charger l'inventaire : {err}
        </div>
      ) : counts ? (
        <div className="rounded-lg border border-ink-100 bg-white p-3 space-y-1 text-[0.82rem]">
          <p className="font-semibold text-ink-700 mb-2">
            Contenu à détruire :
          </p>
          <CountLine label="Classes" n={counts.classes} />
          <CountLine label="Élèves" n={counts.eleves} />
          <CountLine label="Bulletins" n={counts.bulletins} />
          <CountLine label="Notes" n={counts.notes} />
          <CountLine label="Absences" n={counts.absences} />
          <CountLine label="Paiements" n={counts.paiements} />
          <CountLine label="Colles" n={counts.colles} />
          <CountLine label="Annonces" n={counts.annonces} />
          <CountLine label="Séances emploi du temps" n={counts.seances} />
        </div>
      ) : null}

      <div>
        <label className="block text-[0.82rem] font-semibold text-ink-700 mb-1.5">
          Pour confirmer, tapez <span className="font-mono text-danger">{annee}</span>
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={annee}
          autoComplete="off"
          spellCheck={false}
          className={
            confirmText && !confirmMatches
              ? 'ring-2 ring-danger/40 border-danger/40'
              : ''
          }
        />
        {confirmText && !confirmMatches && (
          <p className="text-[0.7rem] text-danger mt-1">
            Ne correspond pas. Tapez exactement « {annee} ».
          </p>
        )}
      </div>
    </div>
  )
}

function CountLine({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-600">{label}</span>
      <span className="font-mono font-semibold text-ink-800">{n}</span>
    </div>
  )
}

// ─── Execute step ─────────────────────────────────────────────

function ExecuteStep({
  stage,
  done,
  total,
  pct,
}: {
  stage: string
  done: number
  total: number
  pct: number
}) {
  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-danger shrink-0" aria-hidden />
        <p className="text-[0.9rem] font-semibold text-ink-700">
          Suppression en cours…
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
          <div
            className="h-full bg-danger transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[0.72rem] text-ink-500">
          <span className="truncate">{stage || '…'}</span>
          <span className="font-mono shrink-0">
            {done} / {total}
          </span>
        </div>
      </div>

      <p className="text-[0.72rem] text-ink-400 italic">
        Ne fermez pas cette fenêtre.
      </p>
    </div>
  )
}

// ─── Done step ────────────────────────────────────────────────

function DoneStep({ err, annee }: { err: string | null; annee: string }) {
  return (
    <div className="py-4 text-center">
      {err ? (
        <>
          <XCircle className="h-14 w-14 text-danger mx-auto mb-3" aria-hidden />
          <p className="font-display text-xl font-semibold text-navy">
            Échec de la suppression
          </p>
          <p className="text-[0.82rem] text-ink-600 mt-2">{err}</p>
          <p className="text-[0.72rem] text-ink-400 mt-3 italic">
            Certains éléments peuvent avoir déjà été supprimés. Vous pouvez
            relancer la suppression pour terminer le nettoyage.
          </p>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" aria-hidden />
          <p className="font-display text-xl font-semibold text-navy">
            Archive supprimée
          </p>
          <p className="text-[0.82rem] text-ink-600 mt-2">
            L'archive {annee} a été effacée définitivement.
          </p>
        </>
      )}
    </div>
  )
}

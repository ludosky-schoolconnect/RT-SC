/**
 * RT-SC · Year rollover — Final archive modal.
 *
 * School-wide. Archives all classes + élèves + subcollections, resets
 * each class with a fresh passkey, wipes vigilance/presences, archives
 * annonces + emploi du temps, then bumps anneeActive.
 *
 * Three steps:
 *   1. Pre-flight summary + warning + type-to-confirm
 *   2. Execution with multi-step progress
 *   3. Result + error list
 *
 * The execution is destructive and cannot be cancelled mid-flight, so
 * the modal explicitly disables overlay/escape close during step 2.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
} from 'lucide-react'
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
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import { useQueryClient } from '@tanstack/react-query'
import {
  bumpAnnee,
  executeFinalArchive,
  type ArchiveYearResult,
} from '@/lib/rollover'
import { cn } from '@/lib/cn'

interface ModalArchiveAnneeProps {
  open: boolean
  onClose: () => void
}

type Step = 'preflight' | 'execute' | 'done'

export function ModalArchiveAnnee({ open, onClose }: ModalArchiveAnneeProps) {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: config } = useEcoleConfig()

  const [step, setStep] = useState<Step>('preflight')
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState({ stepName: '', done: 0, total: 0 })
  const [result, setResult] = useState<ArchiveYearResult | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)

  const annee = config?.anneeActive ?? ''
  const newAnnee = useMemo(() => {
    if (!annee) return ''
    try {
      return bumpAnnee(annee)
    } catch {
      return ''
    }
  }, [annee])

  useEffect(() => {
    if (open) {
      setStep('preflight')
      setConfirmText('')
      setProgress({ stepName: '', done: 0, total: 0 })
      setResult(null)
      setFatalError(null)
    }
  }, [open])

  const confirmMatches = confirmText.trim() === annee.trim()
  const canExecute = !!annee && !!newAnnee && confirmMatches

  async function execute() {
    if (!canExecute) return
    setStep('execute')
    try {
      const res = await executeFinalArchive({
        annee,
        newAnnee,
        onProgress: (stepName, done, total) =>
          setProgress({ stepName, done, total }),
      })
      setResult(res)
      setStep('done')

      // Refresh everything that might be stale
      qc.invalidateQueries({ queryKey: ['classes'] })
      qc.invalidateQueries({ queryKey: ['ecole', 'config'] })
      qc.invalidateQueries({ queryKey: ['school-stats'] })
    } catch (err) {
      console.error('[ArchiveYear] fatal:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setFatalError(msg)
      setStep('done')
      toast.error("Échec de l'archivage. Voir les détails.")
    }
  }

  function renderBody() {
    switch (step) {
      case 'preflight':
        return (
          <PreflightStep
            annee={annee}
            newAnnee={newAnnee}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            confirmMatches={confirmMatches}
          />
        )
      case 'execute':
        return <ExecuteStep progress={progress} />
      case 'done':
        return <DoneStep result={result} fatalError={fatalError} newAnnee={newAnnee} />
    }
  }

  function renderFooter() {
    switch (step) {
      case 'preflight':
        return (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button variant="danger" onClick={execute} disabled={!canExecute}>
              Archiver l'année
            </Button>
          </>
        )
      case 'execute':
        return null
      case 'done':
        return (
          <Button onClick={onClose}>Fermer</Button>
        )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      disableOverlayClose={step === 'execute'}
      disableEscClose={step === 'execute'}
    >
      <ModalHeader onClose={step === 'execute' ? undefined : onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-danger-bg text-danger">
            <Archive className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Archiver l'année</ModalTitle>
            <ModalDescription>
              {step === 'preflight' && 'Action irréversible — confirmez avant exécution.'}
              {step === 'execute' && 'En cours…'}
              {step === 'done' && 'Terminé.'}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {renderBody()}
          </motion.div>
        </AnimatePresence>
      </ModalBody>

      {renderFooter() && <ModalFooter>{renderFooter()}</ModalFooter>}
    </Modal>
  )
}

// ─── Step 1: Pre-flight ─────────────────────────────────────

function PreflightStep({
  annee,
  newAnnee,
  confirmText,
  setConfirmText,
  confirmMatches,
}: {
  annee: string
  newAnnee: string
  confirmText: string
  setConfirmText: (v: string) => void
  confirmMatches: boolean
}) {
  if (!annee) {
    return (
      <div className="rounded-md bg-warning-bg border border-warning/30 p-4 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold text-warning text-sm">Aucune année configurée</p>
          <p className="text-[0.8125rem] text-warning/90 mt-0.5">
            Définissez l'année active dans la section précédente avant
            de procéder à l'archivage.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Year transition banner */}
      <div className="rounded-md bg-info-bg border border-navy/15 p-4 text-center">
        <p className="text-[0.7rem] font-bold uppercase tracking-widest text-navy/70 mb-1">
          Transition d'année
        </p>
        <p className="font-display text-2xl font-bold text-navy">
          {annee} <span className="text-ink-400">→</span> {newAnnee}
        </p>
      </div>

      {/* Warnings */}
      <div className="rounded-md bg-danger-bg border border-danger/30 p-4">
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" aria-hidden />
          <p className="font-semibold text-danger text-[0.875rem]">
            Cette action va :
          </p>
        </div>
        <ul className="space-y-1 ml-7 text-[0.8125rem] text-danger/90 list-disc">
          <li>Archiver toutes les classes, élèves et bulletins dans <code className="font-mono">/archive/{annee}</code></li>
          <li>Supprimer les notes, bulletins, paiements, absences actifs</li>
          <li>Réinitialiser le code d'accès de chaque classe</li>
          <li>Désassigner tous les professeurs principaux</li>
          <li>Vider les présences, vigilance IA et annonces</li>
          <li>Définir la nouvelle année active : <strong>{newAnnee}</strong></li>
        </ul>
        <p className="mt-3 text-[0.78rem] text-danger/80 italic ml-7">
          Les élèves échoués restent dans leur classe. Les admis sont déjà dans leur nouvelle classe (étape Transition).
        </p>
      </div>

      {/* Type-to-confirm */}
      <div>
        <Input
          label={`Pour confirmer, tapez exactement : ${annee}`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={annee}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          leading={<KeyRound className="h-4 w-4" />}
        />
        {confirmText && !confirmMatches && (
          <p className="mt-1 text-[0.78rem] text-warning">
            Le texte ne correspond pas exactement.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Step 2: Execute ────────────────────────────────────────

function ExecuteStep({ progress }: { progress: { stepName: string; done: number; total: number } }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const stepLabel = STEP_LABELS[progress.stepName] ?? progress.stepName

  return (
    <div className="py-8 text-center">
      <Loader2 className="h-12 w-12 text-navy mx-auto mb-3 animate-spin" aria-hidden />
      <p className="font-display text-lg font-semibold text-navy">
        Archivage en cours
      </p>
      <p className="text-sm text-ink-600 mt-1 mb-1">
        {stepLabel || 'Préparation…'}
      </p>
      <p className="text-[0.78rem] text-warning font-semibold mb-5">
        Ne fermez pas l'application.
      </p>

      <div className="max-w-sm mx-auto">
        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-navy"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="mt-2 text-[0.78rem] text-ink-400 tabular-nums">
          {progress.done} / {progress.total} ({pct}%)
        </p>
      </div>
    </div>
  )
}

const STEP_LABELS: Record<string, string> = {
  classes: 'Archivage des classes…',
  vigilance: 'Réinitialisation Vigilance IA…',
  annonces: 'Archivage des annonces…',
  annee: 'Mise à jour de l\'année active…',
}

// ─── Step 3: Done ───────────────────────────────────────────

function DoneStep({
  result,
  fatalError,
  newAnnee,
}: {
  result: ArchiveYearResult | null
  fatalError: string | null
  newAnnee: string
}) {
  if (fatalError) {
    return (
      <div className="py-4 text-center">
        <XCircle className="h-14 w-14 text-danger mx-auto mb-3" aria-hidden />
        <p className="font-display text-xl font-semibold text-navy">Échec de l'archivage</p>
        <p className="text-[0.875rem] text-ink-600 mt-2">
          Une erreur fatale a interrompu l'opération. Les modifications partielles peuvent
          rester en place.
        </p>
        <pre className="mt-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-left text-[0.78rem] text-danger/90 font-mono whitespace-pre-wrap break-words">
          {fatalError}
        </pre>
      </div>
    )
  }

  const ok = (result?.errors.length ?? 0) === 0
  return (
    <div className="py-4 text-center">
      {ok ? (
        <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" aria-hidden />
      ) : (
        <AlertTriangle className="h-14 w-14 text-warning mx-auto mb-3" aria-hidden />
      )}
      <p className="font-display text-xl font-semibold text-navy">
        {ok ? 'Année archivée' : 'Archivage avec avertissements'}
      </p>
      <div className="mt-3 space-y-1 text-[0.875rem] text-ink-700">
        <p>
          <strong className="text-navy">{result?.classesProcessed ?? 0}</strong> classe
          {(result?.classesProcessed ?? 0) > 1 ? 's' : ''} traitée
          {(result?.classesProcessed ?? 0) > 1 ? 's' : ''}
        </p>
        <p>
          <strong className="text-navy">{result?.elevesArchived ?? 0}</strong> élève
          {(result?.elevesArchived ?? 0) > 1 ? 's' : ''} archivé
          {(result?.elevesArchived ?? 0) > 1 ? 's' : ''}
        </p>
        <p className="pt-1 text-success font-semibold">
          Nouvelle année active : {newAnnee}
        </p>
      </div>

      {result && result.errors.length > 0 && (
        <div className="mt-4 rounded-md bg-warning-bg border border-warning/20 p-3 text-left">
          <p className="font-semibold text-warning text-[0.8125rem] mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {result.errors.length} avertissement{result.errors.length > 1 ? 's' : ''}
          </p>
          <ul className={cn(
            "space-y-0.5 text-[0.78rem] text-warning/90 font-mono",
            result.errors.length > 4 && 'max-h-32 overflow-y-auto'
          )}>
            {result.errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

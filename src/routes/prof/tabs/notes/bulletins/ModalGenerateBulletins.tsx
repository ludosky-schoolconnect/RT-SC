/**
 * RT-SC · Bulletin generation modal (PP only).
 *
 * Three-step flow:
 *   1. Preflight — runs runPreflight, displays issues/summary
 *   2. Execute — calls computeBulletins + writeBulletins, shows progress
 *   3. Result — success counts, errors if any
 *
 * Errors block: if runPreflight returns canProceed=false, the Confirm
 * button is disabled. The PP must fix the underlying issue (e.g. ask the
 * prof to close a missing matière) and re-open the modal.
 *
 * Re-running on a class that already has bulletins overwrites the docs
 * (idempotent — doc id = period name). The modal warns about this.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  FileText,
  Lock,
  RefreshCw,
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
import {
  computeBulletins,
  runPreflight,
  writeBulletins,
  type GenerationInput,
  type GenerationWriteResult,
  type PreflightResult,
} from '@/lib/bulletinGeneration'
import { cn } from '@/lib/cn'

interface ModalGenerateBulletinsProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
  input: GenerationInput | null
  /** True if at least one bulletin already exists for this period — informational */
  hasExistingBulletins: boolean
}

type Step = 'preflight' | 'executing' | 'done'

export function ModalGenerateBulletins({
  open,
  onClose,
  onGenerated,
  input,
  hasExistingBulletins,
}: ModalGenerateBulletinsProps) {
  const [step, setStep] = useState<Step>('preflight')
  const [writeResult, setWriteResult] = useState<GenerationWriteResult | null>(null)

  const preflight: PreflightResult | null = useMemo(
    () => (input ? runPreflight(input) : null),
    [input]
  )

  useEffect(() => {
    if (open) {
      setStep('preflight')
      setWriteResult(null)
    }
  }, [open])

  async function execute() {
    if (!input || !preflight?.canProceed) return
    setStep('executing')
    const computed = computeBulletins(input)
    const result = await writeBulletins(input, computed)
    setWriteResult(result)
    setStep('done')
    if (result.errorCount === 0) {
      onGenerated()
    }
  }

  const errors = preflight?.issues.filter((i) => i.severity === 'error') ?? []
  const warnings = preflight?.issues.filter((i) => i.severity === 'warning') ?? []

  function renderBody() {
    if (!preflight || !input) return null

    switch (step) {
      case 'preflight':
        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-md border border-ink-100 bg-ink-50/30 p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-1">
                Récapitulatif
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <SummaryStat label="Élèves" value={input.eleves.length} />
                <SummaryStat label="Matières" value={preflight.matieresUsed.length} />
                <SummaryStat
                  label="Coef. Conduite"
                  value={input.coefficients['Conduite'] ?? 0}
                />
              </div>
            </div>

            {/* Existing-bulletins warning */}
            {hasExistingBulletins && (
              <div className="rounded-md bg-warning-bg/40 border border-warning/30 p-3 flex items-start gap-2">
                <RefreshCw className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
                <p className="text-[0.8125rem] text-warning leading-snug">
                  <strong>Régénération.</strong> Des bulletins existent déjà pour cette période.
                  Confirmer va les écraser avec les valeurs actuelles.
                </p>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div>
                <p className="text-[0.8125rem] font-bold text-danger mb-2 inline-flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" aria-hidden />
                  {errors.length} erreur{errors.length > 1 ? 's' : ''} bloquante{errors.length > 1 ? 's' : ''}
                </p>
                <ul className="rounded-md bg-danger-bg/30 border border-danger/20 divide-y divide-danger/10 max-h-48 overflow-y-auto">
                  {errors.map((err, i) => (
                    <li
                      key={i}
                      className="px-3 py-2 text-[0.78rem] text-danger/90"
                    >
                      • {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div>
                <p className="text-[0.8125rem] font-bold text-warning mb-2 inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {warnings.length} avertissement{warnings.length > 1 ? 's' : ''}
                </p>
                <ul className="rounded-md bg-warning-bg/30 border border-warning/20 divide-y divide-warning/10 max-h-32 overflow-y-auto">
                  {warnings.map((w, i) => (
                    <li
                      key={i}
                      className="px-3 py-2 text-[0.78rem] text-warning/90"
                    >
                      • {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* All clear */}
            {errors.length === 0 && warnings.length === 0 && (
              <div className="rounded-md bg-success-bg border border-success/20 px-4 py-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-semibold text-success text-[0.875rem]">
                    Tout est prêt pour la génération.
                  </p>
                  <p className="text-[0.8125rem] text-success/90 mt-0.5">
                    Toutes les matières sont clôturées et les coefficients sont définis.
                  </p>
                </div>
              </div>
            )}
          </div>
        )

      case 'executing':
        return (
          <div className="py-8 text-center">
            <Loader2 className="h-12 w-12 text-navy mx-auto mb-3 animate-spin" aria-hidden />
            <p className="font-display text-lg font-semibold text-navy">
              Génération en cours…
            </p>
            <p className="text-sm text-ink-600 mt-1">
              Calcul des moyennes générales et du classement.
            </p>
          </div>
        )

      case 'done':
        return (
          <div className="py-4 text-center">
            {writeResult && writeResult.errorCount === 0 ? (
              <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" aria-hidden />
            ) : (
              <XCircle className="h-14 w-14 text-danger mx-auto mb-3" aria-hidden />
            )}
            <p className="font-display text-xl font-semibold text-navy">
              {writeResult && writeResult.errorCount === 0
                ? 'Bulletins générés'
                : "Échec de la génération"}
            </p>
            <p className="text-[0.875rem] text-ink-600 mt-2">
              <strong className={cn(
                writeResult && writeResult.errorCount === 0 ? 'text-success' : 'text-danger'
              )}>
                {writeResult?.successCount ?? 0}
              </strong>{' '}
              bulletin{(writeResult?.successCount ?? 0) > 1 ? 's' : ''} écrit
              {(writeResult?.successCount ?? 0) > 1 ? 's' : ''}
            </p>
            {writeResult && writeResult.errors.length > 0 && (
              <div className="mt-4 rounded-md bg-danger-bg/30 border border-danger/20 p-3 text-left">
                <p className="font-semibold text-danger text-[0.8125rem] mb-1.5">
                  Erreurs
                </p>
                <ul className="space-y-0.5 text-[0.78rem] text-danger/90 font-mono max-h-32 overflow-y-auto">
                  {writeResult.errors.map((e, i) => (
                    <li key={i}>• {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
    }
  }

  function renderFooter() {
    switch (step) {
      case 'preflight':
        return (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={execute}
              disabled={!preflight?.canProceed}
              leadingIcon={<Lock className="h-4 w-4" />}
            >
              {hasExistingBulletins ? 'Régénérer' : 'Générer les bulletins'}
            </Button>
          </>
        )
      case 'executing':
        return null
      case 'done':
        return <Button onClick={onClose}>Fermer</Button>
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      disableOverlayClose={step === 'executing'}
      disableEscClose={step === 'executing'}
    >
      <ModalHeader onClose={step === 'executing' ? undefined : onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-bg text-navy">
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Générer les bulletins</ModalTitle>
            <ModalDescription>
              {input ? `${input.eleves.length} élèves · ${input.periode}` : '—'}
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
            transition={{ duration: 0.18 }}
          >
            {renderBody()}
          </motion.div>
        </AnimatePresence>
      </ModalBody>
      {renderFooter() && <ModalFooter>{renderFooter()}</ModalFooter>}
    </Modal>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className="font-display text-xl font-bold text-navy mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  )
}

// Note on unused `Badge` import: removed from this file. If lint flags
// any unused imports, prune them in a follow-up.

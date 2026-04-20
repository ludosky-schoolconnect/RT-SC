/**
 * RT-SC · Annual closure modal (PP only, irreversible without admin).
 *
 * Same three-step pattern as ModalGenerateBulletins:
 *   1. Preflight — runs runAnnualPreflight, displays issues
 *   2. Execute — calls computeAnnualBulletins + writeAnnualBulletins
 *   3. Result — success/failure summary
 *
 * Uses a stronger danger-variant warning since this is the most consequential
 * operation in the whole grading flow. Once an élève is `statutAnnuel: 'Admis'`
 * or 'Échoué', that determines whether they advance. PP cannot undo — only
 * admin can via the admin panel (Phase 5 admin tool, not in this patch).
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  Award,
  Lock,
  ShieldAlert,
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
  computeAnnualBulletins,
  runAnnualPreflight,
  writeAnnualBulletins,
  type AnnualGenerationInput,
  type AnnualPreflightResult,
  type AnnualWriteResult,
} from '@/lib/annualClosure'
import { cn } from '@/lib/cn'

interface ModalAnnualClosureProps {
  open: boolean
  onClose: () => void
  onClosed: () => void
  input: AnnualGenerationInput | null
  hasExistingAnnual: boolean
}

type Step = 'preflight' | 'confirm' | 'executing' | 'done'

export function ModalAnnualClosure({
  open,
  onClose,
  onClosed,
  input,
  hasExistingAnnual,
}: ModalAnnualClosureProps) {
  const [step, setStep] = useState<Step>('preflight')
  const [writeResult, setWriteResult] = useState<AnnualWriteResult | null>(null)

  const preflight: AnnualPreflightResult | null = useMemo(
    () => (input ? runAnnualPreflight(input) : null),
    [input]
  )

  // Preview of what would be written, computed only when preflight passes
  const preview = useMemo(() => {
    if (!input || !preflight?.canProceed) return null
    return computeAnnualBulletins(input)
  }, [input, preflight])

  useEffect(() => {
    if (open) {
      setStep('preflight')
      setWriteResult(null)
    }
  }, [open])

  async function execute() {
    if (!input || !preflight?.canProceed) return
    setStep('executing')
    const computed = computeAnnualBulletins(input)
    const result = await writeAnnualBulletins(input.classeId, computed)
    setWriteResult(result)
    setStep('done')
    if (result.errorCount === 0) {
      onClosed()
    }
  }

  const errors = preflight?.issues.filter((i) => i.severity === 'error') ?? []

  // Quick stats from the preview for the confirm screen
  const stats = useMemo(() => {
    if (!preview) return null
    const admis = preview.filter((p) => p.eleveUpdate.statutAnnuel === 'Admis').length
    const echoue = preview.length - admis
    const moyenneClasse =
      preview.reduce((sum, p) => sum + p.eleveUpdate.moyenneAnnuelle, 0) /
      Math.max(1, preview.length)
    return { admis, echoue, moyenneClasse, total: preview.length }
  }, [preview])

  function renderBody() {
    if (!preflight || !input) return null

    switch (step) {
      case 'preflight':
        return (
          <div className="space-y-4">
            {/* Hard warning banner */}
            <div className="rounded-md bg-danger-bg/40 border border-danger/30 p-3 flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 text-danger shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="font-bold text-danger text-[0.875rem] mb-0.5">
                  Action irréversible
                </p>
                <p className="text-[0.8125rem] text-danger/90 leading-snug">
                  La clôture annuelle détermine quels élèves passent en classe
                  supérieure. Une fois validée, seul un administrateur peut
                  l'annuler. Vérifiez chaque période avant de continuer.
                </p>
              </div>
            </div>

            {/* Existing-annual warning */}
            {hasExistingAnnual && (
              <div className="rounded-md bg-warning-bg/40 border border-warning/30 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
                <p className="text-[0.8125rem] text-warning leading-snug">
                  <strong>Régénération.</strong> Une clôture annuelle existe déjà.
                  Confirmer va la remplacer.
                </p>
              </div>
            )}

            {/* Periods covered */}
            <div className="rounded-md border border-ink-100 bg-ink-50/30 p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
                Périodes incluses
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preflight.expectedPeriodes.map((p, i) => {
                  const isLast = i === preflight.expectedPeriodes.length - 1
                  const formule = input.bulletinConfig.formuleAnnuelle ?? 'standard'
                  return (
                    <span
                      key={p}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.78rem] font-semibold border',
                        isLast && formule === 'standard'
                          ? 'bg-gold/15 text-navy border-gold/40'
                          : 'bg-white text-ink-600 border-ink-200'
                      )}
                    >
                      {p}
                      {isLast && formule === 'standard' && (
                        <span className="text-[0.65rem] font-bold text-gold-dark">
                          ×2
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
              <p className="text-[0.7rem] text-ink-400 italic mt-2">
                {input.bulletinConfig.formuleAnnuelle === 'simple'
                  ? 'Formule : moyenne arithmétique simple.'
                  : 'Formule standard Bénin : la dernière période compte double.'}
              </p>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div>
                <p className="text-[0.8125rem] font-bold text-danger mb-2 inline-flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" aria-hidden />
                  {errors.length} erreur{errors.length > 1 ? 's' : ''} bloquante{errors.length > 1 ? 's' : ''}
                </p>
                <ul className="rounded-md bg-danger-bg/30 border border-danger/20 divide-y divide-danger/10 max-h-48 overflow-y-auto">
                  {errors.map((err, i) => (
                    <li key={i} className="px-3 py-2 text-[0.78rem] text-danger/90">
                      • {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* All clear */}
            {errors.length === 0 && stats && (
              <div className="rounded-md bg-success-bg border border-success/20 px-4 py-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-semibold text-success text-[0.875rem]">
                    Toutes les périodes sont prêtes.
                  </p>
                  <p className="text-[0.8125rem] text-success/90 mt-0.5">
                    {stats.total} élève{stats.total > 1 ? 's' : ''} prêt
                    {stats.total > 1 ? 's' : ''} pour la clôture annuelle.
                  </p>
                </div>
              </div>
            )}
          </div>
        )

      case 'confirm':
        if (!stats) return null
        return (
          <div className="space-y-4">
            <p className="text-[0.875rem] text-ink-700">
              Aperçu de ce qui sera écrit :
            </p>
            <div className="grid grid-cols-3 gap-2">
              <PreviewTile color="success" label="Admis" value={stats.admis} />
              <PreviewTile color="danger" label="Échoués" value={stats.echoue} />
              <PreviewTile
                color="navy"
                label="Moy. classe"
                value={stats.moyenneClasse.toFixed(2)}
              />
            </div>
            <div className="rounded-md bg-info-bg/30 border border-navy/15 p-3 text-[0.8125rem] text-navy leading-snug">
              Cette action :
              <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
                <li>Calcule la moyenne annuelle de chaque élève</li>
                <li>Détermine le statut (Admis / Échoué)</li>
                <li>Calcule le rang annuel</li>
                <li>Met à jour les fiches élèves</li>
                <li>Crée un bulletin annuel par élève</li>
              </ul>
            </div>
          </div>
        )

      case 'executing':
        return (
          <div className="py-8 text-center">
            <Loader2 className="h-12 w-12 text-navy mx-auto mb-3 animate-spin" aria-hidden />
            <p className="font-display text-lg font-semibold text-navy">
              Clôture annuelle en cours…
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
                ? 'Année clôturée'
                : 'Échec de la clôture'}
            </p>
            <p className="text-[0.875rem] text-ink-600 mt-2">
              <strong className={cn(
                writeResult && writeResult.errorCount === 0 ? 'text-success' : 'text-danger'
              )}>
                {writeResult?.successCount ?? 0}
              </strong>{' '}
              élève{(writeResult?.successCount ?? 0) > 1 ? 's' : ''} traité
              {(writeResult?.successCount ?? 0) > 1 ? 's' : ''}
            </p>
            {writeResult && writeResult.errors.length > 0 && (
              <div className="mt-4 rounded-md bg-danger-bg/30 border border-danger/20 p-3 text-left">
                <p className="font-semibold text-danger text-[0.8125rem] mb-1.5">Erreurs</p>
                <ul className="space-y-0.5 text-[0.78rem] text-danger/90 font-mono max-h-32 overflow-y-auto">
                  {writeResult.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
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
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button
              variant="primary"
              onClick={() => setStep('confirm')}
              disabled={!preflight?.canProceed}
            >
              Continuer
            </Button>
          </>
        )
      case 'confirm':
        return (
          <>
            <Button variant="secondary" onClick={() => setStep('preflight')}>
              Retour
            </Button>
            <Button
              variant="danger"
              onClick={execute}
              leadingIcon={<Lock className="h-4 w-4" />}
            >
              {hasExistingAnnual ? 'Régénérer la clôture annuelle' : 'Clôturer l\'année'}
            </Button>
          </>
        )
      case 'executing':
        return null
      case 'done':
        return <Button onClick={onClose}>Fermer</Button>
    }
  }

  const footer = renderFooter()

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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold/15 text-navy">
            <Award className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Clôture annuelle</ModalTitle>
            <ModalDescription>
              {input ? `${input.eleves.length} élèves` : '—'}
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
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </Modal>
  )
}

function PreviewTile({
  color,
  label,
  value,
}: {
  color: 'success' | 'danger' | 'navy'
  label: string
  value: number | string
}) {
  const C: Record<typeof color, string> = {
    success: 'bg-success-bg text-success border-success/20',
    danger: 'bg-danger-bg text-danger border-danger/20',
    navy: 'bg-info-bg text-navy border-navy/20',
  }
  return (
    <div className={cn('rounded-md border p-2 text-center', C[color])}>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider">{label}</p>
      <p className="font-display text-xl font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

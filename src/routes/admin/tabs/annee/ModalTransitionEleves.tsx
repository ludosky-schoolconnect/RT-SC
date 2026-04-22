/**
 * RT-SC · Year rollover — Transition élèves modal.
 *
 * Multi-step wizard for processing one source class at a time:
 *   1. Pick source class
 *   2. Classify each élève: Admis / Échoué / Abandonné  (default Échoué — safer)
 *   3. Pick destination for each Admis  (default: next-level class)
 *   4. Dry-run summary
 *   5. Execute with progress
 *
 * Élèves already flagged `_transfere: true` are filtered out — they've
 * already been processed in the current rollover session.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Users,
  Trash2,
  GraduationCap,
  AlertTriangle,
  Archive,
  Award,
  TrendingDown,
  UserMinus,
  Loader2,
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
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { useClasses } from '@/hooks/useClasses'
import { useEleves } from '@/hooks/useEleves'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useQueryClient } from '@tanstack/react-query'
import {
  executeTransition,
  type TransitionDecision,
  type TransitionResult,
  type TransitionStatut,
} from '@/lib/rollover'
import { nomClasse } from '@/lib/benin'
import type { Classe, Eleve, Niveau } from '@/types/models'
import { cn } from '@/lib/cn'

interface ModalTransitionElevesProps {
  open: boolean
  onClose: () => void
  /**
   * Called when admin asks to chain into the archive flow after
   * completing the last remaining class's transition. Parent should
   * close this modal and open ModalArchiveAnnee.
   */
  onRequestArchive?: () => void
}

type Step = 'select-class' | 'classify' | 'destinations' | 'review' | 'execute' | 'done'

// Niveau progression — used to suggest the next-level class
const NEXT_NIVEAU: Partial<Record<Niveau, Niveau>> = {
  '6ème': '5ème',
  '5ème': '4ème',
  '4ème': '3ème',
  '3ème': '2nde',
  '2nde': '1ère',
  '1ère': 'Terminale',
}

export function ModalTransitionEleves({
  open,
  onClose,
  onRequestArchive,
}: ModalTransitionElevesProps) {
  const toast = useToast()
  const askConfirm = useConfirm()
  const qc = useQueryClient()
  const { data: config } = useEcoleConfig()
  const { data: classes = [] } = useClasses()

  const [step, setStep] = useState<Step>('select-class')
  const [sourceClasseId, setSourceClasseId] = useState<string>('')
  const [decisions, setDecisions] = useState<Record<string, TransitionStatut>>({})
  const [destinations, setDestinations] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<TransitionResult | null>(null)
  // Snapshot of total attempted — captured at execute time so the Done
  // step's "X sur Y" stays accurate even after onSnapshot shrinks
  // pendingEleves (admis élèves vanish from source once moved).
  const [totalAttempted, setTotalAttempted] = useState(0)

  const { data: eleves = [], isLoading: elevesLoading } = useEleves(
    sourceClasseId || undefined
  )

  const sourceClasse = useMemo(
    () => classes.find((c) => c.id === sourceClasseId) ?? null,
    [classes, sourceClasseId]
  )

  // Filter out already-transferred élèves
  const pendingEleves = useMemo(
    () => eleves.filter((e) => !e._transfere),
    [eleves]
  )

  // Reset state when the modal opens
  useEffect(() => {
    if (open) {
      setStep('select-class')
      setSourceClasseId('')
      setDecisions({})
      setDestinations({})
      setProgress({ done: 0, total: 0 })
      setResult(null)
      setTotalAttempted(0)
    }
  }, [open])

  // Auto-chain: when we land on the Done step AND all classes have been
  // transitioned (this year's full set), automatically hand off to the
  // archive modal after a brief delay. The delay lets the user see the
  // "Transition terminée" confirmation for ≈2s before the archive
  // preflight appears. Admin can still click "Archiver maintenant"
  // manually to skip the delay. Admin can also click "Fermer" during
  // the delay to abort the auto-chain (they'll be nagged by the global
  // banner instead).
  useEffect(() => {
    if (step !== 'done') return
    if (!onRequestArchive) return
    // Use the same "all done?" check used by the footer renderer
    const transitionedSet = new Set(config?.classesTransitioned ?? [])
    const allDone =
      classes.length > 0 && classes.every((c) => transitionedSet.has(c.id))
    if (!allDone) return

    const timer = setTimeout(() => {
      onRequestArchive()
    }, 2000)
    return () => clearTimeout(timer)
    // We intentionally include config?.classesTransitioned in deps so
    // the effect re-evaluates if the flag updates while Done is visible
    // (e.g. query cache refresh completing after the transition write).
  }, [step, onRequestArchive, config?.classesTransitioned, classes])

  // Reset per-class state whenever the user picks a different source class.
  // Without this, decisions from a previously-viewed class linger and
  // pollute the counts on the review step. (e.g. picking class A with 16
  // élèves, going Back, picking class B with 1 élève → review still shows
  // 16 echoues.)
  useEffect(() => {
    setDecisions({})
    setDestinations({})
  }, [sourceClasseId])

  // Initialize decisions when arriving at classify step.
  // If the PP has run annual closure on this class, each élève has a
  // `statutAnnuel` field on their doc — use it to pre-fill the decision.
  // Élèves without one default to "echoue" (safer — admin must explicitly
  // promote rather than accidentally promoting someone with no decision).
  useEffect(() => {
    if (step === 'classify' && pendingEleves.length > 0 && Object.keys(decisions).length === 0) {
      const init: Record<string, TransitionStatut> = {}
      for (const e of pendingEleves) {
        if (e.statutAnnuel === 'Admis') init[e.id] = 'admis'
        else if (e.statutAnnuel === 'Échoué') init[e.id] = 'echoue'
        else init[e.id] = 'echoue'
      }
      setDecisions(init)
    }
  }, [step, pendingEleves, decisions])

  // Smart default destinations: same cycle/série, next niveau
  function suggestDestination(currentClasse: Classe): string {
    if (!currentClasse) return ''
    const nextNiv = NEXT_NIVEAU[currentClasse.niveau]
    if (!nextNiv) return ''
    const candidates = classes.filter(
      (c) =>
        c.id !== currentClasse.id &&
        c.niveau === nextNiv &&
        (currentClasse.serie ? c.serie === currentClasse.serie : true)
    )
    return candidates[0]?.id ?? ''
  }

  // Initialize destinations when arriving at destinations step
  useEffect(() => {
    if (step === 'destinations' && sourceClasse && Object.keys(destinations).length === 0) {
      const admisIds = Object.entries(decisions)
        .filter(([, s]) => s === 'admis')
        .map(([id]) => id)
      const init: Record<string, string> = {}
      const suggested = suggestDestination(sourceClasse)
      for (const id of admisIds) init[id] = suggested
      setDestinations(init)
    }
  }, [step, decisions, sourceClasse, destinations])

  // Defensive: only count decisions belonging to élèves currently in this
  // class. Even if state somehow leaks across classes, the displayed counts
  // stay consistent with what the user actually sees in the list.
  const counts = useMemo(() => {
    let admis = 0, echoue = 0, abandonne = 0
    for (const e of pendingEleves) {
      const s = decisions[e.id]
      if (s === 'admis') admis++
      else if (s === 'echoue') echoue++
      else if (s === 'abandonne') abandonne++
    }
    return { admis, echoue, abandonne, total: admis + echoue + abandonne }
  }, [decisions, pendingEleves])

  function setStatut(eleveId: string, statut: TransitionStatut) {
    setDecisions((prev) => ({ ...prev, [eleveId]: statut }))
  }

  function setBulk(statut: TransitionStatut) {
    const next: Record<string, TransitionStatut> = {}
    for (const e of pendingEleves) next[e.id] = statut
    setDecisions(next)
  }

  // Validation: every Admis needs a destination
  const destinationsValid = useMemo(() => {
    const admisIds = Object.entries(decisions)
      .filter(([, s]) => s === 'admis')
      .map(([id]) => id)
    return admisIds.every((id) => destinations[id] && destinations[id] !== sourceClasseId)
  }, [decisions, destinations, sourceClasseId])

  async function execute() {
    if (!sourceClasseId || !config?.anneeActive) return
    setStep('execute')
    setProgress({ done: 0, total: counts.total })
    setTotalAttempted(counts.total)

    // Terminale "admis" (= diplômés) have no destination class — they
    // leave the school. Route them to 'abandonne' so the rollover
    // archives their record and removes them from the active roster.
    // This preserves their data in the year archive for transcript
    // issuance later.
    const isTerminaleSource = sourceClasse?.niveau === 'Terminale'

    const decisionsList: TransitionDecision[] = pendingEleves.map((e) => {
      const raw = decisions[e.id] ?? 'echoue'
      const effective: TransitionStatut =
        isTerminaleSource && raw === 'admis' ? 'abandonne' : raw
      return {
        eleveId: e.id,
        statut: effective,
        destClasseId: effective === 'admis' ? destinations[e.id] : undefined,
      }
    })

    try {
      const res = await executeTransition({
        sourceClasseId,
        decisions: decisionsList,
        annee: config.anneeActive,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(res)
      setStep('done')

      // Refresh affected class queries
      qc.invalidateQueries({ queryKey: ['eleves', sourceClasseId] })
      qc.invalidateQueries({ queryKey: ['classe', sourceClasseId, 'eleve-count'] })
      const destIds = new Set(Object.values(destinations).filter(Boolean))
      for (const dId of destIds) {
        qc.invalidateQueries({ queryKey: ['eleves', dId] })
        qc.invalidateQueries({ queryKey: ['classe', dId, 'eleve-count'] })
      }
      qc.invalidateQueries({ queryKey: ['school-stats'] })
      // Refresh ecole/config so the "transition in progress" banner
      // flips on as soon as the first class is processed.
      qc.invalidateQueries({ queryKey: ['ecole', 'config'] })
    } catch (err) {
      console.error('[Transition] fatal:', err)
      toast.error("Échec de la transition. Voir la console pour les détails.")
      setStep('done')
      setResult({
        successCount: 0,
        errors: [
          {
            eleveId: '—',
            statut: 'echoue',
            error: err instanceof Error ? err.message : String(err),
          },
        ],
      })
    }
  }

  // ── Close intercept ──────────────────────────────────────
  //
  // When admin tries to close mid-flow (after processing ≥1 class
  // but before all classes are done), we ask for confirmation with
  // a warning about NOT starting new-year operations until archive
  // runs. State is persisted in Firestore so admin can reopen and
  // resume later.
  //
  // We don't intercept when:
  //   - No classes transitioned yet (nothing to lose)
  //   - All classes already done (the auto-chain will handle it, or
  //     the archive nag banner takes over)
  //   - Execute step (already blocked via disableOverlayClose)
  //   - Done step (terminal — user reviewing results)
  async function requestClose() {
    const transitionedCount = config?.classesTransitioned?.length ?? 0
    const totalClasses = classes.length
    const someButNotAll =
      transitionedCount > 0 && transitionedCount < totalClasses
    const midFlow =
      step === 'classify' ||
      step === 'destinations' ||
      step === 'review'

    // No confirmation needed — just close
    if (!someButNotAll && !midFlow) {
      onClose()
      return
    }
    // Mid-active-step with pending decisions the admin hasn't committed
    // yet, OR some classes already transitioned and more remaining
    const confirmed = await askConfirm({
      title: 'Interrompre la clôture ?',
      message: someButNotAll
        ? `Vous avez traité ${transitionedCount} classe${transitionedCount > 1 ? 's' : ''} sur ${totalClasses}. Votre progression est sauvegardée — vous pourrez reprendre plus tard depuis la Zone dangereuse. Tant que l'archivage n'est pas lancé, ne commencez pas la nouvelle année (inscriptions, création de classes…) car cela corromprait les données en transition.`
        : "Vos décisions pour cette classe ne sont pas encore enregistrées. Fermer maintenant annulera tout ce que vous avez saisi pour cette classe.",
      confirmLabel: 'Interrompre et fermer',
      cancelLabel: 'Continuer la clôture',
      variant: 'warning',
    })
    if (confirmed) onClose()
  }

  // ── Render per step ──────────────────────────────────────

  function renderBody() {
    switch (step) {
      case 'select-class':
        return <StepSelectClass classes={classes} value={sourceClasseId} onChange={setSourceClasseId} />
      case 'classify':
        return (
          <StepClassify
            sourceClasse={sourceClasse}
            eleves={pendingEleves}
            elevesLoading={elevesLoading}
            decisions={decisions}
            onSetStatut={setStatut}
            onBulk={setBulk}
            counts={counts}
          />
        )
      case 'destinations':
        return (
          <StepDestinations
            sourceClasse={sourceClasse}
            eleves={pendingEleves}
            decisions={decisions}
            destinations={destinations}
            onSetDest={(id, d) =>
              setDestinations((prev) => ({ ...prev, [id]: d }))
            }
            classes={classes}
          />
        )
      case 'review':
        return (
          <StepReview
            sourceClasse={sourceClasse}
            classes={classes}
            counts={counts}
            decisions={decisions}
            destinations={destinations}
            eleves={pendingEleves}
          />
        )
      case 'execute':
        return <StepExecute progress={progress} />
      case 'done': {
        const transitionedSet = new Set(config?.classesTransitioned ?? [])
        const allClassesDone =
          classes.length > 0 &&
          classes.every((c) => transitionedSet.has(c.id))
        return (
          <StepDone
            result={result}
            totalAttempted={totalAttempted}
            allClassesDone={allClassesDone}
          />
        )
      }
    }
  }

  function renderFooter() {
    switch (step) {
      case 'select-class':
        return (
          <>
            <Button variant="secondary" onClick={requestClose}>Annuler</Button>
            <Button
              onClick={() => setStep('classify')}
              disabled={!sourceClasseId}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continuer
            </Button>
          </>
        )
      case 'classify':
        return (
          <>
            <Button variant="secondary" onClick={() => setStep('select-class')} leadingIcon={<ArrowLeft className="h-4 w-4" />}>
              Retour
            </Button>
            <Button
              onClick={() => {
                // Terminale admis = diplômés → no destinations step
                const needsDestinations = counts.admis > 0 && sourceClasse?.niveau !== 'Terminale'
                setStep(needsDestinations ? 'destinations' : 'review')
              }}
              disabled={pendingEleves.length === 0}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continuer
            </Button>
          </>
        )
      case 'destinations':
        return (
          <>
            <Button variant="secondary" onClick={() => setStep('classify')} leadingIcon={<ArrowLeft className="h-4 w-4" />}>
              Retour
            </Button>
            <Button
              onClick={() => setStep('review')}
              disabled={!destinationsValid}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continuer
            </Button>
          </>
        )
      case 'review':
        return (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                const needsDestinations = counts.admis > 0 && sourceClasse?.niveau !== 'Terminale'
                setStep(needsDestinations ? 'destinations' : 'classify')
              }}
              leadingIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Retour
            </Button>
            <Button variant="danger" onClick={execute}>
              Lancer la transition
            </Button>
          </>
        )
      case 'execute':
        return null
      case 'done': {
        // Are we done with EVERY class? Check config.classesTransitioned
        // against the active classes list. If yes, offer to chain into
        // archive.
        const transitionedSet = new Set(config?.classesTransitioned ?? [])
        const allClassesDone =
          classes.length > 0 &&
          classes.every((c) => transitionedSet.has(c.id))

        return (
          <>
            <Button variant="secondary" onClick={requestClose}>Fermer</Button>
            {allClassesDone && onRequestArchive ? (
              <Button
                variant="danger"
                onClick={() => {
                  onRequestArchive()
                }}
                trailingIcon={<Archive className="h-3.5 w-3.5" />}
              >
                Archiver l'année maintenant
              </Button>
            ) : (
              <Button onClick={() => {
                // Reset and go to step 1 for next class
                setStep('select-class')
                setSourceClasseId('')
                setDecisions({})
                setDestinations({})
                setResult(null)
              }}>
                Traiter une autre classe
              </Button>
            )}
          </>
        )
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      size="lg"
      disableOverlayClose={step === 'execute'}
      disableEscClose={step === 'execute'}
    >
      <ModalHeader onClose={step === 'execute' ? undefined : requestClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning-bg text-warning">
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Transition des élèves</ModalTitle>
            <ModalDescription>
              {sourceClasse
                ? `${nomClasse(sourceClasse)} · étape ${stepLabel(step)}`
                : `Étape ${stepLabel(step)}`}
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

function stepLabel(step: Step): string {
  const map: Record<Step, string> = {
    'select-class': '1/4 — Classe',
    classify: '2/4 — Décisions',
    destinations: '3/4 — Destinations',
    review: '4/4 — Vérification',
    execute: 'Exécution…',
    done: 'Terminé',
  }
  return map[step]
}

// ─── Step 1: Select source class ────────────────────────────

function StepSelectClass({
  classes,
  value,
  onChange,
}: {
  classes: Classe[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-[0.875rem] text-ink-600 leading-relaxed">
        Choisissez la classe dont vous souhaitez traiter les élèves.
        Vous pourrez recommencer pour chaque classe avant l'archivage final.
      </p>
      <Select
        label="Classe source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Choisir une classe —</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {nomClasse(c)}
          </option>
        ))}
      </Select>
    </div>
  )
}

// ─── Step 2: Classify ───────────────────────────────────────

function StepClassify({
  sourceClasse,
  eleves,
  elevesLoading,
  decisions,
  onSetStatut,
  onBulk,
  counts,
}: {
  sourceClasse: Classe | null
  eleves: Eleve[]
  elevesLoading: boolean
  decisions: Record<string, TransitionStatut>
  onSetStatut: (id: string, s: TransitionStatut) => void
  onBulk: (s: TransitionStatut) => void
  counts: { admis: number; echoue: number; abandonne: number; total: number }
}) {
  if (elevesLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }
  if (eleves.length === 0) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" aria-hidden />
        <p className="font-display text-lg font-semibold text-navy">
          Aucun élève à traiter
        </p>
        <p className="text-sm text-ink-600 mt-1">
          Tous les élèves de cette classe ont déjà été traités, ou la classe est vide.
        </p>
      </div>
    )
  }

  // How many élèves had their statut pre-filled from the PP's annual closure?
  const prefilledCount = eleves.filter(
    (e) => e.statutAnnuel === 'Admis' || e.statutAnnuel === 'Échoué'
  ).length

  // Terminale is a terminal niveau — "Admis" means the élève obtained
  // their BAC and is leaving for higher education or the workforce,
  // not being promoted to a next niveau. We relabel the UI but keep
  // the underlying statut = 'admis' so the rollover logic is unchanged.
  //
  // IMPORTANT: in destinations step, terminale admis must NOT pick a
  // destination class — they're leaving the school. We route them to
  // a synthetic "diplômé → archive" path (see routeTerminaleAdmis
  // below) that behaves like abandonné under the hood.
  const isTerminale = sourceClasse?.niveau === 'Terminale'

  return (
    <div className="space-y-4">
      {/* Annual prefill banner */}
      {prefilledCount > 0 && (
        <div className="rounded-md bg-gold/10 border border-gold/30 px-3 py-2 flex items-start gap-2">
          <Award className="h-4 w-4 text-gold-dark shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.8125rem] text-navy leading-snug">
            <strong>{prefilledCount}</strong> / {eleves.length} décision
            {eleves.length > 1 ? 's' : ''} pré-remplie
            {prefilledCount > 1 ? 's' : ''} depuis la clôture annuelle du
            professeur principal. Vous pouvez ajuster si nécessaire.
          </p>
        </div>
      )}

      {/* Terminale banner */}
      {isTerminale && (
        <div className="rounded-md bg-navy/5 border border-navy/20 px-3 py-2 flex items-start gap-2">
          <Award className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.8125rem] text-navy leading-snug">
            Classe Terminale : <strong>Diplômé</strong> (ex-Admis) archive
            l'élève avec son dossier. <strong>Échoué</strong> redouble en
            Terminale. Aucune destination à choisir pour les diplômés.
          </p>
        </div>
      )}

      {/* Counts strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <CountTile color="success" label={isTerminale ? 'Diplômés' : 'Admis'} count={counts.admis} icon={<Award className="h-4 w-4" />} />
        <CountTile color="warning" label="Échoués" count={counts.echoue} icon={<TrendingDown className="h-4 w-4" />} />
        <CountTile color="danger" label="Abandonnés" count={counts.abandonne} icon={<UserMinus className="h-4 w-4" />} />
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[0.78rem] font-semibold text-ink-400 uppercase tracking-wider">Tout marquer :</span>
        <button type="button" onClick={() => onBulk('admis')} className="text-[0.78rem] text-success font-semibold hover:underline">
          {isTerminale ? 'Diplômé' : 'Admis'}
        </button>
        <span className="text-ink-300">·</span>
        <button type="button" onClick={() => onBulk('echoue')} className="text-[0.78rem] text-warning font-semibold hover:underline">
          Échoué
        </button>
      </div>

      {/* Élève list */}
      <ul className="rounded-lg border border-ink-100 divide-y divide-ink-100 bg-white max-h-[50dvh] overflow-y-auto">
        {eleves.map((e) => {
          const statut = decisions[e.id] ?? 'echoue'
          return (
            <li key={e.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 font-display font-bold text-sm">
                  {e.nom.charAt(0).toUpperCase()}
                </div>
                <p className="font-semibold text-navy text-sm truncate flex-1">{e.nom}</p>
                <Badge variant={e.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
                  {e.genre}
                </Badge>
              </div>
              <div className="flex gap-1 ml-10">
                <StatutBtn
                  current={statut}
                  value="admis"
                  onClick={() => onSetStatut(e.id, 'admis')}
                  label={isTerminale ? 'Diplômé' : 'Admis'}
                  color="success"
                  icon={<Award className="h-3 w-3" />}
                />
                <StatutBtn current={statut} value="echoue" onClick={() => onSetStatut(e.id, 'echoue')} label="Échoué" color="warning" icon={<TrendingDown className="h-3 w-3" />} />
                <StatutBtn current={statut} value="abandonne" onClick={() => onSetStatut(e.id, 'abandonne')} label="Abandonné" color="danger" icon={<UserMinus className="h-3 w-3" />} />
              </div>
            </li>
          )
        })}
      </ul>

      {sourceClasse && (
        <p className="text-[0.78rem] text-ink-400">
          Classe traitée : <strong className="text-navy">{nomClasse(sourceClasse)}</strong>
        </p>
      )}
    </div>
  )
}

function StatutBtn({
  current,
  value,
  onClick,
  label,
  color,
  icon,
}: {
  current: TransitionStatut
  value: TransitionStatut
  onClick: () => void
  label: string
  color: 'success' | 'warning' | 'danger'
  icon: React.ReactNode
}) {
  const active = current === value
  const COLORS: Record<typeof color, string> = {
    success: 'bg-success text-white border-success',
    warning: 'bg-warning text-white border-warning',
    danger: 'bg-danger text-white border-danger',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[0.7rem] font-bold transition-colors min-h-touch',
        active ? COLORS[color] : 'bg-white border-ink-100 text-ink-600 hover:border-ink-200'
      )}
    >
      {icon} {label}
    </button>
  )
}

function CountTile({
  color,
  label,
  count,
  icon,
}: {
  color: 'success' | 'warning' | 'danger'
  label: string
  count: number
  icon: React.ReactNode
}) {
  const C: Record<typeof color, string> = {
    success: 'bg-success-bg text-success border-success/20',
    warning: 'bg-warning-bg text-warning border-warning/20',
    danger: 'bg-danger-bg text-danger border-danger/20',
  }
  return (
    <div className={cn('rounded-md border p-2', C[color])}>
      <div className="flex items-center justify-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider">
        {icon} {label}
      </div>
      <p className="font-display text-xl font-bold mt-0.5 tabular-nums">{count}</p>
    </div>
  )
}

// ─── Step 3: Destinations ───────────────────────────────────

function StepDestinations({
  sourceClasse,
  eleves,
  decisions,
  destinations,
  onSetDest,
  classes,
}: {
  sourceClasse: Classe | null
  eleves: Eleve[]
  decisions: Record<string, TransitionStatut>
  destinations: Record<string, string>
  onSetDest: (id: string, d: string) => void
  classes: Classe[]
}) {
  const admisEleves = eleves.filter((e) => decisions[e.id] === 'admis')
  const otherClasses = classes.filter((c) => c.id !== sourceClasse?.id)

  return (
    <div className="space-y-4">
      <p className="text-[0.875rem] text-ink-600 leading-relaxed">
        Choisissez la classe de destination pour chaque élève admis.
        La suggestion automatique correspond au niveau supérieur dans la même série.
      </p>

      <ul className="rounded-lg border border-ink-100 divide-y divide-ink-100 bg-white max-h-[50dvh] overflow-y-auto">
        {admisEleves.map((e) => (
          <li key={e.id} className="px-3 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-4 w-4 text-success shrink-0" aria-hidden />
              <p className="font-semibold text-navy text-sm truncate flex-1">{e.nom}</p>
            </div>
            <Select
              value={destinations[e.id] ?? ''}
              onChange={(ev) => onSetDest(e.id, ev.target.value)}
            >
              <option value="">— Choisir la destination —</option>
              {otherClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomClasse(c)}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Step 4: Review ─────────────────────────────────────────

function StepReview({
  sourceClasse,
  classes,
  counts,
  decisions,
  destinations,
  eleves,
}: {
  sourceClasse: Classe | null
  classes: Classe[]
  counts: { admis: number; echoue: number; abandonne: number; total: number }
  decisions: Record<string, TransitionStatut>
  destinations: Record<string, string>
  eleves: Eleve[]
}) {
  const isTerminale = sourceClasse?.niveau === 'Terminale'

  // Group admis by destination class (non-Terminale only — Terminale
  // admis don't have destinations, they're routed to archive at
  // execute time).
  const admisByDest = useMemo(() => {
    if (isTerminale) return []
    const m = new Map<string, number>()
    for (const e of eleves) {
      if (decisions[e.id] === 'admis') {
        const d = destinations[e.id]
        if (d) m.set(d, (m.get(d) ?? 0) + 1)
      }
    }
    return Array.from(m.entries()).map(([cid, count]) => ({
      classe: classes.find((c) => c.id === cid),
      count,
    }))
  }, [eleves, decisions, destinations, classes, isTerminale])

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-warning-bg border border-warning/30 p-3 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold text-warning text-[0.875rem]">
            Action partiellement irréversible
          </p>
          <p className="text-[0.8125rem] text-warning/90 mt-0.5 leading-snug">
            {isTerminale
              ? "Les diplômés sont archivés et retirés des effectifs actifs. Leurs dossiers resteront consultables dans les archives annuelles. Les abandons sont également archivés et supprimés."
              : "Les abandons sont archivés et supprimés des rosters actifs immédiatement. Les admis sont déplacés vers leur nouvelle classe."}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white divide-y divide-ink-100">
        <ReviewRow
          icon={<Award className="h-4 w-4 text-success" />}
          label={`${counts.admis} ${isTerminale ? 'diplômé' : 'admis'}${counts.admis > 1 ? 's' : ''}`}
          detail={
            isTerminale
              ? counts.admis > 0
                ? `Archivé${counts.admis > 1 ? 's' : ''} dans les archives de l'année`
                : 'Aucun'
              : admisByDest.length > 0
                ? admisByDest
                    .map((d) => `${d.count} → ${d.classe ? nomClasse(d.classe) : '?'}`)
                    .join(', ')
                : 'Aucun'
          }
        />
        <ReviewRow
          icon={<TrendingDown className="h-4 w-4 text-warning" />}
          label={`${counts.echoue} échoué${counts.echoue > 1 ? 's' : ''}`}
          detail={`Maintenu${counts.echoue > 1 ? 's' : ''} dans ${sourceClasse ? nomClasse(sourceClasse) : 'la classe'}`}
        />
        <ReviewRow
          icon={<UserMinus className="h-4 w-4 text-danger" />}
          label={`${counts.abandonne} abandonné${counts.abandonne > 1 ? 's' : ''}`}
          detail={
            counts.abandonne > 0
              ? "Archivés et retirés des rosters"
              : 'Aucun'
          }
        />
      </div>
    </div>
  )
}

function ReviewRow({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy text-[0.875rem]">{label}</p>
        <p className="text-[0.78rem] text-ink-600 truncate">{detail}</p>
      </div>
    </div>
  )
}

// ─── Step 5: Execute ────────────────────────────────────────

function StepExecute({ progress }: { progress: { done: number; total: number } }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="py-8 text-center">
      <Loader2 className="h-12 w-12 text-navy mx-auto mb-3 animate-spin" aria-hidden />
      <p className="font-display text-lg font-semibold text-navy">
        Transition en cours…
      </p>
      <p className="text-sm text-ink-600 mt-1 mb-5">
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

// ─── Step 6: Done ───────────────────────────────────────────

function StepDone({
  result,
  totalAttempted,
  allClassesDone,
}: {
  result: TransitionResult | null
  totalAttempted: number
  allClassesDone: boolean
}) {
  const ok = (result?.errors.length ?? 0) === 0
  return (
    <div className="py-4 text-center">
      {ok ? (
        <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" aria-hidden />
      ) : (
        <XCircle className="h-14 w-14 text-danger mx-auto mb-3" aria-hidden />
      )}
      <p className="font-display text-xl font-semibold text-navy">
        {ok ? 'Transition terminée' : 'Transition partiellement échouée'}
      </p>
      <p className="text-[0.875rem] text-ink-600 mt-2">
        <strong className="text-success">{result?.successCount ?? 0}</strong> élève
        {(result?.successCount ?? 0) > 1 ? 's' : ''} traité
        {(result?.successCount ?? 0) > 1 ? 's' : ''} sur {totalAttempted}
      </p>
      {result && result.errors.length > 0 && (
        <div className="mt-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-left">
          <p className="font-semibold text-danger text-[0.8125rem] mb-1.5 flex items-center gap-1">
            <XCircle className="h-4 w-4" aria-hidden />
            {result.errors.length} erreur{result.errors.length > 1 ? 's' : ''}
          </p>
          <ul className="space-y-0.5 max-h-32 overflow-y-auto text-[0.78rem] text-danger/90">
            {result.errors.map((e, i) => (
              <li key={i} className="font-mono">
                • {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {allClassesDone && (
        <div className="mt-5 rounded-md bg-warning-bg border border-warning/30 p-4 text-left">
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="h-5 w-5 text-warning-dark shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-warning-dark text-[0.88rem] leading-tight">
                Toutes les classes ont été traitées.
              </p>
              <p className="text-[0.8rem] text-ink-700 mt-1 leading-snug">
                L'archivage va démarrer automatiquement dans quelques secondes pour finaliser l'année.
                Vous pouvez cliquer sur « Archiver l'année maintenant » pour enchaîner immédiatement.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

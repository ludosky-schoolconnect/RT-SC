/**
 * RT-SC · Per-matière closure modal with Layer A intelligence.
 *
 * Replaces the simple confirm dialog from Phase 4b/4b.2. For each élève,
 * shows their classification (Complet / Incomplet / Vide) and forces the
 * prof to make an explicit decision for non-Complet élèves before they
 * can confirm the close.
 *
 * Three resolutions per non-Complet élève:
 *   - Continuer  : lock with whatever data is there (could be empty)
 *   - Abandonner : mark this matière as abandonné for this period for
 *                  this élève (skipped in bulletin computation)
 *   - Retour saisie : cancel close, modal closes, prof goes back to fix
 *
 * The Confirm button is disabled until every non-Complet élève has been
 * resolved (Continuer or Abandonner). "Retour saisie" is global —
 * picking it on any one row cancels the whole modal.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  UserMinus,
  Lock,
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
import { Badge } from '@/components/ui/Badge'
import {
  classifyEleves,
  countByCompleteness,
  type EleveClassification,
  type EleveCompleteness,
  type ResolutionAction,
} from '@/lib/closure'
import { cn } from '@/lib/cn'
import type { Eleve } from '@/types/models'

// ─── Public input types ──────────────────────────────────────

export interface ClosureRowSnapshot {
  eleveId: string
  interrosCount: number
  hasAnyDevoir: boolean
}

export interface ClosureCommit {
  eleveId: string
  /** 'continuer' = close with current data; 'abandonner' = mark abandonné */
  action: 'continuer' | 'abandonner'
}

interface ModalClosureMatiereProps {
  open: boolean
  onClose: () => void
  /** Called when prof clicks "Retour saisie" — modal closes, parent should highlight the row */
  onReturnToEntry: (eleveId: string) => void
  /** Called when prof confirms — array contains one entry per élève */
  onConfirm: (commits: ClosureCommit[]) => Promise<void>
  matiere: string
  periode: string
  eleves: Eleve[]
  /** One per élève, in the same order as `eleves` */
  snapshots: ClosureRowSnapshot[]
}

// ─── Component ───────────────────────────────────────────────

export function ModalClosureMatiere({
  open,
  onClose,
  onReturnToEntry,
  onConfirm,
  matiere,
  periode,
  eleves,
  snapshots,
}: ModalClosureMatiereProps) {
  // Map snapshot input → classifications
  const classifications = useMemo<EleveClassification[]>(
    () => classifyEleves(snapshots),
    [snapshots]
  )
  const counts = useMemo(() => countByCompleteness(classifications), [classifications])

  // Per-élève decision (only relevant for non-Complet)
  const [decisions, setDecisions] = useState<Record<string, ResolutionAction>>({})
  // Expanded state for the disclosure rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setDecisions({})
      setExpanded(new Set())
      setCommitting(false)
    }
  }, [open])

  // Élèves that need resolution (non-Complet, no decision yet)
  const unresolved = useMemo(
    () =>
      classifications.filter(
        (c) => c.state !== 'complet' && !decisions[c.eleveId]
      ),
    [classifications, decisions]
  )

  // Quick lookup
  const eleveById = useMemo(() => {
    const m = new Map<string, Eleve>()
    for (const e of eleves) m.set(e.id, e)
    return m
  }, [eleves])

  function setDecision(eleveId: string, action: ResolutionAction) {
    if (action === 'retour') {
      onReturnToEntry(eleveId)
      onClose()
      return
    }
    setDecisions((prev) => ({ ...prev, [eleveId]: action }))
  }

  function toggleExpanded(eleveId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(eleveId)) next.delete(eleveId)
      else next.add(eleveId)
      return next
    })
  }

  const canConfirm = unresolved.length === 0

  async function confirm() {
    if (!canConfirm) return
    setCommitting(true)
    try {
      const commits: ClosureCommit[] = classifications.map((c) => {
        // Complet élèves always proceed normally
        if (c.state === 'complet') return { eleveId: c.eleveId, action: 'continuer' }
        // Non-Complet: take the decision (must exist by canConfirm guarantee)
        const d = decisions[c.eleveId]
        return {
          eleveId: c.eleveId,
          action: d === 'abandonner' ? 'abandonner' : 'continuer',
        }
      })
      await onConfirm(commits)
    } finally {
      setCommitting(false)
    }
  }

  const nonCompletList = classifications.filter((c) => c.state !== 'complet')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      disableOverlayClose={committing}
      disableEscClose={committing}
    >
      <ModalHeader onClose={committing ? undefined : onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-bg text-navy">
            <Calculator className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Clôturer {matiere}</ModalTitle>
            <ModalDescription>{periode} · Vérification par élève</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Counts strip */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <CountTile color="success" label="Complets" count={counts.complet} icon={<CheckCircle2 className="h-4 w-4" />} />
          <CountTile color="warning" label="Incomplets" count={counts.incomplet} icon={<AlertTriangle className="h-4 w-4" />} />
          <CountTile color="danger" label="Vides" count={counts.vide} icon={<XCircle className="h-4 w-4" />} />
        </div>

        {nonCompletList.length === 0 ? (
          <div className="rounded-md bg-success-bg border border-success/20 p-4 flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold text-success text-[0.875rem]">
                Tous les élèves ont au moins une interrogation et un devoir.
              </p>
              <p className="text-[0.8125rem] text-success/90 mt-0.5">
                Vous pouvez clôturer en toute confiance.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[0.875rem] text-ink-700 mb-3">
              {nonCompletList.length} élève{nonCompletList.length > 1 ? 's' : ''}
              {' '}nécessite{nonCompletList.length > 1 ? 'nt' : ''} une décision avant la clôture.
              Pour chacun, choisissez : <strong>Marquer absent</strong> (l'élève est exclu de cette
              matière dans son bulletin), <strong>Retour à la saisie</strong> (annuler pour aller
              compléter), ou <strong>Continuer</strong> (clôturer avec les données actuelles).
            </p>

            <ul className="rounded-lg border border-ink-100 divide-y divide-ink-100 bg-white max-h-[50dvh] overflow-y-auto">
              {nonCompletList.map((c) => {
                const eleve = eleveById.get(c.eleveId)
                const snap = snapshots.find((s) => s.eleveId === c.eleveId)
                if (!eleve || !snap) return null
                return (
                  <ResolutionRow
                    key={c.eleveId}
                    eleve={eleve}
                    state={c.state}
                    snapshot={snap}
                    expanded={expanded.has(c.eleveId)}
                    onToggleExpanded={() => toggleExpanded(c.eleveId)}
                    decision={decisions[c.eleveId]}
                    onSetDecision={(a) => setDecision(c.eleveId, a)}
                  />
                )
              })}
            </ul>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={committing}>
          Annuler
        </Button>
        <Button
          onClick={confirm}
          disabled={!canConfirm || committing}
          loading={committing}
          leadingIcon={<Lock className="h-4 w-4" />}
          variant="primary"
        >
          Confirmer la clôture
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Counts tile ─────────────────────────────────────────────

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
      <p className="font-display text-xl font-bold mt-0.5 tabular-nums text-center">
        {count}
      </p>
    </div>
  )
}

// ─── Per-élève resolution row ────────────────────────────────

function ResolutionRow({
  eleve,
  state,
  snapshot,
  expanded,
  onToggleExpanded,
  decision,
  onSetDecision,
}: {
  eleve: Eleve
  state: EleveCompleteness
  snapshot: ClosureRowSnapshot
  expanded: boolean
  onToggleExpanded: () => void
  decision?: ResolutionAction
  onSetDecision: (a: ResolutionAction) => void
}) {
  const stateLabel = state === 'vide' ? 'Vide' : 'Incomplet'
  const stateColor = state === 'vide' ? 'danger' : 'warning'
  const stateIcon =
    state === 'vide' ? (
      <XCircle className="h-3.5 w-3.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5" />
    )

  const decisionLabel =
    decision === 'abandonner' ? 'Marqué absent' :
    decision === 'continuer' ? 'Continuer' :
    null

  // Hint text describing what's missing
  const missingDesc =
    state === 'vide'
      ? 'Aucune note saisie.'
      : `${snapshot.interrosCount} interro${snapshot.interrosCount > 1 ? 's' : ''}, ${snapshot.hasAnyDevoir ? '1+' : '0'} devoir${snapshot.hasAnyDevoir ? '' : ''}`

  return (
    <li className="bg-white">
      {/* Row header */}
      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-ink-50/40 transition-colors"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 font-display font-bold text-xs">
          {eleve.nom.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy text-[0.875rem] truncate">
            {eleve.nom}
          </p>
          <p className="text-[0.7rem] text-ink-400">{missingDesc}</p>
        </div>
        <Badge variant={stateColor === 'danger' ? 'navy' : 'gold'} size="sm" leadingIcon={stateIcon}>
          {stateLabel}
        </Badge>
        {decisionLabel ? (
          <Badge variant="success" size="sm" className="ml-1">
            {decisionLabel}
          </Badge>
        ) : (
          <span className="text-ink-300 ml-1">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        )}
      </button>

      {/* Expandable action area */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                size="sm"
                variant={decision === 'continuer' ? 'primary' : 'secondary'}
                onClick={() => onSetDecision('continuer')}
                leadingIcon={<Lock className="h-3.5 w-3.5" />}
                className="w-full"
              >
                Continuer
              </Button>
              <Button
                size="sm"
                variant={decision === 'abandonner' ? 'primary' : 'secondary'}
                onClick={() => onSetDecision('abandonner')}
                leadingIcon={<UserMinus className="h-3.5 w-3.5" />}
                className="w-full"
              >
                Marquer absent
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSetDecision('retour')}
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
                className="w-full"
              >
                Retour saisie
              </Button>
            </div>
            {decision && (
              <p className="px-3 pb-3 text-[0.7rem] text-ink-400 italic">
                {decision === 'abandonner'
                  ? 'Cet élève sera exclu du calcul de la moyenne pour cette matière sur cette période.'
                  : 'Cet élève sera clôturé avec les notes actuelles.'}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

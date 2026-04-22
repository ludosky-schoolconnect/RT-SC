/**
 * RT-SC · Bulletin detail modal (PP usage).
 *
 * Wraps the shared <BulletinView /> in a modal. PP opens it from:
 *   - The cross-matière table (per-period bulletin)
 *   - The annual table (annual bulletin)
 *
 * Élève + parent dashboards (Phase 4e) will use the BulletinView directly
 * as a route, not a modal.
 *
 * The "Télécharger PDF" button generates a polished A4 PDF via jsPDF
 * and triggers a browser download.
 */

import { useEffect, useMemo } from 'react'
import { Download, FileText } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import {
  useAnnualBulletinView,
  usePeriodBulletinView,
} from '@/hooks/useBulletinView'
import { useAuthStore } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import { savePdf } from '@/lib/pdf/bulletinPdf'
import type { Periode } from '@/types/models'
import type { EnrichedBulletinPeriodView } from '@/lib/bulletinEnrichment'
import type { BulletinAnnualView } from '@/lib/bulletinView'
import { BulletinView } from './BulletinView'
import { BulletinObservationsEditor } from './BulletinObservationsEditor'

interface ModalBulletinDetailProps {
  open: boolean
  onClose: () => void
  /** When true, fetches+displays the annual bulletin (ignores `periode`) */
  mode: 'periode' | 'annuelle'
  classeId: string
  eleveId: string
  /** Required when mode='periode'; ignored otherwise */
  periode?: Periode
  /** Élève display name for the modal title */
  eleveName: string
}

export function ModalBulletinDetail({
  open,
  onClose,
  mode,
  classeId,
  eleveId,
  periode,
  eleveName,
}: ModalBulletinDetailProps) {
  // Fire both queries conditionally — only the relevant one is enabled
  const periodQuery = usePeriodBulletinView({
    classeId: mode === 'periode' && open ? classeId : undefined,
    eleveId: mode === 'periode' && open ? eleveId : undefined,
    periode: mode === 'periode' && open ? periode : undefined,
  })
  const annualQuery = useAnnualBulletinView({
    classeId: mode === 'annuelle' && open ? classeId : undefined,
    eleveId: mode === 'annuelle' && open ? eleveId : undefined,
  })

  const isLoading = mode === 'periode' ? periodQuery.isLoading : annualQuery.isLoading
  const view = mode === 'periode' ? periodQuery.data : annualQuery.data
  const errorMissing = !isLoading && !view

  // ─── Edit permission (Bulletin v2, Session 2) ────────────────
  // Observations + décision are editable by:
  //   - any admin
  //   - the class's professeur principal (profPrincipalId === profil.id)
  // Everyone else (plain prof, élève, parent) sees read-only display.
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [] } = useClasses()
  const canEdit = useMemo(() => {
    if (!profil) return false
    if (profil.role === 'admin') return true
    const classe = allClasses.find((c) => c.id === classeId)
    if (!classe) return false
    return classe.profPrincipalId === profil.id
  }, [profil, allClasses, classeId])

  // Cast once for the editor — the period query's data is an
  // EnrichedBulletinPeriodView, so observationsChef/decisionConseil
  // flow through even for admins who come in via a non-PP surface.
  const periodView =
    mode === 'periode' && view
      ? (view as EnrichedBulletinPeriodView)
      : null

  // Session 5 — annual view also carries observationsChef/decisionConseil
  // (added in Session 3.1). Cast for the editor in annual mode so admin
  // and PP can write end-of-year observations from the same surface.
  const annualView =
    mode === 'annuelle' && view
      ? (view as BulletinAnnualView)
      : null

  useEffect(() => {
    // No-op for now; future: scroll to top when open
  }, [open])

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-bg text-navy">
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>{eleveName}</ModalTitle>
            <ModalDescription>
              {mode === 'annuelle' ? 'Bulletin annuel' : `Bulletin · ${periode}`}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>
      <ModalBody className="bg-ink-50/30">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" label="Chargement du bulletin…" />
          </div>
        ) : errorMissing ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Bulletin introuvable"
            description={
              mode === 'annuelle'
                ? "Le bulletin annuel n'existe pas encore. Le PP doit clôturer l'année."
                : "Le bulletin de cette période n'existe pas encore. Le PP doit le générer."
            }
          />
        ) : (
          view && (
            <ErrorBoundary label="BulletinView">
              {canEdit && mode === 'periode' && periodView && periode && (
                <BulletinObservationsEditor
                  classeId={classeId}
                  eleveId={eleveId}
                  periode={periode}
                  currentObservations={periodView.observationsChef}
                  currentDecision={periodView.decisionConseil}
                />
              )}
              {canEdit && mode === 'annuelle' && annualView && (
                <BulletinObservationsEditor
                  classeId={classeId}
                  eleveId={eleveId}
                  // Annual bulletin doc lives under id "Année" — Periode
                  // is `string` so passing the literal is type-safe.
                  periode={'Année'}
                  currentObservations={annualView.observationsChef}
                  currentDecision={annualView.decisionConseil}
                  isAnnual
                />
              )}
              <BulletinView view={view} mode={mode} />
            </ErrorBoundary>
          )
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
        <Button
          variant="primary"
          disabled={!view}
          onClick={() => view && savePdf(view, mode)}
          leadingIcon={<Download className="h-4 w-4" />}
        >
          Télécharger PDF
        </Button>
      </ModalFooter>
    </Modal>
  )
}

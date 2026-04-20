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

import { useEffect } from 'react'
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
import { savePdf } from '@/lib/pdf/bulletinPdf'
import type { Periode } from '@/types/models'
import { BulletinView } from './BulletinView'

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

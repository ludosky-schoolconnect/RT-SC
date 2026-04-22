/**
 * RT-SC · TicketCard — in-app ticket display modal.
 *
 * Shown immediately after a quest claim succeeds (and in Phase 3
 * after a redemption request). Renders the ticket info as a
 * card-on-screen with a "Télécharger PDF" action for paper printing.
 *
 * Visually mirrors the PDF: gold band header, navy/gold palette,
 * code prominent, key fields in a label/value grid.
 */

import { Download, Ticket as TicketIcon, X } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { downloadTicketPdf } from '@/lib/pdf/ticketPdf'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/cn'

export interface TicketCardData {
  ticketCode: string
  queteTitre: string
  eleveNom: string
  classeNom: string
  pointsRecompense: number
  claimedAt: Date
  claimedByLabel: string
  schoolName?: string
  kind?: 'quete' | 'redemption'
  redemptionLabel?: string
}

interface Props {
  open: boolean
  onClose: () => void
  data: TicketCardData | null
}

export function TicketCard({ open, onClose, data }: Props) {
  const toast = useToast()

  // We deliberately ALWAYS render the Modal (don't early-return when
  // data is null). Returning null here at the wrong moment can race
  // with framer-motion's AnimatePresence inside Modal — particularly
  // when this is opened in the same render tick as another Modal
  // closes (the prof "claim on behalf" → ticket handoff). The Modal
  // primitive handles `open={false}` cleanly via its own lifecycle;
  // we just need to guard the inner content so we don't crash on
  // null-access.

  const isRedemption = data?.kind === 'redemption'

  function handleDownload() {
    if (!data) return
    try {
      downloadTicketPdf(data)
      toast.success('Ticket téléchargé.')
    } catch (err) {
      console.error('[TicketCard] download failed:', err)
      toast.error('Impossible de générer le PDF.')
    }
  }

  return (
    <Modal open={open && data !== null} onClose={onClose} size="sm">
      {data && (
        <>
          <ModalHeader>
            <ModalTitle>
              <span className="inline-flex items-center gap-2">
                <TicketIcon className="h-5 w-5 text-gold-dark" aria-hidden />
                {isRedemption ? 'Ticket de récompense' : 'Ticket de quête'}
              </span>
            </ModalTitle>
          </ModalHeader>

          <ModalBody className="px-0">
            {/* Card mirroring the PDF visual */}
            <div className="mx-4 rounded-xl overflow-hidden border-[1.5px] border-gold/40 bg-white">
          {/* Gold header band */}
          <div className="bg-gold px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="font-display text-[0.85rem] font-bold text-navy uppercase tracking-wider">
              {isRedemption ? 'Récompense' : 'Quête'}
            </p>
            <p className="font-mono text-[0.95rem] font-bold text-navy">
              {data.ticketCode}
            </p>
          </div>

          {data.schoolName && (
            <p className="px-4 pt-3 text-[0.7rem] uppercase tracking-wider font-bold text-ink-400">
              {data.schoolName}
            </p>
          )}

          <div className="px-4 py-3 space-y-3">
            <Field label="Élève" value={data.eleveNom} emphasis />
            <Field label="Classe" value={data.classeNom} />
            <Field
              label={isRedemption ? 'Récompense' : 'Quête'}
              value={isRedemption ? (data.redemptionLabel ?? '—') : data.queteTitre}
              emphasis
            />

            {/* Points badge */}
            <div>
              <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-400 mb-1">
                {isRedemption ? 'Coût' : 'Récompense'}
              </p>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.85rem] font-bold',
                  isRedemption
                    ? 'bg-navy text-white'
                    : 'bg-success text-white'
                )}
              >
                {isRedemption ? '−' : '+'}
                {data.pointsRecompense} pts
              </span>
            </div>

            {/* Footer info */}
            <div className="pt-2 border-t border-ink-100">
              <p className="text-[0.7rem] text-ink-500 leading-snug">
                {data.claimedAt.toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-[0.7rem] text-ink-500 leading-snug mt-0.5">
                Émis par : {data.claimedByLabel}
              </p>
            </div>
          </div>

          {/* Tiny instruction footer */}
          <div className="px-4 pb-3">
            <p className="text-[0.68rem] text-ink-400 italic leading-snug">
              {isRedemption
                ? "Présentez ce ticket à l'administration pour récupérer votre récompense."
                : "Présentez ce ticket après accomplissement pour validation."}
            </p>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          variant="ghost"
          onClick={onClose}
          leadingIcon={<X className="h-4 w-4" aria-hidden />}
        >
          Fermer
        </Button>
        <Button
          variant="primary"
          onClick={handleDownload}
          leadingIcon={<Download className="h-4 w-4" aria-hidden />}
        >
          Télécharger PDF
        </Button>
      </ModalFooter>
        </>
      )}
    </Modal>
  )
}

function Field({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-400">
        {label}
      </p>
      <p
        className={cn(
          'leading-tight mt-0.5',
          emphasis
            ? 'font-display text-[1rem] font-bold text-navy'
            : 'text-[0.88rem] text-ink-700'
        )}
      >
        {value}
      </p>
    </div>
  )
}

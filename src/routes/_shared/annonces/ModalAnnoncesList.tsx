/**
 * RT-SC · Modal inbox des annonces — full list for élève / parent.
 *
 * Opened from the Accueil widget. Shows all relevant (non-expired,
 * in-scope) annonces sorted by date desc. Tap a row → opens
 * ModalAnnonceDetail on top.
 *
 * Two-level stack → relies on the Modal stack fix (Phase 5a.1)
 * handling nested modals correctly.
 */

import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PriorityBadge } from './AnnonceRow'
import { ModalAnnonceDetail } from './ModalAnnonceDetail'
import type { Annonce } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  annonces: Annonce[]
}

export function ModalAnnoncesList({ open, onClose, annonces }: Props) {
  const [selected, setSelected] = useState<Annonce | null>(null)

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg">
        <ModalHeader onClose={onClose}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
              <Megaphone className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <ModalTitle>Annonces</ModalTitle>
              <ModalDescription>
                {annonces.length === 0
                  ? 'Aucune annonce pour le moment.'
                  : `${annonces.length} annonce${annonces.length > 1 ? 's' : ''} · la plus récente en premier.`}
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody>
          {annonces.length === 0 ? (
            <EmptyState
              title="Rien à signaler"
              description="Les communications de l'école apparaîtront ici."
            />
          ) : (
            <div className="rounded-lg ring-1 ring-ink-100 divide-y divide-ink-100 overflow-hidden bg-white">
              {annonces.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a)}
                  className="w-full text-left px-4 py-3 hover:bg-ink-50/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="font-display text-[0.95rem] font-bold text-navy leading-snug flex-1 min-w-0 truncate">
                      {a.title}
                    </h4>
                    <PriorityBadge priority={a.priority} />
                  </div>
                  <p className="text-[0.72rem] text-ink-500">
                    {formatDateShort(a)}
                    {a.createdByName && <> · {a.createdByName}</>}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </ModalFooter>
      </Modal>

      {selected && (
        <ModalAnnonceDetail
          open={!!selected}
          onClose={() => setSelected(null)}
          annonce={selected}
        />
      )}
    </>
  )
}

function formatDateShort(a: Annonce): string {
  if (!a.createdAt) return ''
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(a.createdAt.toDate())
  } catch {
    return ''
  }
}

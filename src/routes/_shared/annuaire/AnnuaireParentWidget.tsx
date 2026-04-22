/**
 * RT-SC · Annuaire — parent Accueil widget.
 *
 * Serves two purposes on the parent home screen:
 *   1. Teases the directory ("N parents listés · Consulter").
 *   2. Provides quick entry to edit the parent's own profile for
 *      the currently active child.
 *
 * UX:
 *   - If the parent ALREADY has a published entry for the active
 *     child, show "Modifier mon profil" + the current expiry hint.
 *   - Otherwise show "Rejoindre l'annuaire" as a call-to-action.
 *   - Tap the main card area to open the browse modal with search.
 *
 * Anti-spam visible to the user: the expiry hint reminds them
 * entries auto-stale after a year. Soft nudge at 30 days out.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, ChevronRight, Briefcase, Clock, Plus } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '@/components/ui/Modal'
import { useAnnuaire, useMyAnnuaireEntries } from '@/hooks/useAnnuaire'
import type { ParentSlot } from '@/hooks/useAnnuaire'
import { AnnuaireView } from './AnnuaireView'
import { AnnuaireParentEditor } from './AnnuaireParentEditor'
import { cn } from '@/lib/cn'

interface Props {
  eleveId: string
  classeId: string
  eleveName: string
}

export function AnnuaireParentWidget({
  eleveId,
  classeId,
  eleveName,
}: Props) {
  const { data: directory = [], isLoading } = useAnnuaire()
  const { data: myEntries = [] } = useMyAnnuaireEntries([eleveId])
  const [browseOpen, setBrowseOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<ParentSlot>('parent1')

  // Prefer slot1 as the default edit target. If slot1 exists and
  // slot2 is free, offer to add slot2 as a second parent. If both
  // exist, the parent can edit either via the editor's own delete
  // flow.
  const mine = useMemo(() => {
    const s1 = myEntries.find((e) => e.id === `${eleveId}_parent1`)
    const s2 = myEntries.find((e) => e.id === `${eleveId}_parent2`)
    return { s1, s2 }
  }, [myEntries, eleveId])

  const hasAny = !!mine.s1 || !!mine.s2
  const primary = mine.s1 ?? mine.s2 ?? null
  const currentSlot: ParentSlot = mine.s1 ? 'parent1' : 'parent2'

  // Expiry hint for the currently-displayed primary entry.
  const expiryHint = useMemo(() => {
    if (!primary) return null
    const d = primary.daysUntilExpiry
    if (d <= 30) {
      return {
        text: `Expire dans ${d} jour${d !== 1 ? 's' : ''}`,
        tone: 'warning' as const,
      }
    }
    return null
  }, [primary])

  function handleOpenEditor(slot: ParentSlot) {
    setEditingSlot(slot)
    setEditorOpen(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] overflow-hidden"
      >
        {/* Main row: browse directory */}
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-navy/[0.02] active:scale-[0.995] transition-all"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-dark ring-1 ring-gold/30">
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
              Annuaire des parents
            </p>
            <p className="text-[0.76rem] text-ink-500 mt-0.5 leading-snug">
              {isLoading
                ? 'Chargement…'
                : directory.length === 0
                  ? 'Soyez le premier à rejoindre'
                  : `${directory.length} parent${directory.length !== 1 ? 's' : ''} · Consulter`}
            </p>
          </div>
          <ChevronRight
            className="h-4 w-4 text-ink-400 shrink-0"
            aria-hidden
          />
        </button>

        {/* Own profile row — edit or join */}
        <div className="border-t border-ink-100">
          {hasAny && primary ? (
            <button
              type="button"
              onClick={() => handleOpenEditor(currentSlot)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-navy/[0.02] active:scale-[0.995] transition-all"
            >
              <Briefcase
                className="h-3.5 w-3.5 text-gold-dark shrink-0"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-[0.78rem] font-bold text-navy truncate">
                  {primary.nom}{' '}
                  <span className="font-normal text-ink-500">
                    · {primary.profession}
                  </span>
                </p>
                {expiryHint && (
                  <p
                    className={cn(
                      'text-[0.68rem] mt-0.5 flex items-center gap-1',
                      expiryHint.tone === 'warning' && 'text-warning-dark'
                    )}
                  >
                    <Clock className="h-2.5 w-2.5" aria-hidden />
                    {expiryHint.text} — pensez à mettre à jour
                  </p>
                )}
              </div>
              <span className="text-[0.7rem] font-bold text-navy shrink-0">
                Modifier
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenEditor('parent1')}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-navy/[0.02] active:scale-[0.995] transition-all"
            >
              <Plus className="h-3.5 w-3.5 text-gold-dark shrink-0" aria-hidden />
              <span className="text-[0.8rem] font-bold text-navy">
                Rejoindre l'annuaire
              </span>
              <span className="text-[0.7rem] text-ink-500">
                · partagez vos coordonnées
              </span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Browse directory modal */}
      <Modal open={browseOpen} onClose={() => setBrowseOpen(false)} size="xl">
        <ModalHeader onClose={() => setBrowseOpen(false)}>
          <ModalTitle>
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gold" aria-hidden />
              Annuaire des parents
            </span>
          </ModalTitle>
        </ModalHeader>
        <ModalBody className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto">
          <AnnuaireView />
        </ModalBody>
      </Modal>

      {/* Editor modal */}
      <AnnuaireParentEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        eleveId={eleveId}
        classeId={classeId}
        eleveName={eleveName}
        slot={editingSlot}
        existing={editingSlot === 'parent1' ? mine.s1 ?? null : mine.s2 ?? null}
      />
    </>
  )
}

/**
 * RT-SC · MonProfilSection (prof Mes Classes tab).
 *
 * Collapsible card sitting above the "Mes classes" grid that lets each
 * prof capture their own signature. When the prof is PP of any class,
 * this signature is rendered on the bulletins of that class's élèves.
 *
 * The card is intentionally collapsible — profs typically draw their
 * signature once per year, so keeping it folded by default preserves
 * screen real estate on the tab they actually use daily (class grid).
 *
 * A small "À définir" warning badge shows on the header when no
 * signature is stored, nudging PPs to set one up before the first
 * bulletin run. The badge disappears once a signature is saved.
 *
 * Self-write: the mutation targets /professeurs/{uid} where uid is the
 * current auth user — Firestore Rules enforce that users may only write
 * their own signature field (see Session 2's firestore.rules edit).
 */

import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PenLine, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  SignatureDrawCanvas,
  type SignatureDrawCanvasHandle,
} from '@/components/ui/SignatureDrawCanvas'
import { useAuthStore } from '@/stores/auth'
import { useProfs } from '@/hooks/useProfs'
import { useUpdateOwnProfSignature } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'

export function MonProfilSection() {
  const profil = useAuthStore((s) => s.profil)
  const { data: profs } = useProfs()
  const updateMut = useUpdateOwnProfSignature()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const canvasRef = useRef<SignatureDrawCanvasHandle | null>(null)

  // Read the live signature from the profs snapshot cache rather than
  // profil (auth store is written on login/onSnapshot but can lag by
  // a tick when the field updates).
  const myProf = useMemo(
    () => (profs ?? []).find((p) => p.id === profil?.id) ?? profil,
    [profs, profil]
  )
  const stored = myProf?.signature
  const hasStored = Boolean(stored)

  if (!profil) return null

  async function handleSave() {
    const h = canvasRef.current
    if (!h || !profil) return
    if (h.isEmpty()) {
      toast.warning('Veuillez dessiner une signature avant d\'enregistrer.')
      return
    }
    const dataUrl = h.toDataUrl()
    if (!dataUrl) {
      toast.warning('Signature vide — rien à enregistrer.')
      return
    }
    try {
      await updateMut.mutateAsync({
        profId: profil.id,
        signature: dataUrl,
      })
      toast.success('Signature enregistrée.')
      setHasDraft(false)
    } catch {
      toast.error("Erreur lors de l'enregistrement de la signature.")
    }
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ink-50/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-info-bg text-navy">
            <PenLine className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-semibold text-navy leading-tight">
              Ma signature
            </p>
            <p className="text-[0.78rem] text-ink-500 leading-snug mt-0.5">
              Apparaîtra sur les bulletins de vos classes dont vous êtes PP.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasStored ? (
            <Badge variant="success" size="sm">
              Définie
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              À définir
            </Badge>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-ink-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-ink-100"
          >
            <div className="px-5 py-4 space-y-4">
              <SignatureDrawCanvas
                ref={canvasRef}
                initialDataUrl={stored || undefined}
                onChange={(data) => setHasDraft(Boolean(data))}
                disabled={updateMut.isPending}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={!hasDraft && !hasStored}
                  loading={updateMut.isPending}
                  leadingIcon={<Save className="h-4 w-4" />}
                  size="sm"
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

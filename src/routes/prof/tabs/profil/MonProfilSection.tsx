/**
 * RT-SC · MonProfilSection (Session 5 simplified).
 *
 * Signature capture card, always rendered at full size. No collapsible
 * animation — that was the source of the canvas-glitch bug from earlier
 * sessions. With this living in its own dedicated "Mon profil" tab,
 * there's no need to fold it.
 *
 * The card moved here from MesClassesTab in Session 5; behavior and
 * Firestore writes are unchanged. Self-write to /professeurs/{uid} via
 * useUpdateOwnProfSignature; Firestore Rules enforce that users may
 * only write their own `signature` field.
 *
 * Visible state cues:
 *   - "Définie" badge (green) when a signature is stored
 *   - "À définir" badge (warning) otherwise — nudges new PPs to set
 *     one up before the first bulletin run
 *   - Save button disabled until the user has actually drawn something
 *     new (or has an existing signature to replace)
 */

import { useMemo, useRef, useState } from 'react'
import { PenLine, Save } from 'lucide-react'
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

  const [hasDraft, setHasDraft] = useState(false)
  const canvasRef = useRef<SignatureDrawCanvasHandle | null>(null)

  // Read the live signature from the profs snapshot cache rather than
  // profil (auth store is written on login/onSnapshot but can lag by
  // a tick when the field updates after a save).
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
      toast.warning("Veuillez dessiner une signature avant d'enregistrer.")
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
      {/* Header — same visual style as the old collapsible header
          (icon + title + status badge) but without the toggle. */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-100">
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
        <div className="shrink-0">
          {hasStored ? (
            <Badge variant="success" size="sm">
              Définie
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              À définir
            </Badge>
          )}
        </div>
      </div>

      {/* Body — always rendered. No height animation = no canvas
          measurement glitches. */}
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
    </Card>
  )
}

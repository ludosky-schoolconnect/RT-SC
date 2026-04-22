/**
 * RT-SC · SignatureDirectriceCard (admin).
 *
 * Renders the signature-capture control inside the Année tab, below
 * <BulletinConfigCard />. Stores the drawn signature at
 * /ecole/config.signatureDirectrice as a base64 PNG data URL.
 *
 * Admin-only — this surface only mounts under AdminDashboard.
 *
 * UX:
 *   - If a signature is already saved, it's painted onto the canvas on
 *     mount (via SignatureDrawCanvas's `initialDataUrl` prop).
 *   - The save button is disabled until something has been drawn OR the
 *     canvas differs from what's stored.
 *   - A "Supprimer" button wipes the signature both locally and remotely.
 */

import { useRef, useState } from 'react'
import { PenLine, Save, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import {
  SignatureDrawCanvas,
  type SignatureDrawCanvasHandle,
} from '@/components/ui/SignatureDrawCanvas'
import { useEcoleConfig, useUpdateEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

export function SignatureDirectriceCard() {
  const { data: config, isLoading } = useEcoleConfig()
  const updateMut = useUpdateEcoleConfig()
  const toast = useToast()
  const confirm = useConfirm()

  const canvasRef = useRef<SignatureDrawCanvasHandle | null>(null)
  // Local tracker for draw state so the Save button responds to strokes
  // without re-fetching config from Firestore.
  const [hasDraft, setHasDraft] = useState(false)

  const stored = config?.signatureDirectrice
  const hasStored = Boolean(stored)

  async function handleSave() {
    const h = canvasRef.current
    if (!h) return
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
      await updateMut.mutateAsync({ signatureDirectrice: dataUrl })
      toast.success('Signature enregistrée.')
      setHasDraft(false)
    } catch {
      toast.error("Erreur lors de l'enregistrement de la signature.")
    }
  }

  async function handleDelete() {
    if (!hasStored) return
    const ok = await confirm({
      title: 'Supprimer la signature ?',
      message:
        'La signature de la direction ne sera plus affichée sur les bulletins. Cette action est réversible — vous pouvez en redessiner une à tout moment.',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await updateMut.mutateAsync({ signatureDirectrice: '' })
      canvasRef.current?.clear()
      setHasDraft(false)
      toast.success('Signature supprimée.')
    } catch {
      toast.error('Erreur lors de la suppression.')
    }
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-navy" aria-hidden />
            Signature de la direction
            {hasStored ? (
              <Badge variant="success" size="sm">
                Enregistrée
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                À définir
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Signez une fois ici — la signature apparaîtra automatiquement sur
            tous les bulletins, à côté de celle du professeur principal.
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <SignatureDrawCanvas
            ref={canvasRef}
            initialDataUrl={stored || undefined}
            onChange={(data) => setHasDraft(Boolean(data))}
            disabled={updateMut.isPending}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.78rem] text-ink-500 leading-snug">
              Conseil : signez franchement, en occupant bien l'espace. Sur les
              petits écrans, tournez votre téléphone en mode paysage.
            </p>
            <div className="flex items-center gap-2">
              {hasStored && (
                <Button
                  variant="secondary"
                  onClick={handleDelete}
                  loading={updateMut.isPending}
                  leadingIcon={<Trash2 className="h-4 w-4" />}
                >
                  Supprimer
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!hasDraft && !hasStored}
                loading={updateMut.isPending}
                leadingIcon={<Save className="h-4 w-4" />}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

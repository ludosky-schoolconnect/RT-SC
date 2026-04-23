/**
 * RT-SC · MonProfilSection (Session 5, updated in Session E2).
 *
 * Two self-service cards for the prof's own account:
 *
 *   1. Signature — base64 PNG drawn by the prof, rendered on bulletins
 *      when they're a PP. Self-write to /professeurs/{uid}.signature
 *      (Session 7.3 rule allows this). Unchanged from Session 5.
 *
 *   2. Code de connexion (Session E2) — regenerate the per-prof login
 *      passkey. Calls the `regenerateOwnPasskey` HTTPS callable which
 *      writes a fresh 6-digit code + bumps loginPasskeyVersion (which
 *      invalidates any outstanding HMAC tokens → every other session
 *      logs out). The new code is shown once in a modal + emailed.
 *
 *      Dormant pre-Blaze: the callable returns functions/not-found
 *      and we surface a toast explaining that per-prof passkeys
 *      activate alongside the server migration. No break.
 */

import { useMemo, useRef, useState } from 'react'
import { PenLine, Save, KeyRound, RefreshCw, Copy, AlertTriangle } from 'lucide-react'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { functions } from '@/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import {
  SignatureDrawCanvas,
  type SignatureDrawCanvasHandle,
} from '@/components/ui/SignatureDrawCanvas'
import { useAuthStore } from '@/stores/auth'
import { useProfs } from '@/hooks/useProfs'
import { useUpdateOwnProfSignature } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

interface RegenerateOutput {
  ok: boolean
  passkey: string
}

function isFallbackCode(code: string | undefined): boolean {
  return (
    code === 'functions/not-found' ||
    code === 'functions/unavailable' ||
    code === 'not-found' ||
    code === 'unavailable'
  )
}

export function MonProfilSection() {
  const profil = useAuthStore((s) => s.profil)
  const { data: profs } = useProfs()
  const updateMut = useUpdateOwnProfSignature()
  const toast = useToast()
  const confirm = useConfirm()

  const [hasDraft, setHasDraft] = useState(false)
  const canvasRef = useRef<SignatureDrawCanvasHandle | null>(null)

  // Session E2 — regenerate-passkey state
  const [regenerating, setRegenerating] = useState(false)
  const [newPasskey, setNewPasskey] = useState<string | null>(null)

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

  async function handleRegenerate() {
    const confirmed = await confirm({
      title: 'Régénérer votre code de connexion ?',
      message:
        "Cette action remplace votre code actuel. Toutes vos autres sessions ouvertes (autre navigateur, téléphone, etc.) seront déconnectées. Un email avec le nouveau code sera également envoyé.",
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!confirmed) return

    setRegenerating(true)
    try {
      const call = httpsCallable<Record<string, never>, RegenerateOutput>(
        functions,
        'regenerateOwnPasskey'
      )
      const res = await call({})
      if (res.data?.ok && res.data.passkey) {
        setNewPasskey(res.data.passkey)
        toast.success('Nouveau code généré. Consultez votre email.')
      } else {
        toast.error('Régénération impossible. Réessayez.')
      }
    } catch (err) {
      const code = (err as FunctionsError)?.code
      if (isFallbackCode(code)) {
        toast.error(
          "Cette fonction n'est pas encore disponible. Contactez l'administration pour obtenir un nouveau code."
        )
      } else if (
        code === 'functions/unauthenticated' ||
        code === 'unauthenticated'
      ) {
        toast.error('Session expirée — reconnectez-vous.')
      } else if (
        code === 'functions/resource-exhausted' ||
        code === 'resource-exhausted'
      ) {
        toast.error('Trop de régénérations récentes — patientez quelques minutes.')
      } else {
        console.error('[MonProfilSection] regenerate error:', err)
        toast.error('Régénération impossible. Réessayez.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  async function copyPasskey() {
    if (!newPasskey) return
    try {
      await navigator.clipboard.writeText(newPasskey)
      toast.success('Code copié.')
    } catch {
      toast.error('Copie impossible.')
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Signature card ─────────────────────────────────── */}
      <Card padded={false} className="overflow-hidden">
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
              <Badge variant="success" size="sm">Définie</Badge>
            ) : (
              <Badge variant="warning" size="sm">À définir</Badge>
            )}
          </div>
        </div>

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

      {/* ─── Passkey rotation card (Session E2) ────────────── */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold-pale border border-gold/30 text-warning">
            <KeyRound className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-semibold text-navy leading-tight">
              Code de connexion
            </p>
            <p className="text-[0.78rem] text-ink-500 leading-snug mt-0.5">
              Le code à 6 chiffres demandé avant votre mot de passe.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {newPasskey ? (
            <div className="rounded-md border border-gold/40 bg-gold-pale/40 p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" aria-hidden />
                <p className="text-[0.8rem] text-ink-700 leading-snug">
                  <span className="font-semibold">Notez ce code maintenant.</span>{' '}
                  Il ne sera plus affiché ici après fermeture. Un email de
                  confirmation vous a été envoyé.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-ink-100 bg-white pl-4 pr-1 py-2.5">
                <code className="font-mono text-lg font-bold text-navy tracking-[0.3em] flex-1">
                  {newPasskey}
                </code>
                <IconButton
                  aria-label="Copier le code"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={copyPasskey}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewPasskey(null)}
                >
                  Fermer
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[0.82rem] text-ink-500 leading-snug">
                En cas de doute sur la confidentialité de votre code actuel,
                régénérez-en un nouveau. Toutes vos autres sessions ouvertes
                seront automatiquement déconnectées.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRegenerate}
                  loading={regenerating}
                  leadingIcon={<RefreshCw className="h-4 w-4" />}
                >
                  Régénérer mon code
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

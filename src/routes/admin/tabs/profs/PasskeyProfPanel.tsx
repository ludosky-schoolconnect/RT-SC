/**
 * RT-SC · Staff signup passkeys panel.
 *
 * Displays the two school-wide signup codes that new staff need to
 * type during account creation:
 *
 *   - Code professeur → gates `/auth/personnel/prof` signup
 *   - Code caisse     → gates `/auth/personnel/caisse` signup
 *
 * Admin can copy each one (to share via WhatsApp/SMS) or regenerate
 * it independently (if it's been leaked or to rotate periodically).
 *
 * Backward compat: if `passkeyCaisse` is undefined on the ecole/securite
 * doc (fresh install or legacy school), the caissier signup flow falls
 * back to accepting `passkeyProf`. The UI below nudges admin to set a
 * distinct caisse code, but doesn't block anything.
 *
 * Reads /ecole/securite. Writes via useRegeneratePasskeyProf /
 * useRegeneratePasskeyCaisse.
 */

import { Copy, RefreshCw, KeyRound, Wallet, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useEcoleSecurite } from '@/hooks/useEcoleSecurite'
import {
  useRegeneratePasskeyProf,
  useRegeneratePasskeyCaisse,
} from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

export function PasskeyProfPanel() {
  const { data: securite, isLoading } = useEcoleSecurite()
  const regenProfMut = useRegeneratePasskeyProf()
  const regenCaisseMut = useRegeneratePasskeyCaisse()
  const toast = useToast()
  const confirm = useConfirm()

  const passkeyProf = securite?.passkeyProf
  const passkeyCaisse = securite?.passkeyCaisse

  async function copy(code: string, label: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(`${label} copié.`)
    } catch {
      toast.error('Copie impossible.')
    }
  }

  async function regenProf() {
    const ok = await confirm({
      title: 'Régénérer le code professeur ?',
      message:
        "Les enseignants devront utiliser le nouveau code lors de leur prochaine inscription. L'ancien code sera invalide.",
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const newKey = await regenProfMut.mutateAsync()
      toast.success(`Nouveau code professeur : ${newKey}`, 7000)
    } catch {
      toast.error('Échec de la régénération.')
    }
  }

  async function regenCaisse() {
    const ok = await confirm({
      title: 'Régénérer le code caisse ?',
      message:
        "Les caissiers devront utiliser le nouveau code lors de leur prochaine inscription. L'ancien code sera invalide.",
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const newKey = await regenCaisseMut.mutateAsync()
      toast.success(`Nouveau code caisse : ${newKey}`, 7000)
    } catch {
      toast.error('Échec de la régénération.')
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* ─── Code professeur ──────────────────────────────── */}
      <div className="rounded-lg border-[1.5px] border-ink-100 bg-white p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold-pale border border-gold/30 text-warning">
            <KeyRound className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
              Code d'accès professeur
            </p>
            <p className="text-[0.78rem] text-ink-400 leading-tight mt-0.5">
              À fournir aux enseignants pour créer leur compte.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-ink-100 bg-ink-50/40 pl-4 pr-1 py-2.5">
          {isLoading ? (
            <Spinner size="sm" />
          ) : passkeyProf ? (
            <code className="font-mono text-lg font-bold text-navy tracking-[0.3em] flex-1">
              {passkeyProf}
            </code>
          ) : (
            <p className="flex items-center gap-2 text-sm text-warning flex-1">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              Aucun code — générez-en un.
            </p>
          )}

          {passkeyProf && (
            <IconButton
              aria-label="Copier le code professeur"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={() => copy(passkeyProf, 'Code professeur')}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={regenProf}
          loading={regenProfMut.isPending}
          leadingIcon={<RefreshCw className="h-4 w-4" />}
          className="mt-3"
        >
          {passkeyProf ? 'Régénérer' : 'Générer'}
        </Button>
      </div>

      {/* ─── Code caisse ──────────────────────────────────── */}
      <div className="rounded-lg border-[1.5px] border-ink-100 bg-white p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-info-bg border border-navy/20 text-navy">
            <Wallet className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
              Code d'accès caisse
            </p>
            <p className="text-[0.78rem] text-ink-400 leading-tight mt-0.5">
              À fournir aux caissiers pour créer leur compte.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-ink-100 bg-ink-50/40 pl-4 pr-1 py-2.5">
          {isLoading ? (
            <Spinner size="sm" />
          ) : passkeyCaisse ? (
            <code className="font-mono text-lg font-bold text-navy tracking-[0.3em] flex-1">
              {passkeyCaisse}
            </code>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-500 flex-1 text-[0.82rem]">
              <AlertCircle className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              Non défini — le code professeur fera office par défaut.
            </p>
          )}

          {passkeyCaisse && (
            <IconButton
              aria-label="Copier le code caisse"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={() => copy(passkeyCaisse, 'Code caisse')}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={regenCaisse}
          loading={regenCaisseMut.isPending}
          leadingIcon={<RefreshCw className="h-4 w-4" />}
          className="mt-3"
        >
          {passkeyCaisse ? 'Régénérer' : 'Générer un code distinct'}
        </Button>
      </div>
    </div>
  )
}

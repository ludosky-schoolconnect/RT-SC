/**
 * RT-SC · Prof signup passkey panel.
 *
 * Displays the school-wide passkey that profs need to type during signup.
 * Admin can copy it (to share via WhatsApp/SMS) or regenerate it (if it's
 * been leaked or to rotate periodically).
 *
 * Reads /ecole/securite. Writes via useRegeneratePasskeyProf.
 */

import { Copy, RefreshCw, KeyRound, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useEcoleSecurite } from '@/hooks/useEcoleSecurite'
import { useRegeneratePasskeyProf } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useQueryClient } from '@tanstack/react-query'

export function PasskeyProfPanel() {
  const { data: securite, isLoading } = useEcoleSecurite()
  const regenMut = useRegeneratePasskeyProf()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const passkey = securite?.passkeyProf

  async function copy() {
    if (!passkey) return
    try {
      await navigator.clipboard.writeText(passkey)
      toast.success('Code copié.')
    } catch {
      toast.error('Copie impossible.')
    }
  }

  async function regen() {
    const ok = await confirm({
      title: 'Régénérer le code professeur ?',
      message:
        "Les enseignants devront utiliser le nouveau code lors de leur prochaine inscription. L'ancien code sera invalide.",
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const newKey = await regenMut.mutateAsync()
      qc.invalidateQueries({ queryKey: ['ecole', 'securite'] })
      toast.success(`Nouveau code : ${newKey}`, 7000)
    } catch {
      toast.error('Échec de la régénération.')
    }
  }

  return (
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
            À fournir aux enseignants pour qu'ils puissent créer leur compte.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-ink-100 bg-ink-50/40 pl-4 pr-1 py-2.5">
        {isLoading ? (
          <Spinner size="sm" />
        ) : passkey ? (
          <code className="font-mono text-lg font-bold text-navy tracking-[0.3em] flex-1">
            {passkey}
          </code>
        ) : (
          <p className="flex items-center gap-2 text-sm text-warning flex-1">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            Aucun code défini — générez-en un.
          </p>
        )}

        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          {passkey && (
            <IconButton
              aria-label="Copier le code"
              variant="ghost"
              className="h-9 w-9"
              onClick={copy}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={regen}
        loading={regenMut.isPending}
        leadingIcon={<RefreshCw className="h-4 w-4" />}
        className="mt-3"
      >
        {passkey ? 'Régénérer le code' : 'Générer un code'}
      </Button>
    </div>
  )
}

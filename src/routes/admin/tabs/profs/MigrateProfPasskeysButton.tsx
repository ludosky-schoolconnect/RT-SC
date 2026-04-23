/**
 * RT-SC · Migrate prof passkeys button (Session E3).
 *
 * One-click migration for the transition between the legacy school-
 * wide passkey and the per-prof passkey system introduced in
 * Session E1a. Iterates active profs who don't have a `loginPasskey`
 * field set yet and calls `regeneratePasskeyForProf` for each, which
 * stamps a fresh passkey and emails it to the prof.
 *
 * Profs go through the normal onProfActivated trigger the first time
 * an admin flips them actif post-Blaze, so this button is only
 * needed for profs who were already actif BEFORE Blaze activation
 * (they missed the trigger). In a freshly-activated system, the
 * button finds no candidates and cleanly exits.
 *
 * Session E4 — the pre-Blaze "function not available" branch was
 * removed. Blaze is required for any function to run, and the whole
 * Session E system assumes it.
 *
 * Idempotency: re-running against already-migrated profs is safe —
 * the server-side callable just issues a fresh passkey each time
 * (bumping the version, invalidating any prior token). The UI
 * filters to `missing loginPasskey` to avoid the accidental mass-
 * rotation scenario.
 *
 * UX: a single Button at the top of the PasskeyProfPanel (or
 * wherever placed) that opens a confirmation modal → shows progress
 * per prof → final toast summary. Kept as a standalone component so
 * it can be imported wherever the admin UI wants to surface it.
 */

import { useState } from 'react'
import { KeyRound, Loader2, AlertCircle } from 'lucide-react'
import type { FunctionsError } from 'firebase/functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useProfs } from '@/hooks/useProfs'
import { useRegeneratePasskeyForProf } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

interface ProgressEntry {
  profId: string
  nom: string
  status: 'pending' | 'done' | 'failed'
  error?: string
}

export function MigrateProfPasskeysButton() {
  const { data: profs } = useProfs()
  const regenMut = useRegeneratePasskeyForProf()
  const toast = useToast()
  const confirm = useConfirm()

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEntry[]>([])

  // Active profs missing a loginPasskey — the migration targets.
  // Post-Blaze, this list shrinks to zero naturally as onProfActivated
  // handles new approvals.
  const candidates = (profs ?? []).filter(
    (p) => p.statut === 'actif' && !p.loginPasskey
  )

  async function handleClick() {
    if (candidates.length === 0) {
      toast.info(
        "Aucun professeur à migrer. Tous les comptes actifs ont déjà un code de connexion."
      )
      return
    }

    const ok = await confirm({
      title: `Générer les codes manquants (${candidates.length} professeur${candidates.length > 1 ? 's' : ''}) ?`,
      message: `Un code à 6 chiffres sera généré pour chaque professeur actif qui n'en a pas encore un, et leur sera envoyé par email. Cette action est réversible (ils pourront régénérer leur code plus tard).`,
      confirmLabel: 'Lancer la migration',
      variant: 'warning',
    })
    if (!ok) return

    setRunning(true)
    setProgress(
      candidates.map((p) => ({
        profId: p.id,
        nom: p.nom,
        status: 'pending',
      }))
    )

    let successCount = 0
    let failCount = 0

    for (const prof of candidates) {
      try {
        await regenMut.mutateAsync({ profId: prof.id })
        successCount++
        setProgress((prev) =>
          prev.map((e) =>
            e.profId === prof.id ? { ...e, status: 'done' } : e
          )
        )
      } catch (err) {
        failCount++
        setProgress((prev) =>
          prev.map((e) =>
            e.profId === prof.id
              ? {
                  ...e,
                  status: 'failed',
                  error: (err as FunctionsError)?.message ?? (err as Error).message ?? 'inconnue',
                }
              : e
          )
        )
      }
    }

    setRunning(false)

    if (failCount === 0) {
      toast.success(
        `Migration terminée. ${successCount} professeur${successCount > 1 ? 's' : ''} migré${successCount > 1 ? 's' : ''}.`
      )
    } else {
      toast.warning(
        `Migration partielle : ${successCount} réussis, ${failCount} échoués. Consultez le tableau ci-dessous.`
      )
    }
  }

  // Don't render anything if there's nothing to migrate AND we're
  // not currently showing progress from a previous run.
  if (candidates.length === 0 && progress.length === 0) return null

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-ink-100 bg-gold-pale/30">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold-pale border border-gold/30 text-warning">
          <KeyRound className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
            Migration des codes de connexion
          </p>
          <p className="text-[0.8rem] text-ink-600 leading-snug mt-1">
            {candidates.length > 0 ? (
              <>
                <span className="font-semibold">{candidates.length}</span>{' '}
                professeur{candidates.length > 1 ? 's actifs n\'ont' : ' actif n\'a'} pas
                encore de code de connexion personnel. Générez-les en masse
                et chacun sera averti par email.
              </>
            ) : (
              'Toutes les migrations sont terminées.'
            )}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {candidates.length > 0 && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleClick}
              loading={running}
              leadingIcon={<KeyRound className="h-4 w-4" />}
            >
              Générer les codes manquants ({candidates.length})
            </Button>
          </div>
        )}

        {progress.length > 0 && (
          <div className="rounded-md border border-ink-100 bg-ink-50/30 divide-y divide-ink-100">
            {progress.map((entry) => (
              <div
                key={entry.profId}
                className="flex items-center gap-3 px-3 py-2 text-[0.82rem]"
              >
                <div className="shrink-0 w-4">
                  {entry.status === 'pending' && (
                    <Loader2 className="h-3.5 w-3.5 text-ink-400 animate-spin" aria-hidden />
                  )}
                  {entry.status === 'done' && (
                    <span className="text-success font-bold">✓</span>
                  )}
                  {entry.status === 'failed' && (
                    <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
                  )}
                </div>
                <span className="flex-1 font-medium text-navy truncate">
                  {entry.nom}
                </span>
                <span className="shrink-0 text-[0.72rem] text-ink-500">
                  {entry.status === 'done' && 'Code envoyé'}
                  {entry.status === 'pending' && 'En cours…'}
                  {entry.status === 'failed' && (entry.error ?? 'Échec')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * RT-SC · Civisme admin — Maintenance card.
 *
 * Lets admin purge old/closed civisme records (quêtes clôturées ou
 * annulées + leurs claims, réclamations honorées ou annulées) older
 * than a retention threshold. civismeHistory entries are never
 * touched by this — the audit trail stays.
 *
 * Suggested cadence: once per trimester or at year rollover.
 */

import { useState } from 'react'
import { Archive, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import { usePurgeOldCivismeData } from '@/hooks/usePurgeOldCivismeData'

export function MaintenanceCard() {
  const purgeMut = usePurgeOldCivismeData()
  const confirm = useConfirm()
  const toast = useToast()
  const [lastResult, setLastResult] = useState<
    { qc: number; cc: number; rc: number; at: Date } | null
  >(null)

  async function handlePurge() {
    const ok = await confirm({
      title: 'Purger les anciennes données ?',
      message:
        "Supprime définitivement les quêtes clôturées ou annulées et les réclamations honorées ou annulées de plus de 6 mois. L'historique des points de chaque élève est conservé.",
      confirmLabel: 'Purger',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const res = await purgeMut.mutateAsync(180)
      setLastResult({
        qc: res.quetesDeleted,
        cc: res.claimsDeleted,
        rc: res.reclamationsDeleted,
        at: new Date(),
      })
      const total = res.quetesDeleted + res.claimsDeleted + res.reclamationsDeleted
      if (total === 0) {
        toast.success('Aucune donnée à purger.')
      } else {
        toast.success(
          `Purge terminée : ${res.quetesDeleted} quêtes, ${res.claimsDeleted} participations, ${res.reclamationsDeleted} réclamations supprimées.`
        )
      }
    } catch (err) {
      console.error('[MaintenanceCard] purge failed:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la purge.'
      )
    }
  }

  return (
    <div className="mt-8 rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 bg-ink-50/40 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy/10 ring-1 ring-navy/20">
          <Archive className="h-3.5 w-3.5 text-navy" aria-hidden />
        </div>
        <p className="font-display text-[0.9rem] font-bold text-navy leading-tight">
          Maintenance
        </p>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-dark shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.78rem] text-ink-600 leading-snug">
            Nettoyez les quêtes clôturées/annulées et les réclamations
            honorées/annulées de plus de 6 mois pour libérer de l'espace
            de stockage. L'historique des points de chaque élève n'est
            PAS affecté.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handlePurge}
          loading={purgeMut.isPending}
          leadingIcon={<Archive className="h-4 w-4" aria-hidden />}
          className="w-full"
        >
          Purger les anciennes données (&gt; 6 mois)
        </Button>

        {lastResult && (
          <div className="rounded-md bg-success-bg/60 border border-success/30 px-3 py-2 flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success-dark shrink-0 mt-0.5" aria-hidden />
            <div className="text-[0.72rem] text-success-dark leading-snug">
              <p className="font-bold">
                Dernière purge :{' '}
                {lastResult.at.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="mt-0.5">
                {lastResult.qc} quêtes · {lastResult.cc} participations ·{' '}
                {lastResult.rc} réclamations supprimées.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

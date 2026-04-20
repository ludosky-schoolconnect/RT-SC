/**
 * RT-SC · Pending profs list.
 *
 * Section shown above the active profs list when there are profs awaiting
 * approval. Each row has approve (✓ green) and reject (✕ red) buttons.
 *
 * Approve sets statut: 'actif' on the prof doc.
 * Reject deletes the prof doc (Firebase Auth account is left alone — same
 * behavior as the legacy app).
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Mail, Hourglass } from 'lucide-react'
import type { Professeur } from '@/types/models'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { useApproveProf, useRejectProf } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { formatDateShort } from '@/lib/date'

interface PendingProfsListProps {
  pending: Professeur[]
}

export function PendingProfsList({ pending }: PendingProfsListProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const approveMut = useApproveProf()
  const rejectMut = useRejectProf()

  if (pending.length === 0) return null

  async function approve(p: Professeur) {
    const ok = await confirm({
      title: `Approuver ${p.nom} ?`,
      message:
        "Le professeur aura immédiatement accès à son tableau de bord et pourra voir ses classes assignées.",
      confirmLabel: 'Approuver',
      variant: 'info',
    })
    if (!ok) return
    try {
      await approveMut.mutateAsync(p.id)
      toast.success(`${p.nom} approuvé.`)
    } catch {
      toast.error("Échec de l'approbation.")
    }
  }

  async function reject(p: Professeur) {
    const ok = await confirm({
      title: `Rejeter la demande de ${p.nom} ?`,
      message:
        "La demande sera supprimée de la plateforme. Le compte Firebase reste créé mais sans profil sur l'application.",
      confirmLabel: 'Rejeter',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await rejectMut.mutateAsync(p.id)
      toast.info(`Demande de ${p.nom} rejetée.`)
    } catch {
      toast.error('Échec du rejet.')
    }
  }

  return (
    <section className="rounded-lg border-[1.5px] border-warning/30 bg-warning-bg/30 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-warning/20">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/15 text-warning">
          <Hourglass className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="font-display text-[0.95rem] font-semibold text-warning leading-tight">
            En attente d'approbation
          </p>
          <p className="text-[0.78rem] text-warning/80 leading-tight">
            {pending.length} demande{pending.length > 1 ? 's' : ''} à traiter.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-warning/15">
        <AnimatePresence initial={false}>
          {pending.map((p) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 px-4 py-3 bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-bg text-navy font-display font-bold text-sm">
                {p.nom.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy truncate">{p.nom}</p>
                <p className="flex items-center gap-1 text-[0.78rem] text-ink-600 mt-0.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{p.email}</span>
                </p>
                {p.matieres?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.matieres.slice(0, 4).map((m) => (
                      <Badge key={m} variant="neutral" size="sm">
                        {m}
                      </Badge>
                    ))}
                    {p.matieres.length > 4 && (
                      <Badge variant="neutral" size="sm">
                        +{p.matieres.length - 4}
                      </Badge>
                    )}
                  </div>
                )}
                {p.createdAt && (
                  <p className="text-[0.7rem] text-ink-400 mt-1">
                    Demandé le {formatDateShort(p.createdAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  aria-label={`Approuver ${p.nom}`}
                  variant="ghost"
                  onClick={() => approve(p)}
                  className="text-success hover:bg-success-bg hover:text-success"
                >
                  <Check className="h-5 w-5" aria-hidden />
                </IconButton>
                <IconButton
                  aria-label={`Rejeter ${p.nom}`}
                  variant="danger"
                  onClick={() => reject(p)}
                >
                  <X className="h-5 w-5" aria-hidden />
                </IconButton>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

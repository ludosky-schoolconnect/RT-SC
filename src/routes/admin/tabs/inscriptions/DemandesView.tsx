/**
 * RT-SC · Demandes view — pending pre-inscriptions awaiting triage.
 *
 * Shows all dossiers with statut === 'En attente'. Per-row actions:
 *   - Voir documents → opens documents viewer (lazy load)
 *   - Approuver → opens class picker + auto-RV modal
 *   - Refuser → opens refusal reason modal
 *   - Supprimer → confirm + hard delete (with doc subcollection cleanup)
 *
 * Sort: oldest first (FIFO triage). Most pressing dossiers naturally
 * float to the top because the rest got handled.
 */

import { useMemo, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  FileText,
  Inbox,
  Phone,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useDeleteInscription } from '@/hooks/usePreInscriptions'
import type { PreInscription } from '@/types/models'
import type { Timestamp } from 'firebase/firestore'
import { ModalApprouverInscription } from './ModalApprouverInscription'
import { ModalRefuserInscription } from './ModalRefuserInscription'
import { ModalDocumentsViewer } from './ModalDocumentsViewer'
import { serverNow } from '@/lib/serverTime'

interface Props {
  list: PreInscription[]
}

function tsToDate(ts: Timestamp | unknown): Date | null {
  if (!ts) return null
  const t = ts as { toDate?: () => Date }
  if (typeof t.toDate === 'function') return t.toDate()
  return null
}

function formatSubmissionDate(ts: Timestamp | unknown): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return d.toLocaleString('fr-FR')
  }
}

function calculateAge(birthISO: string): string {
  if (!birthISO) return ''
  const birth = new Date(birthISO)
  if (isNaN(birth.getTime())) return ''
  const now = serverNow()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return `${age} ans`
}

export function DemandesView({ list }: Props) {
  const pending = useMemo(
    () =>
      [...list]
        .filter((d) => d.statut === 'En attente')
        .sort((a, b) => {
          const ad = tsToDate(a.dateSoumission)?.getTime() ?? 0
          const bd = tsToDate(b.dateSoumission)?.getTime() ?? 0
          return ad - bd  // oldest first
        }),
    [list]
  )

  const [approving, setApproving] = useState<PreInscription | null>(null)
  const [refusing, setRefusing] = useState<PreInscription | null>(null)
  const [viewingDocs, setViewingDocs] = useState<PreInscription | null>(null)

  const deleteMut = useDeleteInscription()
  const toast = useToast()
  const confirm = useConfirm()

  async function handleDelete(d: PreInscription) {
    const ok = await confirm({
      title: 'Supprimer ce dossier ?',
      message: `Le dossier de ${d.nom} et tous ses documents seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await deleteMut.mutateAsync({
        inscriptionId: d.id,
        dateRV: d.dateRV,  // releases RV slot if any
      })
      toast.success('Dossier supprimé.')
    } catch (err) {
      console.error('[delete pre-inscription] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-10 w-10" />}
        title="Aucune demande en attente"
        description="Les nouvelles demandes apparaîtront ici dès qu'un parent soumet le formulaire en ligne."
      />
    )
  }

  return (
    <>
      <div className="space-y-2">
        {pending.map((d) => (
          <article
            key={d.id}
            className="rounded-lg border border-ink-100 bg-white p-3.5 shadow-sm"
          >
            {/* Header row */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning ring-1 ring-warning/20">
                <Inbox className="h-5 w-5" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="font-display font-bold text-[0.95rem] text-navy leading-tight truncate">
                      {d.nom}
                    </h4>
                    <div className="text-[0.72rem] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <Badge variant={d.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
                        {d.genre}
                      </Badge>
                      <span>{d.niveauSouhaite}</span>
                      {calculateAge(d.date_naissance) && (
                        <span className="text-ink-400">· {calculateAge(d.date_naissance)}</span>
                      )}
                      {d.categorieDossier && (
                        <Badge variant="neutral" size="sm">{d.categorieDossier}</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-[0.7rem] text-ink-400 inline-flex items-center gap-1 shrink-0">
                    <Calendar className="h-3 w-3" aria-hidden />
                    {formatSubmissionDate(d.dateSoumission)}
                  </span>
                </div>

                {/* Contact + tracking code */}
                <div className="mt-1.5 flex items-center gap-3 text-[0.72rem] text-ink-600 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3 text-ink-400" aria-hidden />
                    <a
                      href={`tel:${d.contactParent}`}
                      className="font-mono hover:text-navy hover:underline"
                    >
                      {d.contactParent}
                    </a>
                  </span>
                  <span className="text-ink-300">·</span>
                  <span>
                    Code <span className="font-mono font-semibold text-ink-800">{d.trackingCode}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => setViewingDocs(d)}
              >
                Documents
              </Button>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<XCircle className="h-3.5 w-3.5" />}
                  onClick={() => setRefusing(d)}
                >
                  Refuser
                </Button>
                <Button
                  size="sm"
                  leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  onClick={() => setApproving(d)}
                >
                  Approuver
                </Button>
                <IconButton
                  variant="danger"
                  aria-label={`Supprimer le dossier de ${d.nom}`}
                  onClick={() => handleDelete(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Modals — mounted whenever target picked, flipping `open` */}
      <ModalApprouverInscription
        open={!!approving}
        inscription={approving}
        onClose={() => setApproving(null)}
      />
      <ModalRefuserInscription
        open={!!refusing}
        inscription={refusing}
        onClose={() => setRefusing(null)}
      />
      <ModalDocumentsViewer
        open={!!viewingDocs}
        inscription={viewingDocs}
        onClose={() => setViewingDocs(null)}
      />
    </>
  )
}

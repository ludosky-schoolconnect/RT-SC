/**
 * RT-SC · Modal détail d'une annonce.
 *
 * Shared between admin/prof/eleve/parent. Shows the full announcement
 * with markdown body rendered. Priority badge + scope summary + author
 * + date in the header area.
 *
 * ─── Edit / delete (Phase 5b.2) ─────────────────────────────
 *
 * Footer shows edit + delete buttons only when the viewer can act:
 *   - Admin  → can always edit/delete any annonce
 *   - Prof   → can edit/delete only their own (createdBy === user.uid)
 *   - Others → read-only, just a "Fermer" button
 *
 * Edit is handled by the PARENT component (tab). We emit `onRequestEdit`
 * and the tab opens the appropriate composer (admin or prof) in edit mode.
 *
 * Delete is handled in-place: confirm dialog → useDeleteAnnonce → close
 * modal. Parent doesn't need to do anything (the onSnapshot in useAnnonces
 * updates the list automatically).
 */

import ReactMarkdown from 'react-markdown'
import {
  Megaphone, Calendar, User, Building2, Users,
  Pencil, Trash2,
} from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useClasses } from '@/hooks/useClasses'
import { useAuthStore } from '@/stores/auth'
import { useDeleteAnnonce } from '@/hooks/useAnnoncesMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { nomClasse } from '@/lib/benin'
import { PriorityBadge } from './AnnonceRow'
import type { Annonce } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  annonce: Annonce
  /** When provided, the edit button shows and this runs on tap. */
  onRequestEdit?: () => void
}

export function ModalAnnonceDetail({ open, onClose, annonce, onRequestEdit }: Props) {
  const { data: classes = [] } = useClasses()
  const role = useAuthStore((s) => s.role)
  const user = useAuthStore((s) => s.user)
  const deleteMut = useDeleteAnnonce()
  const toast = useToast()
  const confirm = useConfirm()

  // Permissions
  const isAdmin = role === 'admin'
  const isAuthor = role === 'prof' && !!user?.uid && user.uid === annonce.createdBy
  const canEdit = isAdmin || isAuthor
  const canDelete = canEdit

  async function handleDelete() {
    const ok = await confirm({
      title: "Supprimer l'annonce ?",
      message: `« ${annonce.title} » sera supprimée définitivement. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(annonce.id)
      toast.success('Annonce supprimée.')
      onClose()
    } catch (err) {
      console.error('[ModalAnnonceDetail] delete error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  const scopeDetail = (() => {
    if (annonce.scope.kind === 'school') return "Toute l'école"
    const names = annonce.scope.classeIds
      .map((id) => classes.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => nomClasse(c as Parameters<typeof nomClasse>[0]))
    if (names.length === 0) return 'Classes (inconnues)'
    if (names.length === 1) return names[0]
    if (names.length <= 3) return names.join(' · ')
    return `${names.slice(0, 2).join(' · ')} et ${names.length - 2} autres`
  })()

  const dateStr = (() => {
    if (!annonce.createdAt) return '—'
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(annonce.createdAt.toDate())
        .replace(/^./, (c) => c.toUpperCase())
    } catch {
      return '—'
    }
  })()

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <ModalTitle className="flex-1 min-w-0">
                {annonce.title}
              </ModalTitle>
              <PriorityBadge priority={annonce.priority} />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[0.72rem] text-ink-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {annonce.scope.kind === 'school' ? (
                  <Building2 className="h-3 w-3" aria-hidden />
                ) : (
                  <Users className="h-3 w-3" aria-hidden />
                )}
                {scopeDetail}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden />
                {dateStr}
              </span>
              {annonce.createdByName && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" aria-hidden />
                  {annonce.createdByName}
                </span>
              )}
            </div>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="prose-rt-sc">
          <ReactMarkdown>{annonce.body}</ReactMarkdown>
        </div>
      </ModalBody>

      <ModalFooter>
        {/* Left-side actions for authors/admins */}
        {canDelete && (
          <Button
            variant="danger"
            leadingIcon={<Trash2 className="h-4 w-4" />}
            onClick={handleDelete}
            loading={deleteMut.isPending}
            className="mr-auto"
          >
            Supprimer
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
        {canEdit && onRequestEdit && (
          <Button
            variant="primary"
            leadingIcon={<Pencil className="h-4 w-4" />}
            onClick={onRequestEdit}
          >
            Modifier
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}

/**
 * RT-SC · Civisme — Récompenses sub-section (admin catalog).
 *
 * The school-wide rewards catalog. Admin defines entries; students
 * (in Phase 3) browse and request claims.
 *
 * UI:
 *   - Top header with intro + "+ Ajouter" button
 *   - Tier hint chips at the top: how rewards layer over tiers
 *   - Sorted list of rewards (cheapest first)
 *   - Each row: nom + description + points pill + availability toggle + edit/delete
 *   - Empty state with helpful copy
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Edit3,
  Trash2,
  Coins,
  Sparkles,
  Gift,
  EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import {
  useRecompenses,
  useDeleteRecompense,
  useUpdateRecompense,
} from '@/hooks/useRecompenses'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { RecompenseFormModal } from './RecompenseFormModal'
import { cn } from '@/lib/cn'
import type { Recompense } from '@/types/models'

export function RecompensesSection() {
  const profil = useAuthStore((s) => s.profil)
  const { data: recompenses = [], isLoading } = useRecompenses()
  const deleteMut = useDeleteRecompense()
  const updateMut = useUpdateRecompense()
  const toast = useToast()
  const confirm = useConfirm()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Recompense | undefined>(undefined)

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(r: Recompense) {
    setEditing(r)
    setFormOpen(true)
  }

  async function handleDelete(r: Recompense) {
    const ok = await confirm({
      title: `Supprimer "${r.nom}" ?`,
      message:
        "Cette récompense ne sera plus visible dans le catalogue des élèves. Les anciennes réclamations restent dans l'historique.",
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(r.id)
      toast.success('Récompense supprimée.')
    } catch (err) {
      console.error('[RecompensesSection] delete failed:', err)
      toast.error('Erreur lors de la suppression.')
    }
  }

  async function handleToggleDisponible(r: Recompense) {
    try {
      await updateMut.mutateAsync({ id: r.id, disponible: !r.disponible })
    } catch (err) {
      console.error('[RecompensesSection] toggle failed:', err)
      toast.error('Erreur lors de la mise à jour.')
    }
  }

  return (
    <Section>
      <SectionHeader
        title="Catalogue des récompenses"
        description="Définissez ce que les élèves peuvent réclamer avec leurs points de civisme."
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={openAdd}
            disabled={!profil}
          >
            Ajouter
          </Button>
        }
      />

      {/* Helpful seed suggestions when catalog is empty */}
      {!isLoading && recompenses.length === 0 ? (
        <EmptyState
          icon={<Gift className="h-8 w-8" />}
          title="Aucune récompense"
          description="Créez votre première récompense pour donner du sens aux points gagnés. Exemples : calculatrice (20 pts), sac (50 pts), manuel (100 pts), certificat d'honneur (150 pts)."
        />
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-2">
          {recompenses.map((r) => (
            <RecompenseRow
              key={r.id}
              recompense={r}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r)}
              onToggleDisponible={() => handleToggleDisponible(r)}
              toggling={updateMut.isPending}
            />
          ))}
        </div>
      )}

      {profil && (
        <RecompenseFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          existing={editing}
          currentUserUid={profil.id}
        />
      )}
    </Section>
  )
}

// ─── Row ────────────────────────────────────────────────────

function RecompenseRow({
  recompense: r,
  onEdit,
  onDelete,
  onToggleDisponible,
  toggling,
}: {
  recompense: Recompense
  onEdit: () => void
  onDelete: () => void
  onToggleDisponible: () => void
  toggling: boolean
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'bg-white rounded-lg border-[1.5px] px-4 py-3 flex items-start gap-3',
        r.disponible ? 'border-ink-100' : 'border-ink-100 bg-ink-50/40'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1',
          r.disponible
            ? 'bg-gold-pale text-gold-dark ring-gold/30'
            : 'bg-ink-100 text-ink-400 ring-ink-200'
        )}
      >
        {r.disponible ? (
          <Sparkles className="h-5 w-5" aria-hidden />
        ) : (
          <EyeOff className="h-5 w-5" aria-hidden />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={cn(
              'font-display text-[0.98rem] font-bold leading-tight truncate',
              r.disponible ? 'text-navy' : 'text-ink-500'
            )}
          >
            {r.nom}
          </p>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full text-[0.7rem] font-bold px-2 py-0.5 shrink-0',
              r.disponible
                ? 'bg-navy text-white'
                : 'bg-ink-200 text-ink-500'
            )}
          >
            <Coins className="h-3 w-3" aria-hidden />
            {r.pointsRequis} pts
          </span>
        </div>
        {r.description && (
          <p
            className={cn(
              'text-[0.78rem] mt-1 leading-snug',
              r.disponible ? 'text-ink-600' : 'text-ink-400'
            )}
          >
            {r.description}
          </p>
        )}
        {!r.disponible && (
          <p className="text-[0.7rem] text-ink-400 mt-1 italic">
            Masquée du catalogue des élèves.
          </p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={r.disponible}
          aria-label={r.disponible ? 'Masquer la récompense' : 'Rendre disponible'}
          onClick={onToggleDisponible}
          disabled={toggling}
          title={r.disponible ? 'Disponible — cliquez pour masquer' : 'Masquée — cliquez pour rendre disponible'}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
            r.disponible ? 'bg-success' : 'bg-ink-200',
            toggling && 'opacity-60'
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              r.disponible ? 'translate-x-[22px]' : 'translate-x-[2px]'
            )}
          />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Modifier ${r.nom}`}
          className="flex items-center justify-center w-9 h-9 rounded-md text-ink-500 hover:bg-ink-100 hover:text-navy transition-colors"
        >
          <Edit3 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Supprimer ${r.nom}`}
          className="flex items-center justify-center w-9 h-9 rounded-md text-ink-500 hover:bg-danger-bg hover:text-danger transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </motion.div>
  )
}

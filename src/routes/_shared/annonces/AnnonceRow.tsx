/**
 * RT-SC · Shared annonce row + priority badge.
 *
 * Used by admin list, prof list, and consumer inbox modal. Keeps
 * the row visual consistent across surfaces.
 */

import {
  AlertCircle, AlertTriangle, Info, Users, Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useClasses } from '@/hooks/useClasses'
import type { Annonce, AnnoncePriority } from '@/types/models'

// ─── Row ────────────────────────────────────────────────────

export function AnnonceRow({
  annonce,
  onOpen,
}: {
  annonce: Annonce
  onOpen: () => void
}) {
  const { data: classes = [] } = useClasses()
  const scopeSummary = makeScopeSummary(annonce, classes)
  const dateStr = makeDateString(annonce)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white rounded-lg border-[1.5px] border-ink-100 px-4 py-3 hover:border-navy transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h4 className="font-display text-[1rem] font-bold text-navy leading-snug flex-1 min-w-0 truncate">
          {annonce.title}
        </h4>
        <PriorityBadge priority={annonce.priority} />
      </div>
      <div className="flex items-center gap-2 text-[0.72rem] text-ink-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          {annonce.scope.kind === 'school' ? (
            <Building2 className="h-3 w-3" aria-hidden />
          ) : (
            <Users className="h-3 w-3" aria-hidden />
          )}
          {scopeSummary}
        </span>
        <span className="text-ink-300">·</span>
        <span>{dateStr}</span>
        {annonce.createdByName && (
          <>
            <span className="text-ink-300">·</span>
            <span className="truncate">par {annonce.createdByName}</span>
          </>
        )}
      </div>
    </button>
  )
}

// ─── Priority badge ─────────────────────────────────────────

export function PriorityBadge({ priority }: { priority: AnnoncePriority }) {
  if (priority === 'urgent') {
    return (
      <Badge
        variant="danger"
        size="sm"
        leadingIcon={<AlertTriangle className="h-3 w-3" />}
      >
        Urgent
      </Badge>
    )
  }
  if (priority === 'important') {
    return (
      <Badge
        variant="warning"
        size="sm"
        leadingIcon={<AlertCircle className="h-3 w-3" />}
      >
        Important
      </Badge>
    )
  }
  return (
    <Badge variant="neutral" size="sm" leadingIcon={<Info className="h-3 w-3" />}>
      Info
    </Badge>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function makeScopeSummary(
  annonce: Annonce,
  allClasses: { id: string; niveau?: string; serie?: string | null }[]
): string {
  if (annonce.scope.kind === 'school') return "Toute l'école"
  const ids = annonce.scope.classeIds
  if (ids.length === 0) return 'Aucune classe'
  if (ids.length === 1) {
    const c = allClasses.find((x) => x.id === ids[0])
    if (!c) return '1 classe'
    // Light label since the caller only gives us niveau + serie (not cycle/salle).
    // Full nomClasse() is used elsewhere where the entire Classe is in scope.
    return `${c.niveau ?? ''}${c.serie ? ` ${c.serie}` : ''}`.trim() || '1 classe'
  }
  return `${ids.length} classes`
}

function makeDateString(annonce: Annonce): string {
  if (!annonce.createdAt) return '—'
  try {
    const d = annonce.createdAt.toDate()
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

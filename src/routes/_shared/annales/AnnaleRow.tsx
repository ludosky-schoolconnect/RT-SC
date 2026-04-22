/**
 * RT-SC · Shared annale row.
 *
 * Visual card used in admin list, prof list, and eleve list. Shows
 * title + matiere/classe + date + uploader. Two actions surface:
 *
 *   - "Sujet" button → opens the main Google Drive link
 *   - "Corrigé" button → opens the corrigé link (only if present)
 *
 * For admin/prof the row also accepts `onEdit` / `onDelete` callbacks
 * to render the management controls. Eleves just see the two Drive
 * link buttons.
 */

import {
  ExternalLink,
  CheckCircle2,
  Pencil,
  Trash2,
  BookOpenCheck,
  GraduationCap,
  Shield,
} from 'lucide-react'
import { formatDateAjout } from '@/hooks/useAnnales'
import { cn } from '@/lib/cn'
import type { Annale } from '@/types/models'

interface Props {
  annale: Annale
  /** If provided, renders edit button. Admin/prof only. */
  onEdit?: () => void
  /** If provided, renders delete button. Admin/prof only. */
  onDelete?: () => void
  /** Compact mode (tighter padding, smaller fonts) for dense lists */
  compact?: boolean
}

export function AnnaleRow({ annale, onEdit, onDelete, compact = false }: Props) {
  const hasCorrige = Boolean(annale.corrige?.trim())
  const dateStr = formatDateAjout(annale.dateAjout)

  return (
    <div
      className={cn(
        'bg-white rounded-lg border-[1.5px] border-ink-100',
        compact ? 'px-3.5 py-3' : 'px-4 py-3.5'
      )}
    >
      {/* Title + matiere/classe badges */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h4
            className={cn(
              'font-display font-bold text-navy leading-snug',
              compact ? 'text-[0.95rem]' : 'text-[1rem]'
            )}
          >
            {annale.titre}
          </h4>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-navy bg-info-bg px-2 py-0.5 rounded-md">
              {annale.matiere}
            </span>
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-gold-dark bg-gold-pale px-2 py-0.5 rounded-md">
              <GraduationCap className="h-3 w-3" aria-hidden />
              {annale.classe}
            </span>
          </div>
        </div>

        {/* Admin/prof controls */}
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Modifier"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-info-bg hover:text-navy transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Supprimer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-danger-bg hover:text-danger transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action buttons (Sujet + optional Corrigé) */}
      <div className="flex items-center gap-2 mt-2.5">
        <a
          href={annale.lien}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-navy text-white hover:bg-navy-light transition-colors px-3 py-2 text-[0.8rem] font-semibold min-h-[2.25rem]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Sujet
        </a>
        {hasCorrige && (
          <a
            href={annale.corrige}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-success-bg text-success-dark border border-success/30 hover:bg-success/15 transition-colors px-3 py-2 text-[0.8rem] font-semibold min-h-[2.25rem]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Corrigé
          </a>
        )}
      </div>

      {/* Footer meta — date + uploader */}
      <div className="flex items-center gap-1.5 mt-2.5 text-[0.68rem] text-ink-400">
        <BookOpenCheck className="h-3 w-3 shrink-0" aria-hidden />
        <span>{dateStr}</span>
        {annale.ajoutePar && (
          <>
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center gap-1 truncate">
              {annale.ajouteParRole === 'admin' && (
                <Shield className="h-3 w-3 text-gold-dark shrink-0" aria-hidden />
              )}
              par {annale.ajoutePar}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

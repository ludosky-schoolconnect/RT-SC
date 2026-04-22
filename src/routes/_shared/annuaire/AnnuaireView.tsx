/**
 * RT-SC · Annuaire — browse + search view.
 *
 * Shared between the parent-facing modal and the admin moderation
 * tab. Renders a searchable list of parent profiles with their
 * profession, optional company, and phone — plus a "Copier le
 * numéro" action so the viewer can reach out via WhatsApp/call.
 *
 * The list is already expiry-filtered by useAnnuaire. On top we
 * offer:
 *   - Text search across nom / profession / entreprise
 *   - Filter by classe (useful for parents looking for classmates'
 *     families)
 *
 * Admin mode: shows a delete button on each card, guarded by a
 * confirm dialog — lets the principal take down bad-actor listings.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Briefcase,
  Search,
  Phone,
  Copy,
  Check,
  Trash2,
  Users,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAnnuaire, useDeleteAnnuaireEntry, formatTelDisplay } from '@/hooks/useAnnuaire'
import { useClasses } from '@/hooks/useClasses'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { cn } from '@/lib/cn'
import type { AnnuaireParentEntry } from '@/hooks/useAnnuaire'

interface Props {
  /** Admin-mode shows the delete button on each card */
  adminMode?: boolean
}

export function AnnuaireView({ adminMode = false }: Props) {
  const { data = [], isLoading } = useAnnuaire()
  const { data: classes = [] } = useClasses()
  const [search, setSearch] = useState('')
  const [classeFilter, setClasseFilter] = useState<string>('')

  const classeById = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes]
  )

  // Filter + sort
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return data.filter((e) => {
      if (classeFilter && e.classeId !== classeFilter) return false
      if (!needle) return true
      return (
        e.nom.toLowerCase().includes(needle) ||
        e.profession.toLowerCase().includes(needle) ||
        (e.entreprise ?? '').toLowerCase().includes(needle)
      )
    })
  }, [data, search, classeFilter])

  // Build classe options (only ones that actually have entries)
  const classeOptions = useMemo(() => {
    const used = new Set(data.map((e) => e.classeId))
    return classes.filter((c) => used.has(c.id))
  }, [data, classes])

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search + classe filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un parent, une profession…"
            className="pl-9"
          />
        </div>

        {classeOptions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
            <FilterChip
              active={classeFilter === ''}
              onClick={() => setClasseFilter('')}
            >
              Toutes
            </FilterChip>
            {classeOptions.map((c) => (
              <FilterChip
                key={c.id}
                active={classeFilter === c.id}
                onClick={() => setClasseFilter(c.id)}
              >
                {c.niveau}
                {c.serie ? ` ${c.serie}` : ''} {c.salle}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-[0.72rem] text-ink-500 px-1">
        {filtered.length} parent{filtered.length !== 1 ? 's' : ''}
        {data.length > filtered.length && ` · ${data.length} au total`}
      </p>

      {/* List */}
      {data.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Annuaire vide"
          description="Soyez le premier à rejoindre l'annuaire pour aider d'autres parents à vous contacter."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Aucun résultat"
          description="Essayez un autre mot-clé ou retirez le filtre de classe."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015, duration: 0.18 }}
            >
              <ParentCard
                entry={e}
                classeLabel={classeLabelFor(classeById.get(e.classeId))}
                adminMode={adminMode}
              />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

function classeLabelFor(
  c: { niveau: string; serie?: string | null; salle: string } | undefined
): string {
  if (!c) return '—'
  return `${c.niveau}${c.serie ? ` ${c.serie}` : ''} ${c.salle}`
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full font-bold transition-all min-h-[34px] border-[1.5px] px-3 text-[0.78rem]',
        active
          ? 'bg-navy text-white border-navy shadow-[0_2px_6px_-2px_rgba(11,37,69,0.3)]'
          : 'bg-white text-ink-700 border-ink-200 hover:border-navy/40'
      )}
    >
      {children}
    </button>
  )
}

// ─── Parent card ─────────────────────────────────────────────

function ParentCard({
  entry,
  classeLabel,
  adminMode,
}: {
  entry: AnnuaireParentEntry
  classeLabel: string
  adminMode: boolean
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const del = useDeleteAnnuaireEntry()
  const [copied, setCopied] = useState(false)

  async function handleCopyTel() {
    try {
      await navigator.clipboard.writeText(entry.tel)
      setCopied(true)
      toast.success('Numéro copié')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Copie impossible')
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Retirer ce parent ?',
      message: `La fiche de ${entry.nom} sera définitivement supprimée de l'annuaire.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await del.mutateAsync(entry.id)
      toast.success('Parent retiré')
    } catch {
      toast.error('Suppression impossible')
    }
  }

  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-dark ring-1 ring-gold/30">
          <Briefcase className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] font-bold text-navy leading-tight truncate">
            {entry.nom}
          </p>
          <p className="text-[0.8rem] text-ink-700 mt-0.5 leading-snug truncate">
            {entry.profession}
            {entry.entreprise && (
              <span className="text-ink-500"> · {entry.entreprise}</span>
            )}
          </p>
          <p className="text-[0.7rem] text-ink-500 mt-0.5">
            Parent d'un élève de {classeLabel}
          </p>
        </div>
        {adminMode && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.isPending}
            className="shrink-0 p-2 rounded-md text-ink-400 hover:text-danger hover:bg-danger-bg/40 transition-colors"
            aria-label="Retirer ce parent"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Phone row — copy-to-clipboard + tel link */}
      <div className="mt-2.5 flex items-center gap-2 pt-2.5 border-t border-ink-100">
        <Phone className="h-3.5 w-3.5 text-ink-400 shrink-0" aria-hidden />
        <a
          href={`tel:${entry.tel}`}
          className="font-mono text-[0.82rem] font-semibold text-navy hover:underline"
        >
          {formatTelDisplay(entry.tel)}
        </a>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCopyTel}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.72rem] font-bold text-navy hover:bg-navy/10 transition-colors"
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

/**
 * RT-SC · Plus menu — overflow surface for secondary tabs.
 *
 * Used by dashboards that have more surfaces than fit in the bottom
 * nav (mobile) or would clutter the top nav (desktop). Renders as a
 * grid of large tap targets with icon + label + optional subtitle.
 *
 * When a user taps an item:
 *   1. The page transitions to the selected secondary surface (held in
 *      parent component state)
 *   2. A back-arrow appears on that surface to return to Plus
 *
 * Used by the Admin dashboard for: Emploi, Annonces, Année, Finances.
 * Prof's existing Plus tab uses a different shape (logout + misc) — we
 * don't touch it here.
 */

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { cn } from '@/lib/cn'

export interface PlusMenuItem {
  id: string
  label: string
  description?: string
  icon: ReactNode
  /** Optional accent color class e.g. 'text-navy', 'text-gold-dark' */
  tone?: string
}

interface Props {
  title?: string
  subtitle?: string
  items: PlusMenuItem[]
  onSelect: (id: string) => void
}

export function PlusMenu({
  title = 'Plus',
  subtitle = 'Autres outils et paramètres',
  items,
  onSelect,
}: Props) {
  return (
    <Section>
      <SectionHeader title={title} description={subtitle} />
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group w-full text-left rounded-lg border border-ink-100 bg-white p-4 shadow-sm hover:border-navy/30 hover:shadow-md transition-all flex items-center gap-3 min-h-touch"
          >
            <div
              className={cn(
                'shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-navy/8 ring-1 ring-navy/20 group-hover:bg-navy group-hover:text-white transition-colors',
                item.tone ?? 'text-navy'
              )}
            >
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-display font-bold text-[1rem] text-navy leading-tight">
                {item.label}
              </h4>
              {item.description && (
                <p className="text-[0.76rem] text-ink-500 mt-0.5 truncate">
                  {item.description}
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-ink-300 group-hover:text-navy transition-colors shrink-0" aria-hidden />
          </button>
        ))}
      </div>
    </Section>
  )
}

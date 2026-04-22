/**
 * RT-SC · Civisme sub-tab segmented nav.
 *
 * Renders the in-tab section switcher for the admin Civisme module.
 * Designed to grow as Phase 2 (Quêtes) and Phase 3 (Réclamations,
 * Incidents) ship — the consumer just passes a list of sections.
 *
 * Visually: a horizontally-scrollable pill bar, sticky-friendly,
 * mobile-first. Active pill is navy-filled; inactive pills are
 * outlined. Sub-counts (e.g. "3 en attente") render as small
 * trailing badges.
 */

import { cn } from '@/lib/cn'

export interface CivismeSubNavItem<TId extends string = string> {
  id: TId
  label: string
  /** Optional trailing count badge — e.g. pending validations count */
  badge?: number
  /** Optional badge tone — defaults to neutral; use 'attention' for urgent */
  badgeTone?: 'neutral' | 'attention'
}

interface Props<TId extends string> {
  items: CivismeSubNavItem<TId>[]
  active: TId
  onChange: (id: TId) => void
  className?: string
}

export function CivismeSubNav<TId extends string>({
  items,
  active,
  onChange,
  className,
}: Props<TId>) {
  return (
    <div
      role="tablist"
      aria-label="Sections du civisme"
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1',
        'scrollbar-thin',
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.82rem] font-bold transition-all',
              'border-[1.5px] min-h-[40px]',
              isActive
                ? 'bg-navy text-white border-navy shadow-[0_2px_8px_-2px_rgba(11,37,69,0.25)]'
                : 'bg-white text-ink-700 border-ink-200 hover:border-navy/30 hover:text-navy'
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full text-[0.62rem] font-black px-1.5 min-w-[18px] h-[18px]',
                  isActive
                    ? 'bg-white/20 text-white'
                    : item.badgeTone === 'attention'
                      ? 'bg-danger text-white'
                      : 'bg-ink-100 text-ink-700'
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

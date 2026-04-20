/**
 * RT-SC · Tabs
 *
 * Horizontal scrollable tab bar with a gold underline that slides smoothly
 * between active items via Framer Motion `layoutId`.
 *
 * Mobile-first: scrolls horizontally on overflow, scrollbar hidden.
 *
 * Each tab can have an icon + label.
 */

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'flex bg-white border-b border-ink-100 overflow-x-auto sticky top-0 z-30 shadow-xs',
        '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 flex-1 min-w-[72px] px-3 py-3',
              'text-[0.7rem] font-medium tracking-wide min-h-[56px]',
              'transition-colors duration-150 ease-out-soft',
              active ? 'text-navy font-semibold' : 'text-ink-400 hover:text-ink-600'
            )}
          >
            {item.icon && (
              <span className={cn('h-5 w-5', active && 'text-navy')} aria-hidden>
                {item.icon}
              </span>
            )}
            <span className="whitespace-nowrap">{item.label}</span>
            {active && (
              <motion.span
                layoutId="rt-sc-tab-indicator"
                className="absolute inset-x-2 bottom-0 h-[2.5px] bg-gold rounded-t-full"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

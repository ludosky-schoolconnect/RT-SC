import type { ReactNode } from 'react'
import { Shield } from 'lucide-react'

interface Props {
  subtitle?: string
  rightSlot?: ReactNode
  children: ReactNode
}

/**
 * Common app frame — navy branded header + centered content area.
 * Matches RT-SC's aesthetic but tweaked for the vendor context (gold
 * "Command Center" kicker to signal this is an internal tool, not a
 * school-facing page).
 */
export function AppShell({ subtitle, rightSlot, children }: Props) {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header
        className="bg-navy text-white sticky top-0 z-20"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 h-[68px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/15 border border-gold/30">
              <Shield className="h-4 w-4 text-gold-light" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-gold-light/70 leading-none font-semibold">
                SchoolConnect
              </p>
              <p className="font-display text-[0.95rem] font-semibold leading-tight mt-0.5 truncate">
                {subtitle ?? 'Command Center'}
              </p>
            </div>
          </div>
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[0.7rem] text-ink-400">
        Outil interne vendeur · Accès restreint
      </footer>
    </div>
  )
}

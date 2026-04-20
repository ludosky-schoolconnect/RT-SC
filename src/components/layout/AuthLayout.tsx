/**
 * RT-SC · AuthLayout
 *
 * Shared layout for auth screens (admin login, prof auth, élève login, etc.).
 * Provides a consistent off-white background with optional back button,
 * brand mark, and centered content.
 */

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BackButton } from '@/components/ui/BackButton'
import { cn } from '@/lib/cn'

interface AuthLayoutProps {
  /** Show back button (defaults true). Set false on the welcome screen. */
  back?: boolean
  /** Where back button navigates if no history (default '/welcome') */
  backFallback?: string
  /** Optional kicker shown above the title */
  kicker?: string
  /** Main display title */
  title: string
  /** Supporting line under the title */
  subtitle?: string
  className?: string
  children: ReactNode
}

export function AuthLayout({
  back = true,
  backFallback = '/welcome',
  kicker,
  title,
  subtitle,
  className,
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      <div className="w-full max-w-md mx-auto px-5 pt-5 pb-12 flex-1 flex flex-col">
        {back && (
          <div className="mb-2">
            <BackButton fallback={backFallback} />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className={cn('flex-1 flex flex-col', className)}
        >
          <header className="text-center mb-8 mt-2">
            {kicker && (
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
                {kicker}
              </p>
            )}
            <h1 className="font-display text-3xl font-bold text-navy tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-[0.9375rem] text-ink-600 leading-relaxed">
                {subtitle}
              </p>
            )}
          </header>

          {children}
        </motion.div>
      </div>
    </div>
  )
}

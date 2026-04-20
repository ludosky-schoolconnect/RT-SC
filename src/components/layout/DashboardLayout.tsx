/**
 * RT-SC · DashboardLayout (adaptive).
 *
 * Shared shell for admin / prof / élève dashboards.
 *
 * Navigation adapts to screen size with pure CSS:
 *   - < 768px  (phone)         → bottom navigation bar (icons + labels)
 *   - ≥ 768px  (tablet/desktop)→ horizontal tabs under the header
 *
 * Both presentations share the same activeTab state (URL-driven via
 * ?tab=...). Refreshing keeps you on the same tab; back/forward work.
 *
 * Features:
 *   - Sticky navy header with brand mark, school name, admin avatar dropdown
 *   - Logout via confirm dialog
 *   - Animated tab transitions in the content area
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { LogOut, ChevronDown, Building2 } from 'lucide-react'
import { auth } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'
import { cn } from '@/lib/cn'

export interface DashboardTab {
  id: string
  label: string
  icon: ReactNode
}

interface DashboardLayoutProps {
  /** Role label shown above user name (e.g. "Administration") */
  roleLabel: string
  /** Tabs to render */
  tabs: DashboardTab[]
  /** Default tab id when none in URL */
  defaultTab: string
  /** Render tab content given the active tab id */
  renderTab: (activeTab: string) => ReactNode
  /** Optional school name shown in header */
  schoolName?: string
}

export function DashboardLayout({
  roleLabel,
  tabs,
  defaultTab,
  renderTab,
  schoolName,
}: DashboardLayoutProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const profil = useAuthStore((s) => s.profil)
  const eleveSession = useAuthStore((s) => s.eleveSession)
  const parentSession = useAuthStore((s) => s.parentSession)
  const role = useAuthStore((s) => s.role)
  const reset = useAuthStore((s) => s.reset)

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? defaultTab

  function setTab(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
    // On mobile, scroll to top when switching tabs (long lists left scrolled
    // create the impression that the new tab is broken)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Derive displayName from the ACTIVE role so session leaks (e.g. a prof
  // who logged in earlier then hit the parent portal without logging out)
  // don't bleed an irrelevant name into the header. Parents don't have
  // their own name in the session (auth is by child passkey) so we show
  // the active child's name instead.
  const displayName = (() => {
    if (role === 'admin' || role === 'prof') return profil?.nom ?? '—'
    if (role === 'eleve') return eleveSession?.nom ?? '—'
    if (role === 'parent' && parentSession) {
      const active = parentSession.children[parentSession.activeIndex]
      return active?.nom ?? 'Parent'
    }
    return '—'
  })()
  const initial = displayName.charAt(0).toUpperCase()

  async function handleLogout() {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message: "Vous reviendrez à l'écran de bienvenue.",
      confirmLabel: 'Se déconnecter',
      cancelLabel: 'Annuler',
      variant: 'warning',
    })
    if (!ok) return

    try {
      await signOut(auth)
    } catch {
      // ignore — local reset is what matters
    }
    reset()
    toast.info('Déconnexion réussie.')
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      <DashHeader
        roleLabel={roleLabel}
        displayName={displayName}
        initial={initial}
        schoolName={schoolName}
        onLogout={handleLogout}
      />

      {/* Top tabs — desktop / tablet only */}
      <DesktopTabs tabs={tabs} activeTab={activeTab} onChange={setTab} />

      <main
        className={cn(
          'flex-1 max-w-5xl mx-auto w-full px-4 py-5',
          // Padding bottom so content isn't hidden behind the mobile bottom nav
          'pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-8'
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorBoundary label={`Tab:${activeTab}`}>
              {renderTab(activeTab)}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav — mobile only */}
      <MobileBottomNav tabs={tabs} activeTab={activeTab} onChange={setTab} />
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

interface DashHeaderProps {
  roleLabel: string
  displayName: string
  initial: string
  schoolName?: string
  onLogout: () => void
}

function DashHeader({
  roleLabel,
  displayName,
  initial,
  schoolName,
  onLogout,
}: DashHeaderProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <header
      className="sticky top-0 z-40 bg-navy text-white border-b border-white/5"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-[68px] flex items-center justify-between gap-3">
        {/* Brand + school */}
        <div className="flex items-center gap-3 min-w-0">
          <SchoolConnectLogo size={36} animate={false} />
          <div className="min-w-0">
            <p className="text-[0.65rem] uppercase tracking-[0.15em] text-white/45 leading-none">
              SchoolConnect
            </p>
            {schoolName ? (
              <p className="font-display text-[0.95rem] font-semibold leading-tight truncate flex items-center gap-1.5 mt-0.5 max-w-[170px] sm:max-w-none">
                <Building2 className="h-3.5 w-3.5 text-gold-light shrink-0" aria-hidden />
                <span className="truncate">{schoolName}</span>
              </p>
            ) : (
              <p className="font-display text-[0.95rem] font-semibold leading-tight mt-0.5">
                {roleLabel}
              </p>
            )}
          </div>
        </div>

        {/* User dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 pr-2 pl-1 py-1 rounded-md hover:bg-white/[0.08] transition-colors min-h-touch"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 border border-gold/30 font-display font-bold text-gold-light text-sm">
              {initial}
            </div>
            <div className="text-left hidden sm:block min-w-0">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/45 leading-none">
                {roleLabel}
              </p>
              <p className="text-[0.85rem] font-semibold leading-tight truncate max-w-[140px]">
                {displayName.split(' ')[0]}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-white/50 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-60 rounded-md bg-white text-ink-800 shadow-xl border border-ink-100 overflow-hidden"
                role="menu"
              >
                <div className="px-4 py-3 border-b border-ink-100">
                  <p className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-400">
                    {roleLabel}
                  </p>
                  <p className="font-display text-[0.95rem] font-semibold text-navy mt-0.5 truncate">
                    {displayName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onLogout()
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[0.875rem] text-ink-800 hover:bg-ink-50 transition-colors min-h-touch"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4 text-ink-400" aria-hidden />
                  Se déconnecter
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

// ─── Top tabs (desktop) ─────────────────────────────────────

interface NavProps {
  tabs: DashboardTab[]
  activeTab: string
  onChange: (id: string) => void
}

function DesktopTabs({ tabs, activeTab, onChange }: NavProps) {
  return (
    <div className="hidden md:block bg-white border-b border-ink-100 sticky top-[68px] z-30 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 flex">
        {tabs.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                'relative inline-flex items-center gap-2 px-4 py-3.5 text-[0.875rem] font-semibold tracking-tight',
                'transition-colors duration-150 ease-out-soft min-h-touch',
                active ? 'text-navy' : 'text-ink-400 hover:text-ink-600'
              )}
            >
              <span className={cn('h-4 w-4', active && 'text-navy')} aria-hidden>
                {t.icon}
              </span>
              {t.label}
              {active && (
                <motion.span
                  layoutId="rt-sc-desktop-tab-indicator"
                  className="absolute inset-x-2 bottom-0 h-[2.5px] bg-gold rounded-t-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Bottom nav (mobile) ────────────────────────────────────

function MobileBottomNav({ tabs, activeTab, onChange }: NavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink-100 shadow-[0_-4px_20px_rgba(11,37,69,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch">
        {tabs.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                'relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px]',
                'transition-colors duration-150',
                active ? 'text-navy' : 'text-ink-400'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {/* Active indicator pill behind icon */}
              {active && (
                <motion.span
                  layoutId="rt-sc-mobile-nav-pill"
                  className="absolute top-1.5 h-7 w-12 rounded-full bg-info-bg"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 h-5 w-5 transition-transform',
                  active ? 'scale-100' : 'scale-95'
                )}
                aria-hidden
              >
                {t.icon}
              </span>
              <span
                className={cn(
                  'relative z-10 text-[0.65rem] tracking-wide leading-none',
                  active ? 'font-bold' : 'font-medium'
                )}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

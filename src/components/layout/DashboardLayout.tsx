/**
 * RT-SC · DashboardLayout (adaptive + responsive overflow).
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
 * RESPONSIVE OVERFLOW (Phase 6e):
 *   Callers pass a SINGLE flat `tabs` array. The layout measures the
 *   available nav width and decides how many tabs fit directly. The
 *   rest collapse into a "Plus" button whose dropdown lists them.
 *
 *   On a wide desktop, all 8 admin tabs may fit directly — no Plus.
 *   On a narrow tablet, maybe 5 fit + 3 overflow → Plus appears with
 *   those 3. On mobile, the first 4 tabs always go to the bottom nav
 *   and the rest go to Plus (phones can't afford the desktop layout's
 *   measurement games, and hard-coding 4 is a predictable UX).
 *
 *   When the active tab is in the overflow bucket, the Plus button
 *   itself renders as "active" so the user always sees feedback for
 *   where they are.
 *
 * Features:
 *   - Sticky navy header with brand mark, school name, admin avatar dropdown
 *   - Logout via confirm dialog
 *   - Animated tab transitions in the content area
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { LogOut, ChevronDown, Building2, MoreHorizontal, X, Settings as SettingsIcon } from 'lucide-react'
import { auth } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'
import { useDismissibleLayer } from '@/components/ui/useDismissibleLayer'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { SubscriptionWarningBanner } from './SubscriptionWarningBanner'
import { cn } from '@/lib/cn'
import { useOverflowTabs } from './useOverflowTabs'

export interface DashboardTab {
  id: string
  label: string
  icon: ReactNode
}

interface DashboardLayoutProps {
  /** Role label shown above user name (e.g. "Administration") */
  roleLabel: string
  /**
   * Flat list of ALL tabs. The layout chooses how many are visible
   * directly vs hidden in the Plus overflow based on available width
   * (desktop) or a fixed threshold (mobile).
   */
  tabs: DashboardTab[]
  /** Default tab id when none in URL */
  defaultTab: string
  /** Render tab content given the active tab id */
  renderTab: (activeTab: string) => ReactNode
  /** Optional school name shown in header */
  schoolName?: string
  /**
   * Max tabs to show directly on mobile before overflow. Defaults to
   * 4 — enough for 5-slot thumb-reach nav (4 + Plus). Callers can
   * raise to 5 if icons fit comfortably without labels truncating.
   */
  mobileDirectTabs?: number
  /**
   * Optional additional banner rendered above tab content, below the
   * standard SubscriptionWarningBanner. The render function receives
   * a setTab callback so banners can programmatically switch tabs
   * (e.g. "Aller à Année" from the rollover nag).
   */
  extraBanner?: (setTab: (tabId: string) => void) => ReactNode
}

export function DashboardLayout({
  roleLabel,
  tabs,
  defaultTab,
  renderTab,
  schoolName,
  mobileDirectTabs = 4,
  extraBanner,
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
    if (role === 'admin' || role === 'prof' || role === 'caissier') return profil?.nom ?? '—'
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
        {/* Admin-only warning banner — renders null for non-admins and
            outside the warning/grace windows. Sits ABOVE tab content so
            it's always visible regardless of which tab is active. */}
        <SubscriptionWarningBanner />

        {/* Caller-supplied extra banner (e.g. rollover-in-progress
            nag). Like the subscription banner, it sits above tab
            content. Receives setTab so the banner can jump tabs. */}
        {extraBanner?.(setTab)}

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
      <MobileBottomNav
        tabs={tabs}
        activeTab={activeTab}
        onChange={setTab}
        directCount={mobileDirectTabs}
      />
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Android back button + Escape close the dropdown (not navigate away).
  useDismissibleLayer({ open, onClose: () => setOpen(false) })

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
                    setSettingsOpen(true)
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[0.875rem] text-ink-800 hover:bg-ink-50 transition-colors min-h-touch border-b border-ink-100"
                  role="menuitem"
                >
                  <SettingsIcon className="h-4 w-4 text-ink-400" aria-hidden />
                  Préférences
                </button>
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

      {/* Settings modal — shared across all roles */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </header>
  )
}

// ─── Top tabs (desktop) — responsive overflow ───────────────
//
// Renders tabs directly while they fit. When they don't, collapses
// the overflow into a "Plus" button whose menu lists the hidden
// tabs. Uses two DOM layers:
//
//   1. Hidden measurement layer: ALL tabs rendered offscreen at
//      their natural width. Lets us know each tab's width without
//      affecting layout.
//   2. Visible layer: just the tabs that fit + the Plus button (if
//      any tabs overflow).
//
// ResizeObserver on the container re-runs the measurement on window
// resize, sidebar toggle, or anything else that changes width.

interface NavProps {
  tabs: DashboardTab[]
  activeTab: string
  onChange: (id: string) => void
}

function DesktopTabs({ tabs, activeTab, onChange }: NavProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measurementRef = useRef<HTMLDivElement>(null)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  const { visibleCount, hasOverflow } = useOverflowTabs(
    tabs,
    containerRef,
    measurementRef,
    plusButtonRef
  )

  // Back-button / Escape handling for the desktop overflow dropdown.
  // Ensures Android back tap + browser back closes the dropdown
  // instead of navigating out of the page.
  useDismissibleLayer({
    open: menuOpen,
    onClose: () => setMenuOpen(false),
  })

  const visible = useMemo(() => tabs.slice(0, visibleCount), [tabs, visibleCount])
  const overflow = useMemo(() => tabs.slice(visibleCount), [tabs, visibleCount])

  const activeInOverflow = overflow.some((t) => t.id === activeTab)
  const activeOverflowTab = overflow.find((t) => t.id === activeTab)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // Close menu after picking an overflow tab
  function pickOverflow(id: string) {
    setMenuOpen(false)
    onChange(id)
  }

  return (
    <div className="hidden md:block bg-white border-b border-ink-100 sticky top-[68px] z-30 shadow-xs">
      <div className="max-w-5xl mx-auto px-4">
        {/* Hidden measurement layer — renders ALL tabs so we know
            each one's natural width. visibility:hidden preserves
            layout; position:absolute + pointer-events:none keeps it
            out of the visual + interactive flow. */}
        <div
          ref={measurementRef}
          aria-hidden
          className="flex invisible pointer-events-none absolute"
          style={{ top: -9999, left: 0, height: 0 }}
        >
          {tabs.map((t) => (
            <DesktopTabButton
              key={`m-${t.id}`}
              tab={t}
              active={false}
              onClick={() => {}}
              measuring
            />
          ))}
        </div>

        {/* Visible layer — direct tabs + optional Plus */}
        <div ref={containerRef} className="flex items-stretch">
          {visible.map((t) => {
            const active = t.id === activeTab
            return (
              <DesktopTabButton
                key={t.id}
                tab={t}
                active={active}
                onClick={() => onChange(t.id)}
              />
            )
          })}

          {hasOverflow && (
            <div ref={menuWrapRef} className="relative">
              <button
                ref={plusButtonRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-4 py-3.5 text-[0.875rem] font-semibold tracking-tight',
                  'transition-colors duration-150 ease-out-soft min-h-touch',
                  activeInOverflow ? 'text-navy' : 'text-ink-400 hover:text-ink-600'
                )}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal
                  className={cn('h-4 w-4', activeInOverflow && 'text-navy')}
                  aria-hidden
                />
                {/* When an overflow item is active, show ITS label on
                    the Plus button so the user sees where they are.
                    Otherwise show "Plus" generically. */}
                {activeInOverflow && activeOverflowTab
                  ? activeOverflowTab.label
                  : 'Plus'}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    menuOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
                {activeInOverflow && (
                  <motion.span
                    layoutId="rt-sc-desktop-tab-indicator"
                    className="absolute inset-x-2 bottom-0 h-[2.5px] bg-gold rounded-t-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-64 rounded-md bg-white shadow-xl border border-ink-100 overflow-hidden z-40"
                    role="menu"
                  >
                    {overflow.map((t) => {
                      const active = t.id === activeTab
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => pickOverflow(t.id)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-4 py-3 text-[0.875rem] hover:bg-ink-50 transition-colors min-h-touch',
                            active ? 'text-navy font-semibold bg-info-bg/40' : 'text-ink-800'
                          )}
                          role="menuitem"
                        >
                          <span className="h-4 w-4 shrink-0" aria-hidden>
                            {t.icon}
                          </span>
                          {t.label}
                        </button>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * One tab button. Used both in the real nav and in the hidden
 * measurement layer (pass measuring=true to skip the active
 * indicator which has side effects on layout).
 */
function DesktopTabButton({
  tab,
  active,
  onClick,
  measuring = false,
}: {
  tab: DashboardTab
  active: boolean
  onClick: () => void
  measuring?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-2 px-4 py-3.5 text-[0.875rem] font-semibold tracking-tight whitespace-nowrap',
        'transition-colors duration-150 ease-out-soft min-h-touch',
        active ? 'text-navy' : 'text-ink-400 hover:text-ink-600'
      )}
      tabIndex={measuring ? -1 : 0}
    >
      <span className={cn('h-4 w-4', active && 'text-navy')} aria-hidden>
        {tab.icon}
      </span>
      {tab.label}
      {active && !measuring && (
        <motion.span
          layoutId="rt-sc-desktop-tab-indicator"
          className="absolute inset-x-2 bottom-0 h-[2.5px] bg-gold rounded-t-full"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
    </button>
  )
}

// ─── Bottom nav (mobile) — fixed N + Plus overflow ──────────
//
// Phones don't benefit from measurement-based overflow (tabs must
// be finger-sized, so there's never "extra room"). We pick a fixed
// directCount (default 4) and push anything beyond that into a
// Plus button that opens a sheet listing the hidden tabs.

function MobileBottomNav({
  tabs,
  activeTab,
  onChange,
  directCount,
}: NavProps & { directCount: number }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  // Back-button / Escape handling for the mobile overflow sheet.
  // Without this, tapping the Android back button while the sheet
  // was open would navigate the user out of the dashboard instead
  // of just closing the sheet.
  useDismissibleLayer({
    open: sheetOpen,
    onClose: () => setSheetOpen(false),
  })

  const needsPlus = tabs.length > directCount
  const visible = needsPlus ? tabs.slice(0, directCount) : tabs
  const overflow = needsPlus ? tabs.slice(directCount) : []

  const activeInOverflow = overflow.some((t) => t.id === activeTab)
  const activeOverflowTab = overflow.find((t) => t.id === activeTab)

  function pickOverflow(id: string) {
    setSheetOpen(false)
    onChange(id)
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink-100 shadow-[0_-4px_20px_rgba(11,37,69,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch">
          {visible.map((t) => {
            const active = t.id === activeTab
            return (
              <MobileTabButton
                key={t.id}
                tab={t}
                active={active}
                onClick={() => onChange(t.id)}
              />
            )
          })}

          {needsPlus && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={cn(
                'relative flex-1 flex flex-col items-center justify-center min-h-[64px] gap-1 py-2.5 transition-colors duration-150',
                activeInOverflow ? 'text-navy' : 'text-ink-400'
              )}
              aria-haspopup="menu"
            >
              {activeInOverflow && (
                <motion.span
                  layoutId="rt-sc-mobile-nav-pill"
                  className="absolute top-1.5 h-7 w-12 rounded-full bg-info-bg"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 h-5 w-5 transition-transform',
                  activeInOverflow ? 'scale-100' : 'scale-95'
                )}
                aria-hidden
              >
                <MoreHorizontal className="h-full w-full" />
              </span>
              <span
                className={cn(
                  'relative z-10 tracking-wide leading-none truncate max-w-full px-0.5 text-[0.65rem]',
                  activeInOverflow ? 'font-bold' : 'font-medium'
                )}
              >
                {activeInOverflow && activeOverflowTab ? activeOverflowTab.label : 'Plus'}
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Overflow sheet — mobile only. Slides up from the bottom
          with the overflow tabs as big tap targets. */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-navy/40 z-50"
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              role="menu"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
                <p className="font-display text-[1rem] font-semibold text-navy">
                  Plus d'options
                </p>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-navy transition-colors"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="py-1">
                {overflow.map((t) => {
                  const active = t.id === activeTab
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickOverflow(t.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-[0.9rem] transition-colors min-h-touch',
                        active
                          ? 'text-navy font-semibold bg-info-bg/40'
                          : 'text-ink-800 hover:bg-ink-50'
                      )}
                      role="menuitem"
                    >
                      <span className="h-5 w-5 shrink-0" aria-hidden>
                        {t.icon}
                      </span>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function MobileTabButton({
  tab,
  active,
  onClick,
}: {
  tab: DashboardTab
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex-1 flex flex-col items-center justify-center min-h-[64px] gap-1 py-2.5',
        'transition-colors duration-150',
        active ? 'text-navy' : 'text-ink-400'
      )}
      aria-current={active ? 'page' : undefined}
    >
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
        {tab.icon}
      </span>
      <span
        className={cn(
          'relative z-10 tracking-wide leading-none truncate max-w-full px-0.5 text-[0.65rem]',
          active ? 'font-bold' : 'font-medium'
        )}
      >
        {tab.label}
      </span>
    </button>
  )
}

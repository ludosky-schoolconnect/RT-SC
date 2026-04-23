/**
 * RT-SC · PwaInstallBanner.
 *
 * Custom "Install this app" banner, ported from the vanilla
 * SchoolConnect version. Chrome Android fires `beforeinstallprompt`
 * when its install criteria are met (HTTPS + manifest + SW + some
 * user engagement) and the app isn't already installed; we catch it,
 * suppress Chrome's own mini-infobar via e.preventDefault(), and show
 * our own banner instead.
 *
 * ─── Behavior contract (matches vanilla exactly) ──────────────
 *
 * 1. Banner appears whenever Chrome fires `beforeinstallprompt`.
 *    In practice that's on most page loads where install criteria
 *    are met, so the user sees it every fresh visit until they
 *    install or permanently dismiss in Chrome's own UI.
 *
 * 2. Dismissal via the × button is IN-MEMORY ONLY. No localStorage,
 *    no sessionStorage, no cookies. A page reload re-arms it because
 *    Chrome re-fires `beforeinstallprompt` on load. This is the
 *    same behavior as the vanilla app — the user's "I'll decide
 *    later" stays for the current session only.
 *
 * 3. Tapping "Installer" calls `deferredPrompt.prompt()`, which
 *    pops Chrome's native install confirmation. After that flow
 *    resolves, we hide the banner (Chrome also fires `appinstalled`
 *    if they accepted, which we listen to for the same effect).
 *
 * ─── Why in-memory is fine ────────────────────────────────────
 *
 * Persisting "dismissed" would be more polite, but the trade-off is:
 * - Chrome's beforeinstallprompt already has aggressive built-in
 *   throttling — after 2-3 dismissals via Chrome's native prompt,
 *   Chrome stops firing the event for ~90 days anyway.
 * - Users who DO want to install shouldn't have to hunt for the
 *   browser menu's "Install app" item just because they hit ×
 *   yesterday.
 * - Vanilla SchoolConnect worked this way and users were fine.
 *
 * ─── Platform support ────────────────────────────────────────
 *
 * - Chrome Android: fires `beforeinstallprompt`, banner works
 * - Chrome Desktop: fires it too (since Chrome 76)
 * - Edge Chromium: same as Chrome
 * - Safari iOS: DOES NOT fire beforeinstallprompt; Safari uses its
 *   own "Add to Home Screen" via the share sheet. This component
 *   simply never shows on iOS; that's expected behavior, not a bug.
 * - Firefox: doesn't fire it. Same — banner stays hidden.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'

// Chrome's beforeinstallprompt event — not in lib.dom.d.ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      // Suppress Chrome's default mini-infobar
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    function onInstalled() {
      // User accepted the install (from our prompt, Chrome's menu,
      // or anywhere else). Hide the banner permanently for this session.
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function handleInstall() {
    // Hide the banner immediately so the native dialog is the only
    // thing on screen — same UX as vanilla.
    setVisible(false)
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch (err) {
      // Chrome throws if prompt() is called twice or in the wrong
      // state. Silent — the user can always reload to retry.
      console.warn('[PwaInstallBanner] prompt failed:', err)
    } finally {
      // Chrome invalidates the event after one prompt() call, so
      // we must discard it regardless of outcome.
      setDeferredPrompt(null)
    }
  }

  function handleDismiss() {
    // In-memory only — reload re-arms it via Chrome re-firing
    // beforeinstallprompt.
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] w-[min(340px,90vw)]"
          role="dialog"
          aria-label="Proposition d'installation de l'application"
        >
          <div className="flex items-center justify-between gap-3 bg-white border border-ink-100 rounded-xl shadow-lg px-3 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-gold font-bold shadow-sm">
                S
              </div>
              <div className="min-w-0">
                <p className="font-display text-[0.85rem] font-bold text-navy leading-tight truncate">
                  SchoolConnect
                </p>
                <p className="text-[0.7rem] text-ink-500 leading-tight truncate">
                  Installer l'app
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Fermer"
                className="h-8 w-8 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 active:bg-ink-100 transition-colors"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleInstall}
                className="flex items-center gap-1.5 bg-navy text-gold font-bold text-[0.78rem] px-3 py-1.5 rounded-md shadow-sm hover:bg-navy-700 active:bg-navy-800 transition-colors"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Installer
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

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
 * ─── Platform support ────────────────────────────────────────
 *
 * - Chrome Android/Desktop: fires beforeinstallprompt, banner works
 * - Edge Chromium: same as Chrome
 * - Safari iOS/Firefox: don't fire this event. Banner stays hidden;
 *   users install via browser menu. Expected, not a bug.
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
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    function onInstalled() {
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
    setVisible(false)
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch (err) {
      console.warn('[PwaInstallBanner] prompt failed:', err)
    } finally {
      setDeferredPrompt(null)
    }
  }

  function handleDismiss() {
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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] w-[min(360px,calc(100vw-1rem))]"
          role="dialog"
          aria-label="Proposition d'installation de l'application"
        >
          <div className="flex items-center gap-2 bg-white border border-ink-100 rounded-xl shadow-lg p-2">
            {/* Left: logo + text — min-w-0 + flex-1 means this block
                shrinks when the buttons need space, so the buttons
                are always visible. */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-gold font-display font-bold text-lg shadow-sm">
                S
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[0.85rem] font-bold text-navy leading-tight truncate">
                  SchoolConnect
                </p>
                <p className="text-[0.7rem] text-ink-500 leading-tight truncate">
                  Installer l'app
                </p>
              </div>
            </div>

            {/* Right: action buttons — shrink-0 so they always render,
                fixed height matching flex row, touch-friendly targets. */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Fermer"
                className="h-9 w-9 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 active:bg-ink-100 transition-colors"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleInstall}
                className="flex items-center gap-1.5 bg-navy text-gold font-display font-bold text-[0.78rem] px-3 h-9 rounded-md shadow-sm hover:bg-navy-dark active:opacity-90 transition-all"
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

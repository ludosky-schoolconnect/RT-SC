/**
 * RT-SC · UpdateReadyToast.
 *
 * Watches for a new service worker to become "ready to activate" and
 * surfaces a small dismissible toast prompting the user to refresh.
 *
 * Behavior:
 *   - On app load, vite-plugin-pwa registers the SW and checks for an
 *     update on a polling schedule (20 min) — the `onRegisteredSW`
 *     callback sets up this polling ourselves.
 *   - When the service worker update lifecycle reports "waiting", we
 *     set `needRefresh = true` → this component renders the toast.
 *   - Tap "Actualiser" → `updateServiceWorker(true)` activates the new
 *     SW, which triggers a full page reload with fresh assets.
 *   - The dismissing "X" button closes the toast but does NOT activate
 *     the new SW — it'll reappear on the next natural reload.
 *
 * Copy (agreed with Ludosky): "Actualiser pour charger les dernières
 * modifications" — avoids the "nouvelle version" phrasing that could be
 * misread as an app-store update.
 *
 * This component must be mounted after `<BrowserRouter>` and inside the
 * query provider tree (it doesn't query anything, but colocating with
 * other app-level UI keeps things tidy).
 */

import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Check for a new SW every 20 minutes while the app is open. Cheap
// (a single HEAD request to the sw.js URL) and catches new deploys
// without waiting for the browser's default update check cadence
// (typically 24h).
const UPDATE_CHECK_INTERVAL_MS = 20 * 60 * 1000

export function UpdateReadyToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Periodically poll the network for a newer sw.js. If a new one
      // is shipped to the CDN (e.g. you ran deploy-school.sh), the
      // registration picks it up and moves it to "waiting" — which
      // flips `needRefresh` in this hook.
      setInterval(async () => {
        // Skip if offline — no point asking the browser to fetch
        if (!navigator.onLine) return
        try {
          await registration.update()
        } catch {
          // Swallow — transient network errors shouldn't surface anywhere
        }
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  // Guard against hydration-mismatch flickers on first paint
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-sm"
        >
          <div className="flex items-center gap-3 rounded-lg border-[1.5px] border-navy/20 bg-white px-4 py-3 shadow-lg">
            <RefreshCw className="h-5 w-5 shrink-0 text-navy" aria-hidden />
            <p className="flex-1 text-[0.82rem] leading-snug text-ink-800">
              Actualiser pour charger les dernières modifications.
            </p>
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="shrink-0 rounded-md bg-navy px-3 py-1.5 text-[0.78rem] font-bold text-white transition-colors hover:bg-navy-dark"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              aria-label="Fermer"
              className="shrink-0 rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * RT-SC · OfflineBanner.
 *
 * Tiny strip at the very top of the viewport that appears only when the
 * browser reports it's offline. Uses the native `navigator.onLine` flag
 * plus the `online` / `offline` window events.
 *
 * Copy is intentionally calm: the user isn't broken, they just have to
 * wait a moment. Firestore's own offline persistence (enabled in
 * src/firebase.ts) plus the TanStack Query persister mean most views
 * still work — reads come from the local cache, writes queue until
 * connectivity returns.
 *
 * Placement: mounted high in the tree (main.tsx) so it sits ABOVE any
 * router UI. `fixed top-0` puts it in the safe area; body content isn't
 * pushed down by default (would shift the whole app on every flicker).
 * If that becomes visually awkward we can add a top padding compensator.
 */

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export function OfflineBanner() {
  // Initialize from the current flag — navigator.onLine is defined in all
  // modern browsers. SSR-safe guard in case this somehow runs at build
  // time (it shouldn't in this CSR app, but defensive coding is cheap).
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-[60] bg-warning text-white shadow-sm"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 text-[0.78rem] leading-snug">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">
              Mode hors-ligne — certaines actions seront envoyées quand la
              connexion reviendra.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

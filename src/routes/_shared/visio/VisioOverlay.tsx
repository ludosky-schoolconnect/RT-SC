/**
 * RT-SC · Visio overlay — embeds Jitsi Meet.
 *
 * Full-screen overlay that loads the Jitsi Meet external API from
 * meet.jit.si and joins a deterministic room name. When the user
 * taps Quitter (or the Jitsi UI hang-up), we destroy the API
 * instance and remove the overlay.
 *
 * Room naming: {ECOLE_ID}_{ELEVE_ID} sanitized to alphanumeric +
 * underscore. Both prof/admin (host) and parent (guest) compute the
 * same name from the same inputs, so they land in the same room.
 *
 * No backend required. Jitsi's public server (meet.jit.si) handles
 * all WebRTC signaling + TURN relay for free. It's the same public
 * instance the legacy app used.
 *
 * Props:
 *   - open: render the overlay
 *   - onClose: called when user exits
 *   - roomName: deterministic room id (see buildRoomName below)
 *   - userName: display name shown to other participants
 *   - subject: the topic line shown in the Jitsi interface
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface JitsiMeetExternalAPI {
  dispose: () => void
  addEventListener: (event: string, handler: () => void) => void
}

interface Window {
  JitsiMeetExternalAPI?: new (
    domain: string,
    options: Record<string, unknown>
  ) => JitsiMeetExternalAPI
}

const JITSI_SCRIPT_URL = 'https://meet.jit.si/external_api.js'

/**
 * Load the Jitsi script once; cache the promise so repeated
 * openings don't re-inject the <script> tag.
 */
let jitsiLoadPromise: Promise<void> | null = null

function loadJitsi(): Promise<void> {
  if (jitsiLoadPromise) return jitsiLoadPromise
  jitsiLoadPromise = new Promise((resolve, reject) => {
    const w = window as unknown as Window
    if (w.JitsiMeetExternalAPI) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = JITSI_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      jitsiLoadPromise = null // allow retry
      reject(new Error('Jitsi script failed to load'))
    }
    document.head.appendChild(script)
  })
  return jitsiLoadPromise
}

/**
 * Deterministic room-name builder. Same inputs = same room, across
 * prof/admin host and parent guest. Alphanumeric-only to stay safe
 * for Jitsi's URL slug rules.
 */
export function buildRoomName(ecoleId: string, eleveId: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '')
  return `SchoolConnect_Visio_${clean(ecoleId)}_${clean(eleveId)}`
}

interface Props {
  open: boolean
  onClose: () => void
  roomName: string
  userName: string
  subject: string
}

export function VisioOverlay({
  open,
  onClose,
  roomName,
  userName,
  subject,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<JitsiMeetExternalAPI | null>(null)

  // Boot Jitsi when the overlay opens; tear down on close.
  useEffect(() => {
    if (!open) return

    let cancelled = false
    let api: JitsiMeetExternalAPI | null = null

    async function boot() {
      try {
        await loadJitsi()
        if (cancelled || !containerRef.current) return
        const w = window as unknown as Window
        if (!w.JitsiMeetExternalAPI) return
        api = new w.JitsiMeetExternalAPI('meet.jit.si', {
          roomName,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: { displayName: userName },
          configOverwrite: {
            disableDeepLinking: true,
            prejoinPageEnabled: true,
            subject,
          },
          interfaceConfigOverwrite: {
            SHOW_CHROME_EXTENSION_BANNER: false,
          },
        })
        apiRef.current = api
        // Jitsi fires `readyToClose` when the user hangs up inside
        // the iframe — mirror to onClose so our overlay dismisses.
        api.addEventListener('readyToClose', () => {
          onClose()
        })
      } catch (err) {
        console.error('[VisioOverlay] Jitsi boot failed:', err)
      }
    }
    boot()

    return () => {
      cancelled = true
      try {
        api?.dispose()
      } catch {
        /* ignore */
      }
      apiRef.current = null
    }
  }, [open, roomName, userName, subject, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Visioconférence"
        >
          {/* Top bar with live indicator + exit button */}
          <header className="shrink-0 h-14 px-3 flex items-center justify-between gap-3 bg-navy border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0 text-white">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
              <span className="font-bold text-[0.85rem] truncate">
                En direct ·{' '}
                <span className="text-gold-light truncate">{userName}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-danger text-white font-bold text-[0.82rem] hover:bg-danger-dark transition-colors"
              aria-label="Quitter la visio"
            >
              <X className="h-4 w-4" aria-hidden />
              Quitter
            </button>
          </header>

          {/* Jitsi mounts here */}
          <div ref={containerRef} className="flex-1 w-full bg-black" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

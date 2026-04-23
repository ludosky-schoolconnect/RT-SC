/**
 * RT-SC · InactivityGuard (Session E7).
 *
 * Locks the dashboard after a period of inactivity and forces the
 * user to re-enter their personal code before continuing. Designed
 * for the Bénin teaching context where many profs teach their own
 * children — chronic device proximity means a single shoulder-surf
 * can be repeated daily until the child gets the code.
 *
 * ─── Triggers ────────────────────────────────────────────────
 *
 * Any of these conditions, sustained for INACTIVITY_MS, fires the
 * re-auth modal:
 *
 *   1. IDLE — no touch / scroll / keyboard / mouse activity. Resets
 *      on any of: pointermove, pointerdown, keydown, scroll, wheel,
 *      touchstart.
 *
 *   2. HIDDEN — user switched to another tab or app (document.hidden
 *      = true). Resets on visibilitychange back to visible.
 *
 *   3. OFFLINE — navigator.onLine = false. Resets on the 'online'
 *      event firing.
 *
 * Each trigger has its own timer. Whichever crosses the threshold
 * first locks the screen.
 *
 * ─── Why these three ─────────────────────────────────────────
 *
 * - IDLE catches: prof leaves phone on a desk, walks away
 * - HIDDEN catches: prof switches to WhatsApp / Photos / SMS, hands
 *   phone to child for a game, etc.
 * - OFFLINE catches: prof leaves Wi-Fi range / loses signal, child
 *   has the phone in airplane-mode while exploring; we re-prompt
 *   when network returns
 *
 * ─── How locking works ───────────────────────────────────────
 *
 * On lock: clears the sessionStorage personal-code unlock and
 * dispatches a re-render. PersonnelCodeGate (ancestor in the React
 * tree) detects no unlock and renders its full-page code prompt.
 * No separate modal needed — the gate IS the lock screen.
 *
 * Why not a modal: full-page prompt prevents any peek-through of
 * dashboard data (some classroom snoopers will dismiss a modal
 * if they can see grades behind it). Full takeover is opaque.
 *
 * ─── Sensible defaults ───────────────────────────────────────
 *
 * INACTIVITY_MS = 5 minutes. Long enough not to be annoying for a
 * prof actively reading a long bulletin, short enough that a
 * curious child can't read more than a screen or two.
 *
 * The component does NOT lock if the dashboard isn't visible (e.g.
 * during initial render before useAuth hydrates) — guards via the
 * profil check below.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '@/stores/auth'
import { clearGateUnlock, hasValidUnlock } from '@/lib/profPasskey'

const INACTIVITY_MS = 5 * 60 * 1000 // 5 minutes

interface Props {
  /** Called when one of the inactivity conditions fires the lock.
   *  Parent uses this to force a re-render so PersonnelCodeGate
   *  picks up the cleared sessionStorage. */
  onLock: () => void
}

export function InactivityGuard({ onLock }: Props) {
  const { profil } = useAuth()

  // Only arm guards when there's actually a personnel session in
  // place. Avoids lifecycle work for non-personnel routes that may
  // accidentally include this component.
  const armed = !!profil

  // Latest onLock ref so the effect doesn't tear down on parent
  // re-renders that change the callback identity.
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  useEffect(() => {
    if (!armed) return

    let idleTimer: number | null = null
    let hiddenTimer: number | null = null
    let offlineTimer: number | null = null

    function fireLock(reason: 'idle' | 'hidden' | 'offline') {
      // If we're already unlocked-cleared, no-op.
      if (!hasValidUnlock()) return

      // eslint-disable-next-line no-console
      console.info(`[InactivityGuard] locking (${reason})`)
      clearGateUnlock()
      onLockRef.current()
    }

    function resetIdle() {
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => fireLock('idle'), INACTIVITY_MS)
    }

    function resetHidden() {
      if (hiddenTimer) window.clearTimeout(hiddenTimer)
      hiddenTimer = null
      if (document.hidden) {
        // App went to background — start countdown
        hiddenTimer = window.setTimeout(() => fireLock('hidden'), INACTIVITY_MS)
      }
    }

    function resetOffline() {
      if (offlineTimer) window.clearTimeout(offlineTimer)
      offlineTimer = null
      if (!navigator.onLine) {
        offlineTimer = window.setTimeout(() => fireLock('offline'), INACTIVITY_MS)
      }
    }

    // ─── Activity events for IDLE timer ─────────────────────
    const idleEvents = [
      'pointermove',
      'pointerdown',
      'keydown',
      'scroll',
      'wheel',
      'touchstart',
    ] as const
    for (const ev of idleEvents) {
      window.addEventListener(ev, resetIdle, { passive: true })
    }

    // ─── HIDDEN timer ───────────────────────────────────────
    document.addEventListener('visibilitychange', resetHidden)

    // ─── OFFLINE timer ──────────────────────────────────────
    window.addEventListener('online', resetOffline)
    window.addEventListener('offline', resetOffline)

    // Arm everything on mount
    resetIdle()
    resetHidden()
    resetOffline()

    return () => {
      for (const ev of idleEvents) {
        window.removeEventListener(ev, resetIdle)
      }
      document.removeEventListener('visibilitychange', resetHidden)
      window.removeEventListener('online', resetOffline)
      window.removeEventListener('offline', resetOffline)
      if (idleTimer) window.clearTimeout(idleTimer)
      if (hiddenTimer) window.clearTimeout(hiddenTimer)
      if (offlineTimer) window.clearTimeout(offlineTimer)
    }
  }, [armed])

  // This component renders nothing — it's purely behavioral.
  return null
}

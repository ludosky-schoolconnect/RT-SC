/**
 * RT-SC · SubscriptionGuard.
 *
 * Subscribes once to `ecole/subscription` via onSnapshot.
 * Locks the app when:
 *   - `isManualLock === true`, OR
 *   - `now > deadline + 3 days grace`
 *
 * On lock:
 *   - admin → redirected to /locked (with FedaPay UI)
 *   - prof / élève → redirected to /maintenance
 *   - public visitor → no redirect (still can browse welcome / login)
 *
 * On unlock (true → false transition): full page reload to flush any
 * stale auth state.
 *
 * Special bypass: if URL has `?paid=true`, the guard ignores the lock
 * for 5 seconds (post-payment cache window), then strips the query.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useNavigate, useLocation } from 'react-router-dom'
import { docRef } from '@/firebase'
import { ecoleSubscriptionDoc } from '@/lib/firestore-keys'
import { useAuth } from '@/stores/auth'
import type { SubscriptionDoc } from '@/types/models'

interface Props {
  children: ReactNode
}

const GRACE_MS = 3 * 24 * 60 * 60 * 1000

export function SubscriptionGuard({ children }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useAuth()
  const previousLockState = useRef<boolean | null>(null)

  useEffect(() => {
    // Honor the payment-success bypass for 5 seconds after redirect from FedaPay.
    if (location.search.includes('paid=true')) {
      const t = setTimeout(() => {
        // Strip the query so guard checks resume normally on next render.
        const url = window.location.pathname
        window.history.replaceState(null, '', url)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [location.search])

  useEffect(() => {
    const unsub = onSnapshot(
      docRef(ecoleSubscriptionDoc()),
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data() as SubscriptionDoc

        const deadline = data.deadline?.toDate ? data.deadline.toDate() : null
        const gracedDeadline = deadline ? new Date(deadline.getTime() + GRACE_MS) : new Date()
        const isLocked =
          data.isManualLock === true ||
          (deadline ? new Date() > gracedDeadline : false)

        // Unlock transition → full reload to clear stale state.
        // EXCEPTION: if we're currently on /locked, DON'T reload —
        // LockedPage's own post-payment navigation (navigate to /app
        // with ?paid=true) handles the transition more smoothly. A
        // reload here would race with that navigate and bounce the
        // user back to /locked briefly before they see the success
        // state. Letting LockedPage drive the transition keeps the
        // "Paiement validé !" → dashboard flow clean.
        if (
          previousLockState.current === true &&
          !isLocked &&
          !window.location.pathname.startsWith('/locked')
        ) {
          window.location.reload()
          return
        }
        previousLockState.current = isLocked

        if (!isLocked) return

        // Bypass for the freshly-paid 5s window
        if (window.location.search.includes('paid=true')) return

        // Public visitors keep browsing — they need to be able to log in
        if (!role) return

        if (role === 'admin') {
          navigate('/locked', { replace: true })
        } else {
          navigate('/maintenance', { replace: true })
        }
      },
      (err) => {
        console.warn('[SubscriptionGuard] snapshot error:', err)
      }
    )

    return unsub
  }, [navigate, role])

  return <>{children}</>
}

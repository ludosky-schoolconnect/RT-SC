/**
 * RT-SC · SubscriptionWarningBanner.
 *
 * Shown at the top of the admin dashboard during the 7-day window
 * before the subscription expires. Escalates to red during the 3-day
 * grace period (deadline passed but app not yet locked — "pay NOW").
 *
 * Only visible to admins. Non-admin roles never see it (they'll see
 * MaintenancePage directly if we get to the full lock).
 *
 * Dismissible per-session: admin can tap ✕ to hide until next reload.
 * We intentionally don't persist the dismissal — if they refresh and
 * subscription still hasn't been renewed, they SHOULD see it again.
 * Subscription warnings aren't the kind of thing that should be
 * silenceable long-term.
 *
 * Placement: rendered inside DashboardLayout's main content area,
 * above the active tab. Only on admin dashboard (via role check
 * inside the component itself — it renders null otherwise so it's
 * safe to drop in other layouts without conditionals at the callsite).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X, CreditCard, Clock } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/cn'

export function SubscriptionWarningBanner() {
  const role = useAuthStore((s) => s.role)
  const sub = useSubscription()
  const [dismissed, setDismissed] = useState(false)

  // Only admins see the banner
  if (role !== 'admin') return null
  if (sub.loading) return null
  if (dismissed) return null

  // Only show during warning window OR grace period. Outside those,
  // everything's fine — no banner.
  const showWarning = sub.inWarningWindow
  const showGrace = sub.inGracePeriod
  if (!showWarning && !showGrace) return null

  // If the subscription is actually locked, the guard has already
  // routed us to /locked — this banner should never render then. Be
  // defensive anyway.
  if (sub.isLocked) return null

  const isGrace = showGrace
  const days = sub.daysRemaining ?? 0
  const daysAbs = Math.abs(days)

  const message = isGrace
    ? `Votre abonnement a expiré il y a ${daysAbs} jour${daysAbs > 1 ? 's' : ''}. Renouvelez maintenant avant le verrouillage complet.`
    : `Votre abonnement expire dans ${days} jour${days > 1 ? 's' : ''}. Renouvelez pour éviter l'interruption du service.`

  return (
    <div
      className={cn(
        'rounded-lg border-[1.5px] px-4 py-3 mb-4 flex items-start gap-3',
        isGrace
          ? 'bg-danger-bg/60 border-danger/40 text-danger'
          : 'bg-warning-bg/60 border-warning/40 text-warning'
      )}
      role="alert"
    >
      {isGrace ? (
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
      ) : (
        <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
      )}

      <div className="flex-1 min-w-0">
        <p className="font-display text-[0.9rem] font-bold leading-tight">
          {isGrace ? 'Accès bientôt verrouillé' : 'Renouvellement bientôt requis'}
        </p>
        <p className="text-[0.8rem] mt-1 leading-snug text-ink-700">
          {message}
        </p>
        <Link
          to="/locked?renew=early"
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.78rem] font-semibold transition-colors min-h-[2rem]',
            isGrace
              ? 'bg-danger text-white hover:bg-danger/90'
              : 'bg-warning text-white hover:bg-warning/90'
          )}
        >
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
          Renouveler maintenant
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Masquer"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors',
          isGrace ? 'hover:bg-danger/15' : 'hover:bg-warning/15'
        )}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

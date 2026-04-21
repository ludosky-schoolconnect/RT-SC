/**
 * RT-SC · AbonnementCard — admin-facing subscription status.
 *
 * Shown in the Année tab. Lets admin see:
 *   - Current deadline
 *   - Days remaining (green/amber/red based on proximity)
 *   - Price and duration per renewal
 *   - "Renouveler maintenant" button → navigates to /locked which
 *     has the FedaPay widget (admin can pay EARLY, the fairness
 *     logic will extend from deadline forward so they don't lose days)
 *
 * The card is informational for most of a school's lifecycle (green
 * "bien actif") and becomes actionable only when renewal is near.
 * We don't show it if the school is currently locked — in that case
 * the admin is on /locked anyway.
 */

import { useNavigate } from 'react-router-dom'
import {
  CreditCard,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSubscription, WARNING_DAYS } from '@/hooks/useSubscription'
import { cn } from '@/lib/cn'

export function AbonnementCard() {
  const navigate = useNavigate()
  const sub = useSubscription()

  // FOUR states:
  //   loading — skeleton
  //   healthy — green, >7 days remaining
  //   warning — amber, 0-7 days
  //   grace   — red, deadline passed but still in 3-day grace
  // If truly locked, don't render (admin is on /locked instead).
  const tone: 'loading' | 'healthy' | 'warning' | 'grace' | 'hidden' =
    sub.loading
      ? 'loading'
      : sub.isLocked
        ? 'hidden'
        : sub.inGracePeriod
          ? 'grace'
          : sub.inWarningWindow
            ? 'warning'
            : 'healthy'

  if (tone === 'hidden') return null

  return (
    <Card padded={false}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md shrink-0 border',
            tone === 'grace' && 'bg-danger-bg border-danger/30 text-danger',
            tone === 'warning' && 'bg-warning-bg border-warning/30 text-warning',
            tone === 'healthy' && 'bg-success-bg border-success/30 text-success',
            tone === 'loading' && 'bg-ink-50 border-ink-100 text-ink-400'
          )}
        >
          <CreditCard className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-semibold text-navy tracking-tight">
            Mon abonnement
          </h3>
          <p className="text-[0.875rem] text-ink-600 leading-relaxed">
            Statut de votre abonnement SchoolConnect
          </p>
        </div>
      </div>

      {tone === 'loading' && (
        <div className="px-5 py-4 border-t border-ink-100">
          <div className="h-4 bg-ink-100 rounded animate-pulse mb-2 w-3/4" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-1/2" />
        </div>
      )}

      {tone !== 'loading' && (
        <>
          {/* Deadline row */}
          <div className="px-5 py-4 border-t border-ink-100 flex items-start gap-3">
            <Calendar
              className="h-4 w-4 text-ink-400 shrink-0 mt-1"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400">
                Prochaine échéance
              </p>
              {sub.deadline ? (
                <p className="font-display text-[1.05rem] font-bold text-navy mt-0.5">
                  {formatDate(sub.deadline)}
                </p>
              ) : (
                <p className="text-[0.85rem] text-ink-500 mt-0.5 italic">
                  Non définie
                </p>
              )}

              {sub.daysRemaining !== null && (
                <div
                  className={cn(
                    'mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[0.75rem] font-semibold',
                    tone === 'grace' && 'bg-danger-bg text-danger border border-danger/30',
                    tone === 'warning' && 'bg-warning-bg text-warning border border-warning/30',
                    tone === 'healthy' && 'bg-success-bg text-success border border-success/30'
                  )}
                >
                  {tone === 'grace' && (
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {tone === 'warning' && (
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {tone === 'healthy' && (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {formatDaysLabel(sub.daysRemaining)}
                </div>
              )}
            </div>
          </div>

          {/* Price + duration row */}
          <div className="px-5 py-4 border-t border-ink-100 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400">
                Tarif
              </p>
              <p className="text-[0.95rem] font-semibold text-navy mt-0.5">
                {formatPrice(sub.subscriptionPrice)}
              </p>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400">
                Durée
              </p>
              <p className="text-[0.95rem] font-semibold text-navy mt-0.5">
                {sub.subscriptionDurationMonths} mois
              </p>
            </div>
          </div>

          {/* Renew button. `?renew=early` flag tells LockedPage to
              show the pay UI rather than the "Déjà actif" fallback —
              critical when the school is still healthy and admin just
              wants to pay ahead. */}
          <div className="px-5 py-4 border-t border-ink-100">
            <button
              type="button"
              onClick={() => navigate('/locked?renew=early')}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[0.85rem] font-semibold transition-colors min-h-touch',
                tone === 'grace'
                  ? 'bg-danger text-white hover:bg-danger/90'
                  : tone === 'warning'
                    ? 'bg-warning text-white hover:bg-warning/90'
                    : 'bg-navy text-white hover:bg-navy-light'
              )}
            >
              <CreditCard className="h-4 w-4" aria-hidden />
              {tone === 'healthy'
                ? 'Renouveler par anticipation'
                : 'Renouveler maintenant'}
            </button>
            {tone === 'healthy' && (
              <p className="text-[0.72rem] text-ink-400 mt-2 leading-snug text-center">
                Payer en avance : votre échéance actuelle sera prolongée
                au lieu d'être réinitialisée. Vous ne perdez aucun jour.
              </p>
            )}
            {tone === 'warning' && (
              <p className="text-[0.72rem] text-ink-500 mt-2 leading-snug text-center">
                Renouvellement recommandé dans les {WARNING_DAYS} jours
                avant l'échéance.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function formatPrice(fcfa: number): string {
  return new Intl.NumberFormat('fr-FR').format(fcfa) + ' FCFA'
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDaysLabel(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days)
    return `Expiré il y a ${abs} jour${abs > 1 ? 's' : ''}`
  }
  if (days === 0) return "Expire aujourd'hui"
  if (days === 1) return 'Expire demain'
  return `${days} jours restants`
}

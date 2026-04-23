/**
 * RT-SC · LockedPage
 *
 * Shown to ADMIN when the subscription is locked:
 *   - isManualLock = true (Ludosky flipped from command center), OR
 *   - now > deadline + 3 day grace
 *
 * Non-admin users go to /maintenance instead (see SubscriptionGuard).
 *
 * What this page does:
 *   1. Displays the current subscription status (deadline, price)
 *   2. Loads FedaPay SDK on demand
 *   3. "Payer maintenant" opens the FedaPay widget INLINE, tagged
 *      with this school's project ID as custom_metadata.school_id
 *   4. On successful payment: flips hasRequestedUnlock:true as a
 *      UX nudge. The actual deadline extension happens server-side
 *      via the fedapayWebhook Cloud Function (FedaPay posts a
 *      signed event, webhook verifies + writes with admin SDK).
 *      SubscriptionGuard's onSnapshot picks up the new deadline and
 *      auto-redirects.
 *   5. Fallback: "J'ai déjà payé (autre moyen)" → flips
 *      hasRequestedUnlock=true so Ludosky sees the alert and can
 *      manually unlock after verifying the cash/bank payment
 *   6. "Se déconnecter" — admin can log out and hand control to a
 *      different admin if they want
 *
 * Security: F12-proof. Firestore rules (Session E5) restrict
 * `deadline` and `isManualLock` writes to SaaSMaster identity only.
 * Admins can only flip `hasRequestedUnlock` to true. The webhook
 * runs with admin-SDK credentials, bypassing rules, and is the only
 * trusted path to extend a deadline.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  Lock,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  LogOut,
  RefreshCw,
  Calendar,
  MailQuestion,
} from 'lucide-react'
import { auth } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import {
  useSubscription,
  useRequestUnlock,
} from '@/hooks/useSubscription'
import {
  loadFedaPay,
  detectFedaPayEnvironment,
  isFedaPayApproved,
} from '@/lib/fedapay'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'
import { cn } from '@/lib/cn'

export default function LockedPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const confirm = useConfirm()
  const reset = useAuthStore((s) => s.reset)
  const { data: ecoleConfig } = useEcoleConfig()

  const sub = useSubscription()
  // ════════════════════════════════════════════════════════════════
  // Session E5 — secure subscription renewal path
  // ════════════════════════════════════════════════════════════════
  //
  // The payment flow is F12-proof via a layered design:
  //
  //   1. Admin clicks "Payer" → FedaPay widget opens with
  //      custom_metadata.school_id = this project's ID
  //   2. Admin completes payment on FedaPay → FedaPay approves the
  //      transaction and POSTs a signed webhook to our
  //      fedapayWebhook Cloud Function
  //   3. The function verifies the signature, checks school_id
  //      matches its own project (so one FedaPay account can
  //      serve multiple schools safely), then writes the new
  //      deadline via admin SDK (bypassing client-side rules)
  //   4. Client's onSnapshot listener sees the new deadline →
  //      SubscriptionGuard auto-redirects to /admin
  //
  // Additionally, onComplete here flips hasRequestedUnlock:true
  // as a UX nudge — it makes the "your alert was sent" card
  // appear instantly rather than waiting for webhook delivery.
  // It's also a fallback: if the webhook is ever slow/failing,
  // Ludosky still sees the 🔔 in the vendor app and can unlock
  // manually. Admin-writable via the tightened subscription rule
  // (only hasRequestedUnlock can be flipped to true).
  //
  // Firestore rules (E5) restrict `deadline` / `isManualLock`
  // writes to SaaSMaster identity only. Admins cannot extend
  // their own subscription via F12 anymore.
  // ════════════════════════════════════════════════════════════════
  const unlockMut = useRequestUnlock()

  // "Renew early" mode: admin tapped the renew button from Mon
  // abonnement while their subscription was still healthy. We want to
  // SHOW the pay UI (not the "Déjà actif" fallback) so they can
  // actually pay. The fairness logic in the FedaPay webhook extends
  // from the current deadline, so they don't lose days.
  const renewEarly = searchParams.get('renew') === 'early'

  // Payment flow state — controls the primary button's label
  const [payStatus, setPayStatus] = useState<
    'idle' | 'loading-sdk' | 'opening' | 'processing' | 'success' | 'error'
  >('idle')

  // Preload FedaPay in the background as soon as the page mounts, so
  // the first click on "Payer" is instant. Silent failure — if the
  // load fails at mount we retry on click.
  useEffect(() => {
    loadFedaPay().catch(() => {
      // noop — retried on button click with visible error
    })
  }, [])

  // Show the "all good" fallback ONLY when:
  //   - subscription has loaded
  //   - school is not locked
  //   - admin did NOT arrive here via the "Renew early" button
  // If they came here explicitly to renew early, we skip the fallback
  // and render the normal pay UI so their click actually does something.
  const showUnlocked = !sub.loading && !sub.isLocked && !renewEarly

  // Title/reason copy adapts to the three arrival contexts:
  //   1. renewEarly (admin came from Mon abonnement → renew ahead)
  //   2. isManualLock (Ludosky suspended access)
  //   3. deadline passed (standard expiry)
  const reasonLabel = renewEarly
    ? 'Renouvelez votre abonnement par anticipation pour éviter toute interruption'
    : sub.isManualLock
      ? 'Accès suspendu par l\'administrateur du service'
      : 'Abonnement expiré'

  async function handlePay() {
    if (!sub.fedaPayPublicKey) {
      toast.error(
        'Paiement en ligne non disponible pour le moment. Contactez le support.'
      )
      return
    }

    try {
      setPayStatus('loading-sdk')
      const FedaPay = await loadFedaPay()

      setPayStatus('opening')
      const widget = FedaPay.init({
        public_key: sub.fedaPayPublicKey,
        environment: detectFedaPayEnvironment(sub.fedaPayPublicKey),
        transaction: {
          amount: sub.subscriptionPrice,
          description: `Renouvellement SchoolConnect${
            ecoleConfig?.nom ? ' — ' + ecoleConfig.nom : ''
          }`,
          // Session E5 — tag the transaction with this school's
          // project ID so the fedapayWebhook Cloud Function can
          // filter events. One FedaPay account serves all schools,
          // so every school's webhook receives every payment
          // event — without this metadata, the webhook can't
          // tell which school's deadline to extend.
          custom_metadata: {
            school_id: auth.app.options.projectId ?? '',
          },
        },
        onComplete: async (resp) => {
          if (!isFedaPayApproved(resp)) {
            // User cancelled or payment failed — reset button and let
            // them try again. Don't toast aggressively; FedaPay widget
            // already shows its own error state.
            setPayStatus('idle')
            return
          }

          // Session E5 — secure path. We flip hasRequestedUnlock:true
          // as a UX nudge (alerts Ludosky in vendor-app + makes the
          // "payment received" card appear instantly). The actual
          // deadline extension happens server-side via the webhook:
          // FedaPay posts to fedapayWebhook, which verifies the
          // signature and writes the new deadline with admin-SDK.
          //
          // Writing the deadline from the client would fail anyway
          // (rules block it) — this mutation just writes the
          // unlock-request flag, which admin CAN write per the
          // subscription rule.
          try {
            setPayStatus('processing')
            await unlockMut.mutateAsync()
            setPayStatus('success')
            toast.success(
              'Paiement reçu ! Déblocage en cours — votre accès sera rétabli sous quelques instants.'
            )
            // Do NOT auto-navigate. The webhook will flip
            // hasRequestedUnlock back to false + extend deadline.
            // SubscriptionGuard's onSnapshot listener picks up the
            // new state and redirects automatically once Firestore
            // propagates (usually 1-3 seconds).
          } catch (err) {
            console.error('[LockedPage] hasRequestedUnlock write failed:', err)
            setPayStatus('error')
            toast.error(
              'Paiement reçu côté FedaPay mais enregistrement impossible. Contactez le support avec votre reçu.'
            )
          }
        },
      })
      widget.open()
    } catch (err) {
      console.error('[LockedPage] FedaPay load/init failed:', err)
      setPayStatus('error')
      toast.error(
        'Impossible d\'ouvrir le terminal de paiement. Vérifiez votre connexion.'
      )
      // Let user retry after a moment
      setTimeout(() => setPayStatus('idle'), 1500)
    }
  }

  async function handleRequestUnlock() {
    const ok = await confirm({
      title: 'Signaler un paiement externe ?',
      message:
        'Utilisez cette option si vous avez déjà payé par un autre moyen (espèces, virement bancaire). Le support sera notifié et vérifiera le paiement avant de débloquer l\'accès.',
      confirmLabel: 'Oui, signaler',
      cancelLabel: 'Annuler',
      variant: 'info',
    })
    if (!ok) return

    try {
      await unlockMut.mutateAsync()
      toast.success(
        'Signalement envoyé. Le support vous contactera sous peu.'
      )
    } catch (err) {
      console.error('[LockedPage] requestUnlock failed:', err)
      toast.error('Erreur lors du signalement. Réessayez.')
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message:
        'Vous pouvez vous reconnecter avec un autre compte administrateur si besoin.',
      confirmLabel: 'Se déconnecter',
      cancelLabel: 'Annuler',
      variant: 'warning',
    })
    if (!ok) return
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
    reset()
    navigate('/welcome', { replace: true })
  }

  const primaryButtonLabel = (() => {
    switch (payStatus) {
      case 'loading-sdk':
        return 'Chargement du terminal…'
      case 'opening':
        return 'Ouverture du terminal…'
      case 'processing':
        return 'Validation en cours…'
      case 'success':
        return 'Paiement reçu — déblocage en cours…'
      case 'error':
        return 'Réessayer'
      default:
        return sub.subscriptionPrice
          ? `Payer ${formatPrice(sub.subscriptionPrice)} via FedaPay`
          : 'Payer via FedaPay'
    }
  })()

  const primaryButtonDisabled =
    payStatus === 'loading-sdk' ||
    payStatus === 'opening' ||
    payStatus === 'processing' ||
    payStatus === 'success' ||
    !sub.fedaPayPublicKey

  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-xl mx-auto px-4 h-[68px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SchoolConnectLogo size={36} animate={false} />
            <div className="min-w-0">
              <p className="text-[0.65rem] uppercase tracking-[0.15em] text-white/45 leading-none">
                SchoolConnect
              </p>
              {ecoleConfig?.nom && (
                <p className="font-display text-[0.95rem] font-semibold leading-tight truncate mt-0.5">
                  {ecoleConfig.nom}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[0.8rem] hover:bg-white/[0.08] transition-colors min-h-touch"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        {sub.loading ? (
          <LoadingCard />
        ) : showUnlocked ? (
          <AlreadyUnlockedCard onContinue={() => navigate('/admin', { replace: true })} />
        ) : (
          <>
            {/* Hero / status card. Color scheme shifts for renewEarly
                (admin is acting proactively, not locked out) vs actual
                lock (red danger tone to underscore the urgency). */}
            <div
              className={cn(
                'rounded-xl bg-white border-[1.5px] overflow-hidden shadow-sm',
                renewEarly ? 'border-navy/20' : 'border-danger/30'
              )}
            >
              <div
                className={cn(
                  'px-5 py-6 border-b',
                  renewEarly
                    ? 'bg-gradient-to-br from-info-bg to-white border-navy/15'
                    : 'bg-gradient-to-br from-danger/10 to-danger/5 border-danger/20'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-lg border',
                      renewEarly
                        ? 'bg-info-bg border-navy/25 text-navy'
                        : 'bg-danger/15 border-danger/30 text-danger'
                    )}
                  >
                    {renewEarly ? (
                      <CreditCard className="h-5 w-5" aria-hidden />
                    ) : (
                      <Lock className="h-5 w-5" aria-hidden />
                    )}
                  </div>
                  <div>
                    <p
                      className={cn(
                        'text-[0.7rem] uppercase tracking-widest font-bold',
                        renewEarly ? 'text-navy' : 'text-danger'
                      )}
                    >
                      {renewEarly ? 'SchoolConnect' : 'Accès restreint'}
                    </p>
                    <h1 className="font-display text-[1.4rem] font-bold text-navy leading-tight">
                      {renewEarly
                        ? 'Renouvellement par anticipation'
                        : 'Renouvellement requis'}
                    </h1>
                  </div>
                </div>
                <p className="text-[0.88rem] text-ink-600 leading-relaxed">
                  {reasonLabel}
                  {renewEarly && sub.deadline && (
                    <>
                      . Échéance actuelle :{' '}
                      <span className="font-semibold text-navy">
                        {formatDate(sub.deadline)}
                      </span>
                      .
                    </>
                  )}
                  {!renewEarly && sub.deadline && !sub.isManualLock && (
                    <>
                      .{' '}
                      Expiré le{' '}
                      <span className="font-semibold text-navy">
                        {formatDate(sub.deadline)}
                      </span>
                      .
                    </>
                  )}
                  {!renewEarly && sub.isManualLock && '.'}
                </p>
              </div>

              {/* Pay section */}
              <div className="px-5 py-5">
                <p className="text-[0.8rem] text-ink-600 mb-4 leading-relaxed">
                  Payez via FedaPay (Mobile Money){' '}
                  {renewEarly
                    ? 'pour prolonger votre abonnement sans interruption'
                    : 'pour réactiver votre accès'}
                  . Votre abonnement sera prolongé de{' '}
                  <span className="font-semibold text-navy">
                    {sub.subscriptionDurationMonths} mois
                  </span>
                  . Le déblocage est automatique après confirmation du
                  paiement par FedaPay.
                </p>

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={primaryButtonDisabled}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold tracking-tight text-[0.95rem] transition-all min-h-touch',
                    'bg-navy text-white hover:bg-navy-light active:scale-[0.99]',
                    'disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed disabled:active:scale-100',
                    payStatus === 'success' && 'bg-success hover:bg-success'
                  )}
                >
                  {payStatus === 'success' ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                  ) : payStatus === 'processing' ||
                    payStatus === 'opening' ||
                    payStatus === 'loading-sdk' ? (
                    <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <CreditCard className="h-5 w-5" aria-hidden />
                  )}
                  {primaryButtonLabel}
                </button>

                {!sub.fedaPayPublicKey && (
                  <div className="mt-3 p-3 rounded-md bg-warning-bg/60 border border-warning/30 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
                    <p className="text-[0.78rem] text-warning leading-snug">
                      Paiement en ligne non configuré. Contactez le
                      support pour renouveler votre abonnement.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Alternative payment fallback */}
            <div className="mt-5 rounded-xl bg-white border border-ink-100 px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-info-bg border border-navy/20 shrink-0">
                  <MailQuestion className="h-4 w-4 text-navy" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
                    Vous avez payé autrement ?
                  </p>
                  <p className="text-[0.8rem] text-ink-600 mt-1 leading-snug">
                    Espèces, virement bancaire, ou autre moyen hors
                    ligne. Nous vérifions et débloquons manuellement.
                  </p>
                  <button
                    type="button"
                    onClick={handleRequestUnlock}
                    disabled={unlockMut.isPending || sub.hasRequestedUnlock}
                    className={cn(
                      'mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors min-h-[2.25rem]',
                      sub.hasRequestedUnlock
                        ? 'border-success/40 bg-success-bg/60 text-success cursor-default'
                        : 'border-navy/30 text-navy hover:bg-info-bg',
                      unlockMut.isPending && 'opacity-50 cursor-wait'
                    )}
                  >
                    {sub.hasRequestedUnlock ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Signalement envoyé
                      </>
                    ) : (
                      <>
                        <MailQuestion className="h-3.5 w-3.5" aria-hidden />
                        Signaler un paiement externe
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Support block — only rendered when a WhatsApp number
                is configured in ecole/subscription.supportWhatsAppNumber
                (set via dev.html). Uses wa.me link which works on both
                desktop browsers (opens WhatsApp Web) and mobile
                (opens WhatsApp app directly). The message is
                URL-encoded and includes the school name so Ludosky
                immediately knows who's contacting him. */}
            {sub.supportWhatsAppNumber && (
              <div className="mt-5 rounded-xl bg-info-bg/60 border border-navy/15 px-5 py-4">
                <div className="flex items-start gap-3">
                  <MessageCircle
                    className="h-4 w-4 text-navy shrink-0 mt-0.5"
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.85rem] font-semibold text-navy leading-tight">
                      Besoin d'aide ?
                    </p>
                    <p className="text-[0.8rem] text-ink-600 mt-1 leading-snug">
                      Contactez le support SchoolConnect pour toute
                      question concernant votre abonnement ou un
                      problème de paiement.
                    </p>
                    <a
                      href={buildWhatsAppUrl(
                        sub.supportWhatsAppNumber,
                        ecoleConfig?.nom
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#25D366] text-white hover:bg-[#1fb955] transition-colors px-3 py-2 text-[0.8rem] font-semibold min-h-[2.25rem]"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Contacter sur WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/**
 * Build a wa.me URL that pre-fills a message identifying the school
 * so Ludosky immediately knows who's contacting him. The URL format
 * is `https://wa.me/{digits}?text={encoded}`. Digits only, no +.
 */
function buildWhatsAppUrl(number: string, schoolName?: string): string {
  const messageLines = [
    'Bonjour, je contacte le support SchoolConnect.',
    schoolName ? `École : ${schoolName}` : null,
    "J'ai une question concernant mon abonnement.",
  ].filter((line): line is string => line !== null)
  const text = encodeURIComponent(messageLines.join('\n'))
  return `https://wa.me/${number}?text=${text}`
}

// ─── Supporting components ───────────────────────────────────────

function LoadingCard() {
  return (
    <div className="rounded-xl bg-white border border-ink-100 px-5 py-8 text-center">
      <RefreshCw
        className="h-6 w-6 text-ink-300 mx-auto animate-spin"
        aria-hidden
      />
      <p className="text-[0.85rem] text-ink-400 mt-3">
        Vérification de l'abonnement…
      </p>
    </div>
  )
}

function AlreadyUnlockedCard({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="rounded-xl bg-white border border-success/30 overflow-hidden">
      <div className="bg-gradient-to-br from-success/10 to-success/5 px-5 py-6 border-b border-success/20">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/15 border border-success/30">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-widest font-bold text-success">
              Abonnement actif
            </p>
            <h1 className="font-display text-[1.2rem] font-bold text-navy leading-tight">
              Aucune action requise
            </h1>
          </div>
        </div>
      </div>
      <div className="px-5 py-5">
        <p className="text-[0.85rem] text-ink-600 leading-relaxed">
          Votre abonnement est actuellement actif. Vous pouvez
          retourner à l'application.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-navy text-white px-4 py-2 text-[0.85rem] font-semibold hover:bg-navy-light transition-colors min-h-touch"
        >
          <Calendar className="h-4 w-4" aria-hidden />
          Retour à l'application
        </button>
      </div>
    </div>
  )
}

// ─── Formatting helpers ──────────────────────────────────────────

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

/**
 * RT-SC · Subscription hook.
 *
 * Single source of truth for the school's subscription state. Reads
 * `ecole/subscription` live via onSnapshot so when Ludosky (the vendor)
 * flips isManualLock from his command center, or when a payment
 * extends the deadline, the UI reacts instantly.
 *
 * Exposes:
 *   - raw data (deadline Date, isManualLock, fedaPayPublicKey, price)
 *   - derived state (isLocked, daysRemaining, inGracePeriod, inWarningWindow)
 *   - mutation `usePayAndExtendSubscription` that applies fairness logic
 *
 * Fairness logic (Q3):
 *   - Paying EARLY  (deadline > now): new deadline = deadline + N months
 *                   → school doesn't lose days already paid for
 *   - Paying LATE   (deadline ≤ now): new deadline = now + N months
 *                   → new cycle starts today, no backdating
 *
 * This matches legacy paiement.js line 45 and protects both parties:
 *   - Early payer isn't scammed out of days
 *   - Late payer doesn't get a shortened month because deadline lapsed
 */

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { onSnapshot, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { ecoleSubscriptionDoc } from '@/lib/firestore-keys'
import { serverNow } from "@/lib/serverTime"
import type { SubscriptionDoc } from '@/types/models'

/** Grace period after deadline before actual lockout. Must match SubscriptionGuard. */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000
/** How many days before the deadline we start showing the warning banner. */
export const WARNING_DAYS = 7
/** Default price fallback if Ludosky hasn't configured one yet. */
export const DEFAULT_PRICE_FCFA = 15000
/** Default duration per payment if not configured (1 month). */
export const DEFAULT_DURATION_MONTHS = 1

export interface SubscriptionState {
  /** Raw deadline as JS Date, or null if doc doesn't exist / never initialized */
  deadline: Date | null
  /** Deadline + grace period (3 days) — the HARD lock boundary */
  gracedDeadline: Date | null
  /** True if manually locked by Ludosky via command center */
  isManualLock: boolean
  /** True if deadline+grace has elapsed */
  isPastGrace: boolean
  /** Composite: true if the app SHOULD be locked right now */
  isLocked: boolean
  /** True if inside the 7-day warning window before deadline */
  inWarningWindow: boolean
  /** True if past deadline but still in grace (escalated red warning) */
  inGracePeriod: boolean
  /** Whole days until deadline (negative if past). Null if no deadline. */
  daysRemaining: number | null
  /** FedaPay public key for the school (set by Ludosky via dev.html) */
  fedaPayPublicKey: string | null
  /** Subscription price in FCFA, set by Ludosky via dev.html */
  subscriptionPrice: number
  /** Duration per payment in months (custom field, defaults to 1) */
  subscriptionDurationMonths: number
  /** WhatsApp number (international format, no +) for support link. Set via dev.html. */
  supportWhatsAppNumber: string | null
  /** True if the school tapped "Demander déblocage" (fallback for cash payers) */
  hasRequestedUnlock: boolean
  /** True while the initial snapshot is loading */
  loading: boolean
}

/**
 * Live read of ecole/subscription. Returns rich state with derived
 * fields. Subscribes on mount, unsubscribes on unmount.
 *
 * Use this ANYWHERE in admin UI that needs subscription info (locked
 * page, warning banner, Mon abonnement card).
 */
export function useSubscription(): SubscriptionState {
  const [raw, setRaw] = useState<SubscriptionDoc | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      docRef(ecoleSubscriptionDoc()),
      (snap) => {
        if (snap.exists()) {
          setRaw(snap.data() as SubscriptionDoc)
        } else {
          setRaw(null)
        }
        setLoading(false)
      },
      (err) => {
        console.warn('[useSubscription] snapshot error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return computeSubscriptionState(raw, loading)
}

function computeSubscriptionState(
  raw: SubscriptionDoc | null,
  loading: boolean
): SubscriptionState {
  const now = serverNow()

  const deadline = raw?.deadline?.toDate ? raw.deadline.toDate() : null
  const gracedDeadline = deadline
    ? new Date(deadline.getTime() + GRACE_MS)
    : null

  const isManualLock = raw?.isManualLock === true
  const isPastGrace = gracedDeadline ? now > gracedDeadline : false
  const isLocked = isManualLock || isPastGrace

  const daysRemaining = deadline
    ? Math.floor((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null

  const inWarningWindow =
    daysRemaining !== null &&
    daysRemaining <= WARNING_DAYS &&
    daysRemaining >= 0

  const inGracePeriod =
    deadline !== null && now > deadline && !isPastGrace

  const fedaPayPublicKey = raw?.fedaPayPublicKey || null
  const subscriptionPrice = raw?.subscriptionPrice ?? DEFAULT_PRICE_FCFA
  const subscriptionDurationMonths =
    raw?.subscriptionDurationMonths ?? DEFAULT_DURATION_MONTHS

  // Sanitize WhatsApp number: strip any characters that aren't digits.
  // The wa.me link format requires bare digits without +, spaces, or
  // dashes. If Ludosky pastes "+229 90 12 34 56" from his phone, this
  // still works.
  const rawWa = raw?.supportWhatsAppNumber?.trim() || ''
  const supportWhatsAppNumber = rawWa ? rawWa.replace(/\D/g, '') || null : null

  return {
    deadline,
    gracedDeadline,
    isManualLock,
    isPastGrace,
    isLocked,
    inWarningWindow,
    inGracePeriod,
    daysRemaining,
    fedaPayPublicKey,
    subscriptionPrice,
    subscriptionDurationMonths,
    supportWhatsAppNumber,
    hasRequestedUnlock: raw?.hasRequestedUnlock === true,
    loading,
  }
}

// ─── Mutation: pay & extend ────────────────────────────────────────
//
// Called by LockedPage (and Mon abonnement card) AFTER FedaPay reports
// a successful payment. Reads the current deadline fresh (we can't
// trust a cached value — between payment open and payment complete,
// another path may have updated it), then applies fairness logic:
//
//   if currentDeadline > now → newDeadline = currentDeadline + N months
//   else                     → newDeadline = now + N months
//
// Also clears isManualLock and hasRequestedUnlock so a legitimate
// payment resolves both locks simultaneously.

export function usePayAndExtendSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      /** Duration to extend by, in months. Defaults to the current config. */
      durationMonths?: number
    }): Promise<{ newDeadline: Date; wasEarly: boolean }> => {
      // Always read fresh — the subscription doc might have been
      // updated by another path (Ludosky manually extending, a
      // simultaneous payment, etc.) between the time the hook cached
      // it and the payment completing.
      const ref = docRef(ecoleSubscriptionDoc())
      const snap = await getDoc(ref)

      // Read BOTH the existing deadline AND the current duration config.
      // If the caller passed an override, use that; otherwise use
      // whatever's on the doc (or default).
      const data = snap.exists() ? (snap.data() as SubscriptionDoc) : null
      const currentDeadline = data?.deadline?.toDate
        ? data.deadline.toDate()
        : null
      const months =
        input.durationMonths ??
        data?.subscriptionDurationMonths ??
        DEFAULT_DURATION_MONTHS

      const now = serverNow()
      let base: Date
      let wasEarly = false

      if (currentDeadline && currentDeadline > now) {
        // Early pay — extend from current deadline forward. School
        // keeps the days they already paid for.
        base = new Date(currentDeadline)
        wasEarly = true
      } else {
        // Late pay (or first ever) — start fresh from today. No
        // backdating; they get the full period they just paid for.
        base = new Date(now)
      }

      const newDeadline = new Date(base)
      newDeadline.setMonth(newDeadline.getMonth() + months)

      // Merge-write so we preserve Ludosky's config (fedaPayPublicKey,
      // subscriptionPrice) and only touch the three fields we own.
      await setDoc(
        ref,
        {
          deadline: Timestamp.fromDate(newDeadline),
          isManualLock: false,
          hasRequestedUnlock: false,
        },
        { merge: true }
      )

      return { newDeadline, wasEarly }
    },
    onSuccess: () => {
      // No cache invalidation needed — the useSubscription onSnapshot
      // will pick up the change automatically. But flag it for any
      // future useQuery-based consumers.
      qc.invalidateQueries({ queryKey: ['ecole', 'subscription'] })
    },
  })
}

// ─── Mutation: request manual unlock (cash payer fallback) ─────────
//
// For schools that can't pay via FedaPay (cash / bank transfer / etc.)
// Admin taps "J'ai déjà payé — demander déblocage", this flips
// `hasRequestedUnlock: true`. Ludosky sees a 🔔 alert on dev.html,
// verifies the cash payment offline, then manually extends the
// deadline from his command center.

export function useRequestUnlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await setDoc(
        docRef(ecoleSubscriptionDoc()),
        { hasRequestedUnlock: true },
        { merge: true }
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'subscription'] })
    },
  })
}

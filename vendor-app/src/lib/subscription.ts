/**
 * Vendor · useSubscription hook.
 *
 * Live onSnapshot read of `ecole/subscription` for the currently
 * active school. Unlike RT-SC's equivalent hook, this one takes the
 * Firestore instance as input because we don't have a global
 * singleton — the vendor app holds one Firestore per selected school.
 *
 * Also exposes mutations that wrap setDoc() with the fairness logic
 * and consistent field shape, so the CommandCenter UI stays focused
 * on presentation.
 */

import { useEffect, useState } from 'react'
import {
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'

export interface SubscriptionRaw {
  deadline?: Timestamp
  isManualLock?: boolean
  hasRequestedUnlock?: boolean
  fedaPayPublicKey?: string
  subscriptionPrice?: number
  subscriptionDurationMonths?: number
  supportWhatsAppNumber?: string
}

export interface SubscriptionState {
  raw: SubscriptionRaw | null
  deadline: Date | null
  isManualLock: boolean
  hasRequestedUnlock: boolean
  loading: boolean
  /** True if the doc doesn't exist yet (fresh school — first save creates it) */
  uninitialized: boolean
}

export function useSubscription(db: Firestore): SubscriptionState {
  const [raw, setRaw] = useState<SubscriptionRaw | null>(null)
  const [loading, setLoading] = useState(true)
  const [uninitialized, setUninitialized] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'ecole', 'subscription'),
      (snap) => {
        if (snap.exists()) {
          setRaw(snap.data() as SubscriptionRaw)
          setUninitialized(false)
        } else {
          setRaw(null)
          setUninitialized(true)
        }
        setLoading(false)
      },
      (err) => {
        console.warn('[vendor:useSubscription] snapshot error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [db])

  return {
    raw,
    deadline: raw?.deadline?.toDate?.() ?? null,
    isManualLock: raw?.isManualLock === true,
    hasRequestedUnlock: raw?.hasRequestedUnlock === true,
    loading,
    uninitialized,
  }
}

// ─── Mutations ────────────────────────────────────────────────────

export interface ConfigPayload {
  fedaPayPublicKey: string
  subscriptionPrice: number
  subscriptionDurationMonths: number
  /** Optional — if omitted, field is NOT written (preserves existing value) */
  supportWhatsAppNumber?: string
}

/**
 * Save config fields. Uses merge: true so existing deadline + lock
 * state are untouched. If supportWhatsAppNumber is omitted, we
 * deliberately don't write it — prevents accidentally wiping the
 * number when the vendor pastes a new FedaPay key without touching
 * the WhatsApp field.
 */
export async function saveConfig(
  db: Firestore,
  payload: ConfigPayload
): Promise<void> {
  const data: Partial<SubscriptionRaw> = {
    fedaPayPublicKey: payload.fedaPayPublicKey,
    subscriptionPrice: payload.subscriptionPrice,
    subscriptionDurationMonths: payload.subscriptionDurationMonths,
  }
  if (payload.supportWhatsAppNumber !== undefined) {
    data.supportWhatsAppNumber = payload.supportWhatsAppNumber
  }
  await setDoc(doc(db, 'ecole', 'subscription'), data, { merge: true })
}

/**
 * Record a payment. Uses the fairness logic: if current deadline is
 * in the future, extend from there (school keeps paid days); else
 * extend from today. Also clears both lock flags.
 *
 * durationMonths defaults to the value on the doc, else 1.
 */
export async function recordPayment(
  db: Firestore,
  currentDeadline: Date | null,
  durationMonths: number
): Promise<Date> {
  const now = new Date()
  const base =
    currentDeadline && currentDeadline > now
      ? new Date(currentDeadline)
      : new Date(now)
  const newDeadline = new Date(base)
  newDeadline.setMonth(newDeadline.getMonth() + durationMonths)

  await setDoc(
    doc(db, 'ecole', 'subscription'),
    {
      deadline: Timestamp.fromDate(newDeadline),
      isManualLock: false,
      hasRequestedUnlock: false,
    },
    { merge: true }
  )
  return newDeadline
}

/**
 * Reset cycle: set deadline = today + durationMonths, clear locks.
 * Used when a school is in a messy state (long-expired, confused
 * history) and the vendor wants a clean slate.
 */
export async function resetCycle(
  db: Firestore,
  durationMonths: number
): Promise<Date> {
  const newDeadline = new Date()
  newDeadline.setMonth(newDeadline.getMonth() + durationMonths)
  await setDoc(
    doc(db, 'ecole', 'subscription'),
    {
      deadline: Timestamp.fromDate(newDeadline),
      isManualLock: false,
      hasRequestedUnlock: false,
    },
    { merge: true }
  )
  return newDeadline
}

export async function clearUnlockAlert(db: Firestore): Promise<void> {
  await setDoc(
    doc(db, 'ecole', 'subscription'),
    { hasRequestedUnlock: false },
    { merge: true }
  )
}

export async function toggleManualLock(
  db: Firestore,
  currentValue: boolean
): Promise<void> {
  await setDoc(
    doc(db, 'ecole', 'subscription'),
    { isManualLock: !currentValue },
    { merge: true }
  )
}

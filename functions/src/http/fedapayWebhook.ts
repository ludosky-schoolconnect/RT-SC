/**
 * FedaPay webhook handler.
 *
 * This is the server-side path that makes subscription renewal
 * F12-proof. FedaPay POSTs here when a transaction is approved,
 * we verify the HMAC signature, then server-side-write the new
 * deadline using admin credentials. The Firestore rule (deployed
 * alongside this function) restricts `deadline` writes to the
 * server identity, so no client can spoof them.
 *
 * Flow:
 *   1. Admin clicks "Payer" in LockedPage → FedaPay widget opens
 *   2. Admin completes payment → FedaPay confirms
 *   3. FedaPay POSTs /fedapayWebhook with the transaction details
 *   4. We verify signature, check status='approved', write new deadline
 *   5. Client's onSnapshot listener fires → LockedPage auto-unlocks
 *
 * One deployment per school (each school has its own Firebase
 * project, its own FedaPay account, and its own webhook secret).
 *
 * URL shape: https://<region>-<schoolId>.cloudfunctions.net/fedapayWebhook
 *
 * The admin registers that URL in their school's FedaPay dashboard
 * (Settings → Webhooks) after the first deploy.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'
import { verifyFedaPaySignature } from '../lib/fedapay-webhook-verify.js'
import { computeNewDeadline } from '../lib/subscription-math.js'

// Secrets — set via `firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET`
const FEDAPAY_WEBHOOK_SECRET = defineSecret('FEDAPAY_WEBHOOK_SECRET')

/**
 * Shape of the FedaPay webhook payload. Loosely typed because
 * FedaPay evolves without notice — we read only the fields we care
 * about.
 *
 * Session E5: `custom_metadata.school_id` is set by LockedPage on
 * widget init so the webhook can filter events by the originating
 * school. Critical when one FedaPay account serves multiple school
 * Firebase projects: without filtering, every school's webhook
 * receives events from every other school's payments.
 */
interface FedaPayEvent {
  event?: string // e.g. "transaction.approved"
  data?: {
    object?: {
      status?: string
      id?: number | string
      amount?: number
      reference?: string
      custom_metadata?: {
        school_id?: string
      }
    }
  }
}

export const fedapayWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: [FEDAPAY_WEBHOOK_SECRET],
    // Allow FedaPay's servers only. Set in deploy doc per school.
    cors: false,
    // Keep invocations short — reject slow-loris attempts
    timeoutSeconds: 30,
  },
  async (req, res) => {
    // Only POST
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed')
      return
    }

    // 1. Verify signature — reject if spoofed or tampered
    const rawBody = req.rawBody as Buffer | undefined
    if (!rawBody) {
      res.status(400).send('missing body')
      return
    }

    const sigHeader =
      (req.headers['x-fedapay-signature'] as string | undefined) ??
      (req.headers['X-FedaPay-Signature'] as string | undefined)

    const verification = verifyFedaPaySignature(
      rawBody,
      sigHeader,
      FEDAPAY_WEBHOOK_SECRET.value()
    )
    if (!verification.ok) {
      logger.warn('fedapayWebhook: signature verification failed', {
        reason: verification.reason,
      })
      res.status(401).send('invalid signature')
      return
    }

    // 2. Parse event (after signature check — never parse untrusted data first)
    let event: FedaPayEvent
    try {
      event = JSON.parse(rawBody.toString('utf8'))
    } catch {
      res.status(400).send('invalid json')
      return
    }

    logger.info('fedapayWebhook: received verified event', {
      eventType: event.event,
      transactionId: event.data?.object?.id,
      status: event.data?.object?.status,
    })

    // 3. Only act on approved transactions. Other event types
    //    (pending, declined, refunded) are logged but ignored here.
    //    If you later need to handle refunds etc, branch on event.event.
    const status = event.data?.object?.status?.toLowerCase()
    const isApproved =
      event.event === 'transaction.approved' ||
      status === 'approved' ||
      status === 'completed'
    if (!isApproved) {
      logger.info('fedapayWebhook: event ignored (not an approval)', {
        eventType: event.event,
        status,
      })
      res.status(200).send('ok (ignored)')
      return
    }

    // Session E5 — per-school metadata filtering.
    //
    // All schools share ONE FedaPay account, which means FedaPay
    // fires the same event on every webhook configured on that
    // account. This function is deployed per school (each school
    // = its own Firebase project = its own function URL), so
    // without filtering, school A's function would extend school
    // A's deadline every time a parent of school B pays. That's
    // the bug E5 closes.
    //
    // The client (LockedPage) puts the originating project ID in
    // the transaction's custom_metadata.school_id. Here we compare
    // it to this function's own project ID. Mismatch → return 200
    // + ignore (the 200 is important: FedaPay retries non-2xx
    // responses, so a 4xx here would cause unnecessary retries
    // for every school except the intended one).
    //
    // Missing metadata is also ignored — legacy transactions
    // created before E5 deployed would arrive without the field,
    // and we don't want to accidentally credit the wrong school.
    // Admins whose first post-E5 payment lacks metadata will need
    // to use the manual vendor-app unlock path.
    const projectId =
      process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? ''
    const metaSchoolId = event.data?.object?.custom_metadata?.school_id

    if (!metaSchoolId) {
      logger.info('fedapayWebhook: event ignored (no school_id metadata)', {
        transactionId: event.data?.object?.id,
        projectId,
      })
      res.status(200).send('ok (no metadata)')
      return
    }

    if (metaSchoolId !== projectId) {
      logger.info('fedapayWebhook: event ignored (school_id mismatch)', {
        transactionId: event.data?.object?.id,
        metaSchoolId,
        projectId,
      })
      res.status(200).send('ok (other school)')
      return
    }

    // 4. Read current subscription to compute new deadline
    const subRef = db.doc('ecole/subscription')
    const snap = await subRef.get()
    const current = snap.exists
      ? (snap.data() as {
          deadline?: Timestamp
          monthsPerPayment?: number
          hasRequestedUnlock?: boolean
        })
      : {}

    const monthsToAdd =
      current.monthsPerPayment ??
      Number(process.env.SUBSCRIPTION_MONTHS_PER_PAYMENT ?? '1') ??
      1

    const now = Timestamp.now()
    const newDeadline = computeNewDeadline(current.deadline, now, monthsToAdd)

    // 5. Server-side write. The Firestore rule (to be deployed
    //    alongside this function) restricts `deadline` writes to
    //    this service account. Client admins can only write the
    //    `hasRequestedUnlock` field.
    await subRef.set(
      {
        deadline: newDeadline,
        isManualLock: false,
        hasRequestedUnlock: false,
        lastPaymentAt: now,
        lastPaymentAmount: event.data?.object?.amount ?? null,
        lastPaymentReference: event.data?.object?.reference ?? null,
        lastPaymentTransactionId: event.data?.object?.id ?? null,
        paymentCount: FieldValue.increment(1),
      },
      { merge: true }
    )

    logger.info('fedapayWebhook: deadline extended', {
      newDeadlineISO: newDeadline.toDate().toISOString(),
      monthsAdded: monthsToAdd,
    })

    res.status(200).send('ok')
  }
)

/**
 * Scheduled subscription reminder.
 *
 * Runs every day at 00:00 Africa/Porto-Novo (UTC+1). For each
 * school, checks the subscription deadline against today's date:
 *
 *   - 14 days before  → friendly heads-up to admin
 *   - 7  days before  → urgent reminder
 *   - 3  days before  → last-chance reminder
 *   - Overdue         → escalating reminder while in grace period
 *
 * Idempotency: writes a `lastReminderSent` field on the subscription
 * doc recording which reminder-day was last triggered (e.g. "d7").
 * Same-day re-runs skip if the flag already matches today's tier.
 * This protects against accidental double-runs (e.g. manual invocation
 * during debugging) sending duplicate emails.
 *
 * Finding the admin email: queries /professeurs/{uid} where
 * role == 'admin', picks the first one, uses its `email` field.
 * If no admin exists (should never happen in a bootstrapped school),
 * logs a warning and skips.
 *
 * Cost profile at 10 schools:
 *   - 1 invocation/day × 365 = 365 invocations/year (invocations are free up to 2M/mo)
 *   - Firestore reads: ~4 per school per run = 40 reads/day × 365 = 14k reads/year (negligible)
 *   - Emails sent: ~4 per school per year × 10 = 40 emails/year (well below any provider's free tier)
 * Effectively free.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderSubscriptionReminder } from '../lib/email/templates/subscriptionReminder.js'
import { isProbablyValidEmail } from '../lib/email/format.js'

// ─── Tier decision ──────────────────────────────────────────

type ReminderTier = 'd14' | 'd7' | 'd3' | 'overdue' | null

function classifyDeadline(deadline: Date, now: Date): ReminderTier {
  const msPerDay = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((deadline.getTime() - now.getTime()) / msPerDay)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 14) return 'd14'
  if (diffDays === 7) return 'd7'
  if (diffDays === 3) return 'd3'
  return null
}

/**
 * For overdue schools, we don't want to email daily forever. Once a
 * week while in grace period (3 days), then stop (admin will be
 * locked out anyway and needs to pay through LockedPage, not email).
 *
 * Strategy: for overdue, only send if the deadline was EXACTLY N days
 * ago where N ∈ {0, 1, 2, 3}. After that, LockedPage takes over.
 */
function shouldEmailOverdue(deadline: Date, now: Date): boolean {
  const msPerDay = 24 * 60 * 60 * 1000
  const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / msPerDay)
  return daysOverdue >= 0 && daysOverdue <= 3
}

// ─── Main ───────────────────────────────────────────────────

export const subscriptionReminder = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const now = new Date()
    logger.info('subscriptionReminder: run start', { now: now.toISOString() })

    // 1. Read the school's subscription doc
    const subRef = db.doc('ecole/subscription')
    const subSnap = await subRef.get()
    if (!subSnap.exists) {
      logger.warn('subscriptionReminder: no subscription doc — skip')
      return
    }

    const sub = subSnap.data() as {
      deadline?: Timestamp
      lastReminderSent?: string // e.g. "d7"
      lastReminderDate?: Timestamp
    }

    const deadline = sub.deadline?.toDate?.()
    if (!deadline) {
      logger.warn('subscriptionReminder: no deadline set — skip')
      return
    }

    const tier = classifyDeadline(deadline, now)
    if (tier === null) {
      logger.info('subscriptionReminder: not a reminder day', {
        daysRemaining: Math.floor(
          (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        ),
      })
      return
    }

    // Overdue special case: only send up to 3 days overdue
    if (tier === 'overdue' && !shouldEmailOverdue(deadline, now)) {
      logger.info('subscriptionReminder: overdue beyond grace — skip (LockedPage handles)')
      return
    }

    // 2. Idempotency — skip if already sent today
    const todayKey = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const lastKey = sub.lastReminderSent
    const lastDate = sub.lastReminderDate?.toDate?.().toISOString().slice(0, 10)
    if (lastKey === tier && lastDate === todayKey) {
      logger.info('subscriptionReminder: already sent today — skip', { tier })
      return
    }

    // 3. Read school config for display name
    const configSnap = await db.doc('ecole/config').get()
    const schoolName =
      (configSnap.exists &&
        (configSnap.data()?.['nom'] as string | undefined)) ||
      'Votre école'

    // 4. Find an admin email
    const adminsSnap = await db
      .collection('professeurs')
      .where('role', '==', 'admin')
      .limit(5)
      .get()

    const adminEmails: string[] = []
    adminsSnap.docs.forEach((d) => {
      const e = d.data()['email'] as string | undefined
      if (e && isProbablyValidEmail(e)) adminEmails.push(e)
    })

    if (adminEmails.length === 0) {
      logger.warn('subscriptionReminder: no admin email found — skip')
      return
    }

    // 5. Compute days remaining for the template
    const daysRemaining = Math.floor(
      (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    )

    // Use the primary domain of the current Firebase project as the
    // payment URL. Read from env; default to placeholder that admin
    // can recognize if unset.
    const paymentUrl =
      process.env.SCHOOL_APP_URL ??
      `https://${process.env.GCLOUD_PROJECT ?? 'your-school'}.web.app`

    const { subject, html, text } = renderSubscriptionReminder({
      schoolName,
      deadline,
      daysRemaining,
      paymentUrl,
    })

    // 6. Send to all admin emails (most schools have 1; future-proof for several)
    for (const to of adminEmails) {
      const res = await sendEmail({
        to,
        subject,
        html,
        text,
        tag: `subscription-reminder-${tier}`,
      })
      if (!res.ok) {
        logger.error('subscriptionReminder: send failed', { to, error: res.error })
      }
    }

    // 7. Mark sent
    await subRef.set(
      {
        lastReminderSent: tier,
        lastReminderDate: Timestamp.fromDate(now),
      },
      { merge: true }
    )

    logger.info('subscriptionReminder: complete', {
      tier,
      recipients: adminEmails.length,
      schoolName,
      daysRemaining,
    })
  }
)

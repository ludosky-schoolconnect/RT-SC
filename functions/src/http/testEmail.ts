/**
 * testEmail — smoke-test endpoint for the email pipeline.
 *
 * Usage:
 *   curl -X POST \
 *     "https://us-central1-<schoolId>.cloudfunctions.net/testEmail" \
 *     -H "Content-Type: application/json" \
 *     -d '{"to":"you@example.com","secret":"<SAASMASTER_SECRET>"}'
 *
 * If configured correctly, you receive a test email in a few
 * seconds. Use this AFTER deploying the functions for the first
 * time to confirm:
 *   - RESEND_API_KEY is set correctly
 *   - EMAIL_FROM is verified in Resend (or using the sandbox address)
 *   - Email delivery actually works end-to-end
 *
 * Security: gated by a shared secret (env var TESTEMAIL_SECRET).
 * Set it with:
 *   firebase functions:secrets:set TESTEMAIL_SECRET --project <id>
 * Without the secret, the endpoint rejects all POSTs. A prod-only
 * setup can simply not set the secret and this endpoint becomes
 * unreachable.
 *
 * After you've verified delivery works, you can delete this function
 * if you want — it serves no production purpose.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P } from '../lib/email/layout.js'
import { isProbablyValidEmail } from '../lib/email/format.js'

const TESTEMAIL_SECRET = defineSecret('TESTEMAIL_SECRET')

export const testEmail = onRequest(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY, TESTEMAIL_SECRET],
    cors: false,
    timeoutSeconds: 30,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed')
      return
    }

    let body: { to?: string; secret?: string } = {}
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    } catch {
      res.status(400).send('invalid json')
      return
    }

    if (!body.secret || body.secret !== TESTEMAIL_SECRET.value()) {
      logger.warn('testEmail: secret mismatch or missing')
      res.status(401).send('unauthorized')
      return
    }

    const to = body.to?.trim()
    if (!to || !isProbablyValidEmail(to)) {
      res.status(400).send('missing or invalid `to` address')
      return
    }

    const html = renderEmailShell({
      body: `
        ${H1('Test de livraison')}
        ${P('Si vous recevez ce message, la configuration email de SchoolConnect fonctionne correctement.')}
        ${P('Vous pouvez maintenant activer les triggers qui enverront les emails automatiques (abonnement, pré-inscription, etc.).')}
      `,
      preheader: 'Test email — configuration validée',
      signature: 'SchoolConnect — Diagnostic',
    })

    const result = await sendEmail({
      to,
      subject: 'SchoolConnect — test email',
      html,
      text: 'Si vous recevez ce message, la configuration email fonctionne correctement.',
      tag: 'test-email',
    })

    if (!result.ok) {
      res.status(500).json({ ok: false, error: result.error })
      return
    }

    res.status(200).json({ ok: true, messageId: result.messageId })
  }
)

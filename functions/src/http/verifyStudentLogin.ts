/**
 * verifyStudentLogin — HTTPS callable for student PIN verification.
 *
 * Accepts { classeId, eleveId, pin }, validates the PIN server-side via
 * admin SDK (the client never sees the stored PIN), and returns a short-lived
 * HMAC-signed token on success.
 *
 * Rate limited to 8 attempts per identifier per 15 min. Excessive failures
 * short-circuit with a `resource-exhausted` code.
 *
 * Client-side flow (EleveLogin.tsx):
 *   1. Student selects class + student, enters PIN
 *   2. Client calls verifyStudentLogin({ classeId, eleveId, pin })
 *   3. On success → signInAnonymously, stamp active_session_uid, navigate
 *   4. On 'unauthenticated' → "Code PIN incorrect"
 *   5. On 'resource-exhausted' → "Trop de tentatives"
 *   6. On 'unavailable' / 'not-found' (pre-Blaze) → client-side fallback
 *
 * This is the student equivalent of verifyProfLogin. Shipped dormant;
 * activates on Blaze deploy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'
import {
  HMAC_SECRET,
  signToken,
  checkRateLimit,
  clearRateLimit,
} from '../lib/passkey.js'

interface StudentLoginInput {
  classeId?: string
  eleveId?: string
  pin?: string
}

interface EleveDoc {
  codePin?: string
  nom?: string
}

export const verifyStudentLogin = onCall(
  {
    region: 'us-central1',
    secrets: [HMAC_SECRET],
    timeoutSeconds: 30,
    cors: true,
  },
  async (req) => {
    const { classeId, eleveId, pin } = (req.data ?? {}) as StudentLoginInput

    if (
      typeof classeId !== 'string' ||
      typeof eleveId !== 'string' ||
      typeof pin !== 'string'
    ) {
      throw new HttpsError('invalid-argument', 'classeId, eleveId and pin are required')
    }

    const cleanClasseId = classeId.trim()
    const cleanEleveId = eleveId.trim()
    const cleanPin = pin.trim().toUpperCase()

    if (!cleanClasseId || !cleanEleveId || !cleanPin) {
      throw new HttpsError('invalid-argument', 'classeId, eleveId and pin cannot be empty')
    }

    const rateKey = req.auth?.uid ?? req.rawRequest.ip ?? 'unknown'
    const rl = checkRateLimit(rateKey)
    if (!rl.allowed) {
      logger.warn('verifyStudentLogin: rate-limited', { rateKey })
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives. Réessayez dans quelques minutes.'
      )
    }

    const eleveRef = db.doc(`classes/${cleanClasseId}/eleves/${cleanEleveId}`)
    const eleveSnap = await eleveRef.get()

    if (!eleveSnap.exists) {
      throw new HttpsError('unauthenticated', 'Code PIN incorrect.')
    }

    const eleve = eleveSnap.data() as EleveDoc

    if (!eleve.codePin) {
      throw new HttpsError(
        'failed-precondition',
        "Aucun PIN configuré pour cet élève. Contactez l'administration."
      )
    }

    if (eleve.codePin.toUpperCase() !== cleanPin) {
      throw new HttpsError('unauthenticated', 'Code PIN incorrect.')
    }

    clearRateLimit(rateKey)

    const token = signToken({ uid: cleanEleveId, v: 1 })

    logger.info('verifyStudentLogin: success', { classeId: cleanClasseId, eleveId: cleanEleveId })

    return {
      token,
      eleveId: cleanEleveId,
      eleveNom: eleve.nom ?? '',
      expiresAt: Date.now() + 12 * 60 * 60_000,
    }
  }
)

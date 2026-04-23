/**
 * findEleveIdentity — HTTPS callable for pre-authentication
 * éleve/parent identity lookup.
 *
 * Replaces two existing client-side collectionGroup queries that
 * currently run unauthenticated against `allow read: if true` on
 * the eleves collectionGroup:
 *
 *   1. EleveSignup.tsx — student types their full name + gender +
 *      birth date, we look up their éleve doc to find their classeId
 *      and PIN presence. Today this runs as an anonymous client query
 *      that can scan the whole /eleves tree.
 *
 *   2. ParentLogin.tsx — parent enters their PRNT-XXXXXXXX passkey,
 *      we find the matching éleve. Same unauthenticated scan.
 *
 * Once E2 wires the client to call this function instead, and E3
 * tightens the eleves collectionGroup rule to `request.auth != null
 * && isStaff()`, unauthenticated clients can no longer scan /eleves
 * directly — they'll go through this server-side lookup.
 *
 * Returns ONLY `{ eleveId, classeId }` on success, or null on no
 * match. Deliberately does NOT return the éleve's personal data
 * (nom, date_naissance, etc.) — the client then does a direct
 * document read on /classes/{classeId}/eleves/{eleveId} which goes
 * through the normal per-doc read rule (and at that point the
 * client has already anon-signed-in to qualify). That pattern
 * preserves the existing rule structure while closing the
 * collectionGroup scan hole.
 *
 * Two lookup modes selected via `mode` field:
 *
 *   mode: 'byIdentity' → requires { nom, genre, dateNaissance }
 *     For new éleve signup. nom is case-sensitive exact match
 *     (Firestore is case-sensitive on string equality); client
 *     should preserve whatever case the éleve doc uses.
 *
 *   mode: 'byParentPasskey' → requires { passkey }
 *     For parent login. Matches eleve.passkeyParent field.
 *
 * Rate limit: 10 attempts per IP per 15 min (more generous than the
 * verify-passkey limit because typos are common on mobile).
 *
 * This is Session E1b. Dormant until Blaze deploy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'

interface InputBase {
  mode: 'byIdentity' | 'byParentPasskey'
}
interface ByIdentityInput extends InputBase {
  mode: 'byIdentity'
  nom: string
  genre: 'M' | 'F'
  dateNaissance: string // ISO YYYY-MM-DD as stored
}
interface ByPasskeyInput extends InputBase {
  mode: 'byParentPasskey'
  passkey: string
}
type Input = ByIdentityInput | ByPasskeyInput

// In-function rate limiter. Same-shape as lib/passkey's, but
// separate state + more generous threshold.
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, number[]>()

function checkRate(key: string): boolean {
  const now = Date.now()
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_ATTEMPTS) return false
  list.push(now)
  attempts.set(key, list)
  return true
}

export const findEleveIdentity = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    cors: true,
  },
  async (req) => {
    const data = req.data as Input
    if (!data || typeof data.mode !== 'string') {
      throw new HttpsError('invalid-argument', 'mode is required')
    }

    const rateKey = req.auth?.uid ?? req.rawRequest.ip ?? 'unknown'
    if (!checkRate(rateKey)) {
      logger.warn('findEleveIdentity: rate-limited', { rateKey })
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives. Réessayez dans quelques minutes.'
      )
    }

    // ─── Mode 1: by identity (éleve signup) ─────────────────
    if (data.mode === 'byIdentity') {
      const { nom, genre, dateNaissance } = data
      if (
        typeof nom !== 'string' ||
        typeof genre !== 'string' ||
        typeof dateNaissance !== 'string' ||
        !nom.trim() ||
        !dateNaissance.trim()
      ) {
        throw new HttpsError(
          'invalid-argument',
          'nom, genre, and dateNaissance are required'
        )
      }
      if (genre !== 'M' && genre !== 'F') {
        throw new HttpsError('invalid-argument', 'genre must be M or F')
      }

      try {
        const snap = await db
          .collectionGroup('eleves')
          .where('nom', '==', nom.trim())
          .where('genre', '==', genre)
          .where('date_naissance', '==', dateNaissance.trim())
          .limit(1)
          .get()

        if (snap.empty) return { match: null }

        const doc = snap.docs[0]
        const classeId = doc.ref.parent.parent?.id
        if (!classeId) return { match: null }

        return {
          match: {
            eleveId: doc.id,
            classeId,
          },
        }
      } catch (err) {
        logger.error('findEleveIdentity: byIdentity query failed', {
          err: (err as Error).message,
        })
        throw new HttpsError('internal', 'Lookup failed')
      }
    }

    // ─── Mode 2: by parent passkey ──────────────────────────
    if (data.mode === 'byParentPasskey') {
      const { passkey } = data
      if (typeof passkey !== 'string' || !passkey.trim()) {
        throw new HttpsError('invalid-argument', 'passkey is required')
      }

      try {
        const snap = await db
          .collectionGroup('eleves')
          .where('passkeyParent', '==', passkey.trim().toUpperCase())
          .limit(1)
          .get()

        if (snap.empty) return { match: null }

        const doc = snap.docs[0]
        const classeId = doc.ref.parent.parent?.id
        if (!classeId) return { match: null }

        return {
          match: {
            eleveId: doc.id,
            classeId,
          },
        }
      } catch (err) {
        logger.error('findEleveIdentity: byParentPasskey query failed', {
          err: (err as Error).message,
        })
        throw new HttpsError('internal', 'Lookup failed')
      }
    }

    throw new HttpsError('invalid-argument', 'unknown mode')
  }
)

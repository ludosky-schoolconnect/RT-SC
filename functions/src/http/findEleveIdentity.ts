/**
 * findEleveIdentity — HTTPS callable for pre-authentication
 * éleve/parent identity lookup.
 *
 * Replaces two existing client-side collectionGroup queries that
 * currently run unauthenticated against `allow read: if true` on
 * the eleves collectionGroup:
 *
 *   1. EleveSignup.tsx — student types their full name + gender +
 *      birth date; we look up their éleve doc to find their
 *      classeId and the class passkey to display.
 *
 *   2. ParentLogin.tsx — parent enters their PRNT-XXXXXXXX passkey;
 *      we find the matching éleve + class.
 *
 * ─── Session E3 expansion ───────────────────────────────────
 *
 * Return payload expanded from just `{ eleveId, classeId }` to
 * include the follow-up fields the clients need (nom, genre,
 * classePasskey, classeNom). Rationale: once we tighten the
 * /{path=**}/eleves/{eleveId} read rule to auth-required, the
 * client's post-callable direct getDoc on the éleve path would
 * fail for unauthenticated users (éleve signup and parent login
 * run before anon-sign-in). Returning all the minimal fields from
 * the server-side lookup (admin SDK, bypasses rules) removes the
 * need for that follow-up read entirely.
 *
 * What's still NOT returned:
 *   - codePin — éleve's PIN is read from the éleve doc AFTER anon
 *     sign-in in the PIN step. That read happens authenticated and
 *     will continue to work under the tightened rule.
 *   - passkeyParent — sensitive; never sent to anyone who didn't
 *     already supply it.
 *
 * Rate limit: 10 attempts per IP per 15 min — more generous than
 * the prof-login limit because typos are common on mobile.
 *
 * This is Session E1b (expanded in E3). Dormant until Blaze deploy.
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

interface MatchPayload {
  eleveId: string
  classeId: string
  /** Session E3 additions — consumed by the client without needing
   *  a follow-up éleve doc read. */
  nom: string
  genre: 'M' | 'F'
  /** Classe passkey — for student signup's "write this down" step. */
  classePasskey: string
  /** Human-readable class name ("6ème A", etc.) via nomClasse. */
  classeNom: string
}

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

/**
 * Server-side version of nomClasse — mirrors the client's lib/benin.ts
 * logic for rendering class names. Kept inline to avoid pulling the
 * client lib into Cloud Functions; structure is simple enough.
 *
 * Accepts cycle, niveau, serie, salle from a /classes/{id} doc.
 * Matches the client output exactly so the callable returns what the
 * UI would have otherwise rendered.
 */
function nomClasse(c: {
  niveau?: string
  serie?: string | null
  salle?: string
}): string {
  const niveau = c.niveau ?? ''
  const serie = c.serie ?? ''
  const salle = c.salle ?? ''
  const head = serie ? `${niveau} ${serie}` : niveau
  return salle ? `${head} ${salle}` : head
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

    // Common post-match step — pulls the classe doc and builds the
    // full payload. Returns null if the classe is missing (data
    // integrity problem, not an expected path).
    async function buildPayload(eleveDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<MatchPayload | null> {
      const classeId = eleveDoc.ref.parent.parent?.id
      if (!classeId) return null

      const classeSnap = await db.doc(`classes/${classeId}`).get()
      if (!classeSnap.exists) return null

      const eleve = eleveDoc.data() as {
        nom?: string
        genre?: 'M' | 'F'
      }
      const classe = classeSnap.data() as {
        passkey?: string
        niveau?: string
        serie?: string | null
        salle?: string
      }

      return {
        eleveId: eleveDoc.id,
        classeId,
        nom: eleve.nom ?? '',
        genre: (eleve.genre ?? 'M') as 'M' | 'F',
        classePasskey: classe.passkey ?? '',
        classeNom: nomClasse(classe),
      }
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

        const payload = await buildPayload(snap.docs[0])
        return { match: payload }
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

        const payload = await buildPayload(snap.docs[0])
        return { match: payload }
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

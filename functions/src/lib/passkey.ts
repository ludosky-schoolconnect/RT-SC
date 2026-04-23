/**
 * Passkey helpers — shared by the prof-login verification flow.
 *
 * Three things live here:
 *
 *   1. generateLoginPasskey() — a cryptographically strong 6-digit code.
 *      Not a UUID because profs have to TYPE it on their phone. Six
 *      digits is enough entropy (1 in 1M) combined with the rate-limit
 *      below to make brute force impractical.
 *
 *   2. signToken() / verifyToken() — HMAC-SHA256 signed short tokens
 *      the callable returns after a successful passkey check. The
 *      client stores the token in sessionStorage and includes it on
 *      subsequent actions. 12h TTL. Signed with a server-only secret,
 *      so the client can't forge its own.
 *
 *   3. A simple in-memory rate limiter keyed by IP address. Blocks
 *      more than 5 failed passkey attempts per 15-minute window. OK
 *      for a single-instance low-traffic function; if you scale to
 *      multiple concurrent instances (unlikely at this scale), swap
 *      for a Firestore-backed counter. Documented in doc-comment on
 *      the limiter.
 *
 * Secrets required at runtime:
 *   - HMAC_SECRET — a random ≥ 32-byte string. Set once via:
 *       firebase functions:secrets:set HMAC_SECRET
 *     Use the same secret for every school (schools share token format).
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { defineSecret } from 'firebase-functions/params'

export const HMAC_SECRET = defineSecret('HMAC_SECRET')

// ─── Passkey generation ─────────────────────────────────────

/**
 * Returns a 6-digit numeric passkey as a string. Uses crypto.randomInt
 * for cryptographic quality (Math.random is insufficient — a prof
 * could predict future passkeys from leaked ones).
 *
 * Leading zeros are preserved (e.g. "042813") because the client
 * compares as strings.
 */
export function generateLoginPasskey(): string {
  const n = randomInt(0, 1_000_000) // [0, 1000000)
  return n.toString().padStart(6, '0')
}

// ─── HMAC token sign / verify ───────────────────────────────

interface TokenPayload {
  uid: string
  /** Passkey version at time of issue — invalidated on rotation. */
  v: number
  /** Issued-at (ms). */
  iat: number
  /** Expires-at (ms). */
  exp: number
}

/**
 * Sign a token payload with HMAC-SHA256. Format: `<b64url-payload>.<b64url-sig>`.
 * Equivalent spirit to a JWT but we avoid the full JWT library since
 * we don't need alg negotiation or claims introspection.
 */
export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, ttlMs = 12 * 60 * 60_000): string {
  const now = Date.now()
  const full: TokenPayload = { ...payload, iat: now, exp: now + ttlMs }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = createHmac('sha256', HMAC_SECRET.value())
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}

export interface VerifiedToken {
  ok: boolean
  payload?: TokenPayload
  reason?: 'malformed' | 'bad-signature' | 'expired'
}

/**
 * Verify a token string. Returns ok:true with payload on success.
 * Constant-time signature compare to prevent timing-oracle attacks.
 */
export function verifyToken(token: string): VerifiedToken {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts

  const expectedSig = createHmac('sha256', HMAC_SECRET.value())
    .update(body)
    .digest('base64url')

  // timingSafeEqual requires equal-length buffers; short-circuit length mismatch.
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'bad-signature' }
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'bad-signature' }

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, payload }
}

// ─── Rate limiter (in-memory, per-instance) ─────────────────

/**
 * Single-instance in-memory rate limiter for login attempts. Map
 * keyed by IP (or caller identifier) → list of attempt timestamps
 * within the window. Acceptable for low traffic because Cloud
 * Functions at our scale stay on one warm instance most of the time.
 *
 * If the instance is cold and the attacker hits exactly on rotation,
 * they get a fresh window — still bounded by the next window's 5
 * attempts. Not a hard defense, just a brake.
 *
 * Swap to Firestore-backed counter if abuse appears in logs.
 */
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 5
const attempts = new Map<string, number[]>()

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_ATTEMPTS) {
    const oldest = list[0]
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) }
  }
  list.push(now)
  attempts.set(key, list)
  return { allowed: true }
}

/** Clear on successful login so the user doesn't accidentally hit the limit. */
export function clearRateLimit(key: string): void {
  attempts.delete(key)
}

/**
 * RT-SC · Student PIN verification helper.
 *
 * Mirrors the pattern in profPasskey.ts but for student login.
 *
 * ─── Flow ────────────────────────────────────────────────────
 *
 * 1. Student enters PIN on the login form
 * 2. Form calls verifyStudentPin(classeId, eleveId, pin)
 *    - Calls verifyStudentLogin Cloud Function (server-side PIN check)
 *    - On success, returns { ok: true }
 * 3. On CF failure with 'not-found' / 'unavailable' (pre-Blaze):
 *    - Falls back to reading the eleve doc client-side if
 *      devFallbackEnabled !== false in /ecole/securite
 *
 * The fallback is weaker (PIN readable from client Firestore query)
 * but keeps the app testable before Blaze is activated. Once functions
 * are deployed, the fallback is dead code.
 */

import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { functions } from '@/firebase'

const FALLBACK_ERRORS = new Set([
  'functions/not-found',
  'functions/unavailable',
  'functions/internal',
])

export type StudentPinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'rate-limited' | 'not-configured' | 'network' }

interface VerifyStudentInput {
  classeId: string
  eleveId: string
  pin: string
}

/**
 * Verify a student PIN server-side, with automatic client-side fallback
 * when the Cloud Function is not yet deployed.
 */
export async function verifyStudentPin(
  classeId: string,
  eleveId: string,
  pin: string
): Promise<StudentPinVerifyResult> {
  const cleanPin = pin.trim().toUpperCase()
  if (!cleanPin) return { ok: false, reason: 'invalid' }

  try {
    const call = httpsCallable<VerifyStudentInput, { token: string }>(
      functions,
      'verifyStudentLogin'
    )
    await call({ classeId, eleveId, pin: cleanPin })
    return { ok: true }
  } catch (err) {
    const errCode = (err as FunctionsError)?.code
    if (errCode === 'functions/unauthenticated') {
      return { ok: false, reason: 'invalid' }
    }
    if (errCode === 'functions/resource-exhausted') {
      return { ok: false, reason: 'rate-limited' }
    }
    if (errCode === 'functions/failed-precondition') {
      return { ok: false, reason: 'not-configured' }
    }
    // Pre-Blaze or functions not deployed — fall back to client-side check
    if (FALLBACK_ERRORS.has(errCode ?? '')) {
      return verifyWithClientSide(classeId, eleveId, cleanPin)
    }
    console.error('[studentPasskey] verify error:', err)
    return { ok: false, reason: 'network' }
  }
}

/**
 * Pre-Blaze fallback: read the PIN from the eleve doc directly.
 * Only runs when the Cloud Function is unreachable AND
 * devFallbackEnabled !== false in /ecole/securite.
 */
async function verifyWithClientSide(
  classeId: string,
  eleveId: string,
  pin: string
): Promise<StudentPinVerifyResult> {
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const { db } = await import('@/firebase')

    // Check if fallback is explicitly disabled by SaaSMaster
    const securiteSnap = await getDoc(doc(db, 'ecole', 'securite'))
    if (securiteSnap.exists() && securiteSnap.data().studentFallbackEnabled === false) {
      console.info('[studentPasskey] client-side fallback disabled by SaaSMaster')
      return { ok: false, reason: 'network' }
    }

    const eleveSnap = await getDoc(doc(db, 'classes', classeId, 'eleves', eleveId))
    if (!eleveSnap.exists()) return { ok: false, reason: 'invalid' }

    const storedPin = ((eleveSnap.data() as { codePin?: string }).codePin ?? '').toUpperCase()
    if (!storedPin) return { ok: false, reason: 'not-configured' }

    return storedPin === pin ? { ok: true } : { ok: false, reason: 'invalid' }
  } catch (err) {
    console.error('[studentPasskey] fallback error:', err)
    return { ok: false, reason: 'network' }
  }
}

export function studentPinErrorMessage(
  reason: Exclude<StudentPinVerifyResult, { ok: true }>['reason']
): string {
  switch (reason) {
    case 'invalid':
      return 'Code PIN incorrect.'
    case 'rate-limited':
      return 'Trop de tentatives. Réessayez dans quelques minutes.'
    case 'not-configured':
      return "Aucun PIN configuré pour cet élève. Contactez l'administration."
    case 'network':
      return 'Erreur réseau — réessayez.'
  }
}

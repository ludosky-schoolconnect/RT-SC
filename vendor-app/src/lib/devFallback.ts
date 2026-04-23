/**
 * Vendor · Dev fallback toggle helper.
 *
 * Controls the `devFallbackEnabled` flag on /ecole/securite in a
 * school's Firestore. When true (or missing — safe default), the
 * main app falls back to the school-wide passkey from /ecole/securite
 * when Cloud Functions are unavailable (pre-Blaze). When explicitly
 * false, the fallback is skipped and the login gate requires Blaze.
 *
 * Written by SaaSMaster — Firestore rules allow writes to /ecole/**
 * for SaaSMaster without the school-lock constraint.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'

export async function readDevFallbackEnabled(db: Firestore): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'ecole', 'securite'))
    if (!snap.exists()) return true
    const data = snap.data()
    return data.devFallbackEnabled !== false
  } catch {
    return true
  }
}

export async function setDevFallbackEnabled(
  db: Firestore,
  enabled: boolean
): Promise<void> {
  await setDoc(
    doc(db, 'ecole', 'securite'),
    { devFallbackEnabled: enabled },
    { merge: true }
  )
}

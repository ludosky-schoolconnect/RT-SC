/**
 * Vendor · Multi-Firebase-app helper.
 *
 * Unlike a normal web app that uses ONE Firebase project, the vendor
 * tool talks to MANY schools, each with its own Firebase project. Each
 * time the vendor picks a school we need a fresh Firebase app instance
 * bound to that project's config.
 *
 * Strategy = "A" (per user decision): we tear down the previous app
 * completely when switching schools. Zero risk of cross-school data
 * leaks; slightly slower switch (200-500ms) which is fine for human
 * pace. Safer than keeping stale connections around.
 *
 * Firebase JS SDK supports this natively:
 *   - initializeApp(config, name) — named app instance
 *   - getAuth(app), getFirestore(app) — scoped to that app
 *   - app.delete() — tears down listeners + caches
 *
 * We use name="sc-vendor" (a singleton slot) so there's only ever
 * ONE active Firebase app at a time in the vendor context.
 */

import {
  initializeApp,
  deleteApp,
  getApps,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const VENDOR_APP_NAME = 'sc-vendor'

export interface VendorFirebase {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  projectId: string
}

/**
 * Create a fresh Firebase app for a school's config. If an app with
 * the same name exists, tear it down first (we only ever have one
 * active connection at a time).
 */
export async function connectToSchool(
  config: FirebaseOptions
): Promise<VendorFirebase> {
  // Tear down any existing vendor app. Safe to call if none exists
  // (getApps().find returns undefined and we skip).
  const existing = getApps().find((a) => a.name === VENDOR_APP_NAME)
  if (existing) {
    try {
      await deleteApp(existing)
    } catch (err) {
      // If deleteApp fails, log and continue — worst case we get a
      // warning from Firebase about reinitializing.
      console.warn('[vendor] deleteApp failed:', err)
    }
  }

  const app = initializeApp(config, VENDOR_APP_NAME)
  const auth = getAuth(app)
  const db = getFirestore(app)

  return {
    app,
    auth,
    db,
    projectId: config.projectId ?? 'unknown',
  }
}

/**
 * Tear down the current vendor app without replacing it. Called on
 * "Se déconnecter" / "Changer d'école" to ensure no listeners survive
 * into the next session.
 */
export async function disconnectFromSchool(): Promise<void> {
  const existing = getApps().find((a) => a.name === VENDOR_APP_NAME)
  if (!existing) return
  try {
    await deleteApp(existing)
  } catch (err) {
    console.warn('[vendor] disconnectFromSchool failed:', err)
  }
}

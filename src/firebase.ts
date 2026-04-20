/**
 * RT-SC · Firebase initialization.
 *
 * Differences vs legacy:
 * - Persistent IndexedDB cache enabled at init → 0-network reads on repeat opens
 * - Multi-tab manager so the cache works when several tabs are open
 * - No CDN URLs hardcoded — uses installed `firebase` package
 *
 * Env vars (set in .env.local):
 *   VITE_FB_API_KEY
 *   VITE_FB_AUTH_DOMAIN
 *   VITE_FB_PROJECT_ID
 *   VITE_FB_STORAGE_BUCKET
 *   VITE_FB_MESSAGING_SENDER_ID
 *   VITE_FB_APP_ID
 *   VITE_FB_DATABASE_URL  (optional, only if using RTDB)
 */

import { initializeApp, getApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  type DocumentReference,
  type CollectionReference,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
  databaseURL: import.meta.env.VITE_FB_DATABASE_URL,
}

// Initialize once (HMR-safe)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

export const auth = getAuth(app)

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

export const storage = getStorage(app)

// ─────────────────────────────────────────────────────────────
// Path → Firestore ref helpers
// Used together with `lib/firestore-keys.ts` so call sites
// remain compact: `docRef(eleveDoc(cid, eid))`
// ─────────────────────────────────────────────────────────────

export function docRef(path: string): DocumentReference {
  return doc(db, path)
}

export function colRef(path: string): CollectionReference {
  return collection(db, path)
}

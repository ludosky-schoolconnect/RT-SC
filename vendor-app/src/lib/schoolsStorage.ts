/**
 * Vendor · School connections storage.
 *
 * Saved schools live in browser localStorage under a single key. Each
 * school stores the Firebase web config (public info that wouldn't
 * compromise anything if copied — it's meant to be embedded in the
 * school's own app) plus a display name and last-used timestamp.
 *
 * We deliberately do NOT save credentials (email, password). The
 * vendor enters those on every login. That's the single layer of
 * authentication that matters — someone stealing this list still
 * can't touch any school without YOUR Firebase Auth password.
 *
 * Storage is synchronous and small (Firebase configs are ~500 bytes
 * each, well under localStorage's 5MB limit). We can comfortably
 * store 100+ schools.
 */

import type { FirebaseOptions } from 'firebase/app'

const STORAGE_KEY = 'sc_vendor_schools_v1'

export interface SavedSchool {
  /** Stable ID — derived from the Firebase projectId */
  id: string
  /** Display name, editable by the vendor ("CEG HOUETO") */
  name: string
  /** Firebase web config — safe to store, these keys are public */
  config: FirebaseOptions
  /** Millisecond timestamp of last successful connection */
  lastUsed?: number
  /**
   * What this Firebase project represents in the SchoolConnect
   * ecosystem:
   *   - 'school' (default): a per-school Firebase project that hosts
   *     one school's Firestore, Auth, classes, students, bulletins…
   *   - 'hub': the common landing-page Firebase project that holds
   *     /school_codes and /cms/about (shared across all schools).
   *     Routed to a dedicated HubCommandCenter on connect, since the
   *     normal subscription management UI doesn't apply.
   * Missing/undefined means 'school' (backward compat with saved
   * entries from before this field existed).
   */
  role?: 'school' | 'hub'
}

/**
 * Read saved schools from localStorage. Returns empty array on first
 * run or if the stored data is corrupt.
 */
export function loadSavedSchools(): SavedSchool[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Basic validation — each entry needs at minimum an id + config
    return parsed.filter(
      (s): s is SavedSchool =>
        typeof s === 'object' &&
        s !== null &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.config === 'object' &&
        s.config !== null
    )
  } catch {
    return []
  }
}

function save(schools: SavedSchool[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schools))
}

/**
 * Add OR update a school. Uniqueness is by id (which we derive from
 * the projectId). If a school with the same id already exists, we
 * replace it — lets the vendor paste a fresh config to update an
 * existing school without creating a duplicate.
 */
export function upsertSchool(school: SavedSchool): SavedSchool[] {
  const current = loadSavedSchools()
  const filtered = current.filter((s) => s.id !== school.id)
  filtered.push(school)
  // Sort by lastUsed descending so the most recently used appear first
  filtered.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  save(filtered)
  return filtered
}

export function removeSchool(id: string): SavedSchool[] {
  const current = loadSavedSchools()
  const filtered = current.filter((s) => s.id !== id)
  save(filtered)
  return filtered
}

export function markSchoolUsed(id: string): SavedSchool[] {
  const current = loadSavedSchools()
  const updated = current.map((s) =>
    s.id === id ? { ...s, lastUsed: Date.now() } : s
  )
  save(updated)
  return updated
}

/**
 * Parse a Firebase config from a pasted blob. Vendors typically copy
 * directly from Firebase Console → project settings, which gives
 * either:
 *
 *   Format 1 (object literal, still has trailing semicolons etc.):
 *     const firebaseConfig = { apiKey: "...", authDomain: "...", ... };
 *
 *   Format 2 (JSON):
 *     { "apiKey": "...", "authDomain": "...", ... }
 *
 *   Format 3 (JS syntax without the `const` prefix):
 *     { apiKey: "...", authDomain: "...", ... }
 *
 * This function accepts all three. It extracts the object expression,
 * converts single-quoted strings to double-quoted, and adds quotes
 * around bare keys — making a JS-style object parseable by JSON.parse.
 */
export function parseFirebaseConfigBlob(
  blob: string
): FirebaseOptions | null {
  const trimmed = blob.trim()
  if (!trimmed) return null

  // Extract the outermost {...} block.
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  let objText = trimmed.substring(firstBrace, lastBrace + 1)

  // Try JSON.parse directly first (covers format 2)
  try {
    const result = JSON.parse(objText) as FirebaseOptions
    if (isValidFirebaseConfig(result)) return result
  } catch {
    // Continue to JS normalization
  }

  // Normalize JS syntax → JSON:
  //   - Single-quoted strings → double-quoted
  //   - Bare keys → quoted keys
  //   - Strip trailing semicolons inside the object
  //   - Remove trailing commas before }
  try {
    // Replace single-quoted string literals with double-quoted. Handles
    // values only — we don't need to worry about apostrophes inside
    // Firebase values since they're URLs and IDs.
    objText = objText.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
    // Quote bare keys: { apiKey: "..." } → { "apiKey": "..." }
    objText = objText.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    // Remove trailing commas before closing braces
    objText = objText.replace(/,\s*}/g, '}')
    const result = JSON.parse(objText) as FirebaseOptions
    if (isValidFirebaseConfig(result)) return result
  } catch {
    return null
  }

  return null
}

function isValidFirebaseConfig(obj: unknown): obj is FirebaseOptions {
  if (typeof obj !== 'object' || obj === null) return false
  const rec = obj as Record<string, unknown>
  // Minimum required fields for Firebase to actually work
  return (
    typeof rec.apiKey === 'string' &&
    typeof rec.projectId === 'string' &&
    typeof rec.authDomain === 'string'
  )
}

/**
 * Derive a stable ID from a Firebase config. Uses the projectId since
 * it's guaranteed unique across Firebase projects.
 */
export function deriveSchoolId(config: FirebaseOptions): string {
  return config.projectId ?? 'unknown-' + Date.now()
}

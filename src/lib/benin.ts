/**
 * RT-SC · Bénin school constants & naming helpers.
 * Translated 1:1 from legacy app.js to keep behavior identical.
 */

import type { Cycle, Niveau, Serie, Genre, Classe } from '@/types/models'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const

export const NIVEAUX_PREMIER: Niveau[] = ['6ème', '5ème', '4ème', '3ème']
export const NIVEAUX_SECOND: Niveau[] = ['2nde', '1ère', 'Terminale']

export const SERIES_LITERAIRES: Serie[] = ['A', 'B']
export const SERIES_SCIENTIFIQUES: Serie[] = ['C', 'D']
export const SERIES_GESTION: Serie[] = ['G1', 'G2', 'G3']
export const SERIES: Serie[] = ['A', 'B', 'C', 'D']

/** Safe alphabet for human-readable codes — no confusing chars (I, O, 0, 1) */
const SAFE_ALPHA_FULL = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const SAFE_ALPHA_NUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DIGITS = '0123456789'

// ─────────────────────────────────────────────────────────────
// Class naming
// ─────────────────────────────────────────────────────────────

const ABREV_NIVEAU: Record<string, string> = {
  Terminale: 'Tle',
  '1ère': '1ère',
  '2nde': '2nde',
}

/**
 * Build the display name of a class.
 * Second cycle with serie: "Tle D1", "1ère C2"
 * Otherwise: "6ème M1"
 */
export function nomClasse(c: Pick<Classe, 'cycle' | 'niveau' | 'serie' | 'salle'>): string {
  if (c.cycle === 'second' && c.serie) {
    const niv = ABREV_NIVEAU[c.niveau] ?? c.niveau
    return `${niv} ${c.serie}${c.salle}`
  }
  return `${c.niveau} ${c.salle}`
}

/**
 * Niveau progression map. Given the current niveau, returns the one
 * a successful élève promotes to. Terminale has no successor (end of
 * secondary — students take the BAC).
 *
 * Shared between the Année tab's class transition flow (admin tool)
 * and the bulletin PDF's annual verdict line. Keeping it here ensures
 * both consumers always agree on the next-level label.
 */
export const NEXT_NIVEAU: Partial<Record<Niveau, Niveau>> = {
  '6ème': '5ème',
  '5ème': '4ème',
  '4ème': '3ème',
  '3ème': '2nde',
  '2nde': '1ère',
  '1ère': 'Terminale',
}

/**
 * Display label for the class an élève is promoted to when admitted.
 * Per the Session 3.1 decision, we keep it to just the niveau and
 * omit the série for second cycle (a student who passes 1ère C moves
 * to "Tle"; the série follows them automatically so re-stating it in
 * the verdict line is redundant).
 *
 * The "classe supérieure" fallback is now defensive only: as of
 * Session 5.2, both the on-screen view and the PDF skip rendering the
 * verdict line entirely for Terminale students (school system has no
 * BAC visibility). So this fallback should never fire in normal use,
 * but stays in place to avoid an empty string in any future caller.
 */
export function nextClasseLabel(niveau: Niveau): string {
  const next = NEXT_NIVEAU[niveau]
  if (!next) return 'classe supérieure'
  return ABREV_NIVEAU[next] ?? next
}

/**
 * Niveaux available for a given cycle.
 */
export function niveauxDuCycle(cycle: Cycle): Niveau[] {
  return cycle === 'premier' ? NIVEAUX_PREMIER : NIVEAUX_SECOND
}

// ─────────────────────────────────────────────────────────────
// Passkey generators
// ─────────────────────────────────────────────────────────────

function pickFrom(alphabet: string, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }
  return out
}

/**
 * Class passkey: "XX-9999"
 * 2 letters from safe alphabet + dash + 4 digits.
 */
export function genererClassePasskey(): string {
  const l1 = SAFE_ALPHA_FULL.charAt(Math.floor(Math.random() * SAFE_ALPHA_FULL.length))
  const l2 = SAFE_ALPHA_FULL.charAt(Math.floor(Math.random() * SAFE_ALPHA_FULL.length))
  const n = 1000 + Math.floor(Math.random() * 9000)
  return `${l1}${l2}-${n}`
}

/**
 * Élève PIN: 6 chars from safe alphanumeric.
 * Used by élève to log in to their own profile after entering class passkey + name.
 */
export function genererCodePin(): string {
  return pickFrom(SAFE_ALPHA_NUMERIC, 6)
}

/**
 * Parent passkey: "PRNT-XXXX-XXXX" — 8 chars from safe alphanumeric, hyphenated.
 * Used by parent to log in via /parent.
 */
export function genererPasskeyParent(): string {
  return `PRNT-${pickFrom(SAFE_ALPHA_NUMERIC, 4)}-${pickFrom(SAFE_ALPHA_NUMERIC, 4)}`
}

/**
 * Prof access passkey (admin sets this): 6 digits.
 * Required during prof signup so random people can't create accounts.
 */
export function genererPasskeyProf(): string {
  return pickFrom(DIGITS, 6)
}

/**
 * Caisse access passkey (admin sets this): 6 digits.
 * Required during caissier signup. Same format as passkeyProf but
 * stored under a separate Firestore field so admin can rotate them
 * independently — e.g. if a caissier leaves the school, rotating
 * the caisse passkey locks out any cached copy they might have
 * without disrupting prof signups.
 */
export function genererPasskeyCaisse(): string {
  return pickFrom(DIGITS, 6)
}

/**
 * Pre-inscription tracking code: "SC-XXXXXX" base36.
 */
export function genererTrackingCode(): string {
  return 'SC-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

/**
 * Year rollover tracking code attached to transferred élève.
 */
export function genererTransferCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// ─────────────────────────────────────────────────────────────
// Genre helpers
// ─────────────────────────────────────────────────────────────

export function genreLabel(g: Genre | string): string {
  return (g || '').toLowerCase().startsWith('f') ? 'Féminin' : 'Masculin'
}

export function isFille(g: Genre | string | undefined): boolean {
  return (g ?? '').toLowerCase().startsWith('f')
}

/**
 * Smart 1st-place ordinal: "1ère" for female, "1er" for male.
 * "5ème" for everyone else regardless of genre.
 */
export function ordinalRang(rank: number, genre: Genre | string): string {
  if (rank === 1) {
    return isFille(genre) ? '1ère' : '1er'
  }
  return `${rank}ème`
}

// ─────────────────────────────────────────────────────────────
// Cycle detection from class name string (for finance & parent portal)
// ─────────────────────────────────────────────────────────────

const SECOND_CYCLE_HINTS = ['2nde', '1ère', '1ere', 'terminale', 'tle']

export function detectIsSecondCycle(classeName: string | undefined): boolean {
  const lc = (classeName || '').toLowerCase()
  return SECOND_CYCLE_HINTS.some((h) => lc.includes(h))
}

// ─────────────────────────────────────────────────────────────
// Date of birth → age
// ─────────────────────────────────────────────────────────────

export function calculerAge(dateNaissance: string | undefined): number | null {
  if (!dateNaissance) return null
  const bd = new Date(dateNaissance)
  if (isNaN(bd.getTime())) return null
  const td = new Date()
  let age = td.getFullYear() - bd.getFullYear()
  if (td.getMonth() < bd.getMonth() || (td.getMonth() === bd.getMonth() && td.getDate() < bd.getDate())) {
    age--
  }
  return age
}

// ─────────────────────────────────────────────────────────────
// Coefficient grid target id: e.g. "3ème-null", "Terminale-D"
// ─────────────────────────────────────────────────────────────

export function coefficientsTargetId(niveau: Niveau, serie: Serie | null): string {
  return `${niveau}-${serie ?? 'null'}`
}

/**
 * Sanitize a matière name for use in a Firestore document id.
 * Slashes are replaced because Firestore treats them as path separators.
 */
export function safeMatiereId(matiere: string): string {
  return matiere.replace(/\//g, '-')
}

/**
 * RT-SC · Tiny absences UI helpers.
 *
 * `cleanRaison(raw)` — returns the raison string trimmed, or null if
 * the value is empty/whitespace OR a known placeholder string from
 * legacy data ("inconnue", "—", "aucune", etc.).
 *
 * Display callers should treat null as "no reason given" (either hide
 * the section or fall back to a friendly italic placeholder).
 */

const PLACEHOLDER_RAISONS = new Set([
  'inconnue',
  'inconnu',
  'aucune',
  'aucun',
  'n/a',
  'na',
  '-',
  '—',
  '?',
])

export function cleanRaison(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const norm = trimmed.toLowerCase()
  if (PLACEHOLDER_RAISONS.has(norm)) return null
  return trimmed
}

/** Convenient inline placeholder when no raison is given. */
export const RAISON_PLACEHOLDER = 'Aucune raison renseignée'

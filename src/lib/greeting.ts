/**
 * RT-SC · Time-aware greeting helper.
 *
 * Returns one of three French greetings based on the local time:
 *   - 05:00 – 11:59  → "Bonjour"
 *   - 12:00 – 17:59  → "Bon après-midi"
 *   - 18:00 – 04:59  → "Bonsoir"
 *
 * Used by Accueil screens (élève + parent) so the greeting feels
 * contextual to when the user is opening the app.
 */

import { serverNow } from '@/lib/serverTime'

export function timeAwareGreeting(now: Date = serverNow()): string {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'Bonjour'
  if (h >= 12 && h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

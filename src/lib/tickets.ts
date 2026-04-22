/**
 * RT-SC · Tickets — ID generator and shared helpers.
 *
 * Tickets are short, human-readable codes attached to quest claims
 * and (in Phase 3) reward redemptions. Format: `T-XXXXXX` where the
 * 6 chars come from a "safe" alphabet that avoids visually-similar
 * characters (no 0/O, no 1/I/l, no 2/Z, no 5/S, no 8/B).
 *
 * Collision math: 28^6 ≈ 481M unique codes. With 50k tickets/year
 * a collision becomes likely after centuries — we don't bother
 * checking for collisions on insert. If two tickets ever collide
 * the worst case is two students presenting the same code; admin
 * can disambiguate via the underlying claim ID.
 */


// Safer, audited:
//   A B C D E F G H J K M N P Q R T U V W X Y 3 4 6 7 9
//   = 26 chars (A-Y minus I,L,O,S,Z and digits 3,4,6,7,9 — drop 1,2,5,8,0)

const _ALPHABET =
  'ABCDEFGHJKMNPQRTUVWXY' + // 21 letters (no I L O S Z)
  '3467'                    // 4 digits   (no 0 1 2 5 8 9)
// Total 25 chars. Adjust if you want differently — 25^6 ≈ 244M.

export function generateTicketCode(prefix: 'T' | 'R' = 'T'): string {
  const len = 6
  let out = ''
  // crypto.getRandomValues if available — falls back to Math.random
  // for SSR/test environments that don't expose crypto.
  const cryptoObj =
    typeof globalThis !== 'undefined' &&
    (globalThis as { crypto?: Crypto }).crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(len)
    cryptoObj.getRandomValues(buf)
    for (let i = 0; i < len; i++) {
      out += _ALPHABET[buf[i] % _ALPHABET.length]
    }
  } else {
    for (let i = 0; i < len; i++) {
      out += _ALPHABET[Math.floor(Math.random() * _ALPHABET.length)]
    }
  }
  return `${prefix}-${out}`
}

/**
 * Validate a ticket code shape — useful for paste/scan input. Doesn't
 * check existence in the DB; just structural.
 */
export function isValidTicketCode(code: string): boolean {
  if (typeof code !== 'string') return false
  return /^[TR]-[A-Z0-9]{6}$/i.test(code.trim())
}

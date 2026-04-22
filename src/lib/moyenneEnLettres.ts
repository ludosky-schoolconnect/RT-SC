/**
 * RT-SC · Moyenne en lettres.
 *
 * Converts a decimal number like `13.25` into its French written form:
 * `"treize virgule vingt-cinq"`. Used on the bulletin to satisfy the
 * Béninois convention of writing moyenne in letters next to digits,
 * which matches the format on the reference bulletin (CEG HOUETO).
 *
 * Scope: numbers 0-100 with up to 2 decimal places — plenty for school
 * averages on a 20-point scale. Rounds to 2 decimals before converting.
 *
 * Grammar:
 *   - Uses "virgule" for the decimal separator (standard French).
 *   - Compound numbers below 100 use hyphens per the 1990 reform
 *     ("vingt-cinq", "soixante-douze") which is the official modern
 *     convention used in Béninois schools.
 *   - No "et" for "20-29", "30-39" etc. except "et un" (21, 31, 41...).
 *   - Handles exactly the integer ranges we need (0-99); shouldn't be
 *     reused for arbitrary large numbers without extending.
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre',
  'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze',
  'quinze', 'seize',
]

const TENS: Record<number, string> = {
  10: 'dix',
  20: 'vingt',
  30: 'trente',
  40: 'quarante',
  50: 'cinquante',
  60: 'soixante',
  70: 'soixante',    // 70-79 use "soixante-dix..." pattern
  80: 'quatre-vingt',
  90: 'quatre-vingt', // 90-99 use "quatre-vingt-dix..." pattern
}

/** 0-99 → French text. */
function intToFrench(n: number): string {
  if (n < 0) return `moins ${intToFrench(-n)}`
  if (n >= 100) {
    // Minimal support for 100 (a perfect 20/20 never reaches moyenne=100,
    // but totals like "200 points" might). Keep narrow.
    if (n === 100) return 'cent'
    // Bail — we don't need >100 for moyennes. Fall back to digits.
    return String(n)
  }
  if (n < 17) return UNITS[n]

  if (n < 20) {
    // 17, 18, 19: "dix-sept", "dix-huit", "dix-neuf"
    return `dix-${UNITS[n - 10]}`
  }

  // 20-99
  const tensDigit = Math.floor(n / 10) * 10
  const unit = n % 10

  if (n >= 70 && n < 80) {
    // 70-79: "soixante-dix", "soixante-et-onze", "soixante-douze", ..., "soixante-dix-neuf"
    const remainder = n - 60
    if (remainder === 11) return 'soixante-et-onze'
    return `soixante-${intToFrench(remainder)}`
  }

  if (n >= 90 && n < 100) {
    // 90-99: "quatre-vingt-dix", "quatre-vingt-onze", ..., "quatre-vingt-dix-neuf"
    const remainder = n - 80
    return `quatre-vingt-${intToFrench(remainder)}`
  }

  // 20-69, 80-89
  const tensWord = TENS[tensDigit]
  if (unit === 0) {
    // Exact tens. Note: "quatre-vingts" takes an s ONLY when alone; otherwise "quatre-vingt".
    // Since we're an EXACT tens multiple, add the s for 80.
    return tensDigit === 80 ? 'quatre-vingts' : tensWord
  }

  // "et un" for 21, 31, 41, 51, 61 (NOT 71 which uses "et onze", NOT 81/91)
  if (unit === 1 && tensDigit >= 20 && tensDigit <= 60) {
    return `${tensWord}-et-un`
  }

  return `${tensWord}-${UNITS[unit]}`
}

/**
 * Full conversion of a moyenne value.
 * Examples:
 *   moyenneEnLettres(13.25) → "treize virgule vingt-cinq"
 *   moyenneEnLettres(20)    → "vingt"
 *   moyenneEnLettres(8.5)   → "huit virgule cinquante"
 *   moyenneEnLettres(9.07)  → "neuf virgule zéro sept"
 *   moyenneEnLettres(10.00) → "dix"
 *
 * Rounds to 2 decimals.
 */
export function moyenneEnLettres(value: number): string {
  if (!Number.isFinite(value)) return ''
  // Round to 2 decimals to avoid floating-point drift (e.g. 13.249999 → 13.25)
  const rounded = Math.round(value * 100) / 100
  const sign = rounded < 0 ? 'moins ' : ''
  const abs = Math.abs(rounded)

  const integerPart = Math.floor(abs)
  const decimalPart = Math.round((abs - integerPart) * 100)

  const intWord = intToFrench(integerPart)

  if (decimalPart === 0) {
    return `${sign}${intWord}`
  }

  // Decimal: say the two-digit decimal as a single number, except
  // preserve a leading zero if the tens digit is 0 (e.g. 9.07 →
  // "neuf virgule zéro sept", not "neuf virgule sept" which would
  // be confusable with 9.7).
  let decWord: string
  if (decimalPart < 10) {
    // e.g. 0.07 → "zéro sept" (two words: zéro + unit)
    decWord = `zéro ${intToFrench(decimalPart)}`
  } else {
    decWord = intToFrench(decimalPart)
  }

  return `${sign}${intWord} virgule ${decWord}`
}

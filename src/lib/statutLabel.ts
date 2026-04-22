/**
 * RT-SC · French grammar helpers for displaying gendered labels.
 *
 * Firestore stores `statutAnnuel` as the masculine-form string union
 * `'Admis' | 'Échoué'`. For display we want feminine agreement on
 * girls' bulletins: "Admise", "Échouée". Separating the data value
 * (stable, typed) from the display value (locale/gender aware) keeps
 * migrations cheap — no need to touch stored documents.
 *
 * `genre` should come from the eleve doc (values 'M' | 'F'). When
 * unknown or ambiguous, we fall back to the masculine form which
 * reads as the stored-union value (neutral default in French
 * administrative copy).
 */

export type StatutAnnuel = 'Admis' | 'Échoué'
export type Genre = 'M' | 'F' | null | undefined

/**
 * Display label with gender agreement. Examples:
 *   statutLabel('Admis', 'M') → "Admis"
 *   statutLabel('Admis', 'F') → "Admise"
 *   statutLabel('Échoué', 'F') → "Échouée"
 *   statutLabel('Admis', null) → "Admis"
 */
export function statutLabel(
  statut: StatutAnnuel | undefined,
  genre: Genre
): string {
  if (!statut) return 'En attente'
  if (genre !== 'F') return statut
  // Feminine agreement rules for past participles in French:
  //   Admis → Admise
  //   Échoué → Échouée
  if (statut === 'Admis') return 'Admise'
  if (statut === 'Échoué') return 'Échouée'
  return statut
}

/**
 * RT-SC · Élève duplicate detection.
 * Strict, case-insensitive match on (nom + genre + date_naissance).
 * Pure — easy to unit-test.
 */

import type { Eleve, Genre } from '@/types/models'

export interface DuplicateCheckInput {
  nom: string
  genre: Genre | string
  dateNaissance: string
}

export function findDuplicate(
  candidates: Eleve[],
  input: DuplicateCheckInput,
  /** Optional id to exclude (for the edit case — don't match against yourself) */
  excludeId?: string
): Eleve | null {
  const cmpNom = input.nom.trim().toLowerCase()
  const cmpGenre = String(input.genre).trim().toLowerCase()
  const cmpDate = input.dateNaissance.trim()

  for (const c of candidates) {
    if (excludeId && c.id === excludeId) continue
    const sameNom = (c.nom ?? '').trim().toLowerCase() === cmpNom
    const sameGenre = (c.genre ?? '').toString().trim().toLowerCase() === cmpGenre
    const sameDate = (c.date_naissance ?? '').trim() === cmpDate
    if (sameNom && sameGenre && sameDate) return c
  }
  return null
}

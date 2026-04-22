/**
 * RT-SC · Firestore path builders.
 * Every path in the app goes through here so we have one place
 * to refactor schemas if needed.
 *
 * Naming: builders return either a `string[]` (for collection paths)
 * or a `[string, string][]` pair representing collection + doc.
 *
 * Use with the firebase.ts helpers `colRef(path)` / `docRef(path)`.
 */

import type { Periode } from '@/types/models'
import { safeMatiereId } from './benin'

// ─────────────────────────────────────────────────────────────
// School codes (multi-school routing hub)
// ─────────────────────────────────────────────────────────────

export const schoolCodesCol = () => 'school_codes'
export const schoolCodeDoc = (code: string) => `school_codes/${code}`

// ─────────────────────────────────────────────────────────────
// Ecole singletons
// ─────────────────────────────────────────────────────────────

export const ecoleConfigDoc = () => 'ecole/config'
export const ecoleBulletinConfigDoc = () => 'ecole/bulletinConfig'
export const ecoleMatieresDoc = () => 'ecole/matieres'
export const ecoleCoefficientsDoc = (targetId: string) => `ecole/coefficients_${targetId}`
export const ecoleFinancesDoc = () => 'ecole/finances'
export const ecoleSecuriteDoc = () => 'ecole/securite'
export const ecoleSubscriptionDoc = () => 'ecole/subscription'
export const ecoleExamensDoc = () => 'ecole/examens'

// ─────────────────────────────────────────────────────────────
// Professeurs
// ─────────────────────────────────────────────────────────────

export const professeursCol = () => 'professeurs'
export const professeurDoc = (uid: string) => `professeurs/${uid}`

// ─────────────────────────────────────────────────────────────
// Classes & élèves
// ─────────────────────────────────────────────────────────────

export const classesCol = () => 'classes'
export const classeDoc = (classeId: string) => `classes/${classeId}`

export const elevesCol = (classeId: string) => `classes/${classeId}/eleves`
export const eleveDoc = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}`

// Subcollections of an élève
export const notesCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/notes`
export const noteDoc = (
  classeId: string,
  eleveId: string,
  periode: Periode,
  matiere: string
) => `classes/${classeId}/eleves/${eleveId}/notes/${periode}_${safeMatiereId(matiere)}`

export const collesCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/colles`

export const absencesCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/absences`
export const absenceDoc = (classeId: string, eleveId: string, absenceId: string) =>
  `classes/${classeId}/eleves/${eleveId}/absences/${absenceId}`

export const bulletinsCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/bulletins`
export const bulletinDoc = (classeId: string, eleveId: string, periode: Periode) =>
  `classes/${classeId}/eleves/${eleveId}/bulletins/${periode}`

export const paiementsCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/paiements`

// Class-level subcollection
export const presencesCol = (classeId: string) => `classes/${classeId}/presences`
export const presenceDoc = (classeId: string, dateISO: string) =>
  `classes/${classeId}/presences/${dateISO}`

// ─────────────────────────────────────────────────────────────
// Archived appel-marked absences (flat top-level collection)
// One doc per (élève × matière × date) snapshot.
// ─────────────────────────────────────────────────────────────

export const archivedAbsencesCol = () => 'archived_absences'
export const archivedAbsenceDoc = (id: string) => `archived_absences/${id}`

// ─────────────────────────────────────────────────────────────
// Emplois du temps (flat collection; doc carries classeId/profId)
// ─────────────────────────────────────────────────────────────

export const seancesCol = () => 'seances'
export const seanceDoc = (seanceId: string) => `seances/${seanceId}`

// ─────────────────────────────────────────────────────────────
// Annonces
// ─────────────────────────────────────────────────────────────

export const annoncesCol = () => 'annonces'
export const annonceDoc = (id: string) => `annonces/${id}`

export const annoncesGlobalesCol = () => 'annonces_globales'
export const annonceGlobaleDoc = (id: string) => `annonces_globales/${id}`

// ─────────────────────────────────────────────────────────────
// Annuaire parents
// ─────────────────────────────────────────────────────────────

export const annuaireParentsCol = () => 'annuaire_parents'
export const annuaireParentDoc = (id: string) => `annuaire_parents/${id}`

/** Slot IDs for parent self-publication (max 2 per élève) */
export const annuaireParentSlot = (eleveId: string, slot: 1 | 2) =>
  `annuaire_parents/${eleveId}_parent${slot}`

// ─────────────────────────────────────────────────────────────
// Annales (Google Drive link bank)
// ─────────────────────────────────────────────────────────────

export const annalesCol = () => 'annales'
export const annaleDoc = (id: string) => `annales/${id}`

// ─────────────────────────────────────────────────────────────
// Vigilance IA
// ─────────────────────────────────────────────────────────────

export const vigilanceCol = () => 'vigilance_ia'
/** Doc id is composite: {eleveId}_{matiere} */
export const vigilanceDoc = (eleveId: string, matiere: string) =>
  `vigilance_ia/${eleveId}_${matiere}`

// ─────────────────────────────────────────────────────────────
// Pre-inscriptions
// ─────────────────────────────────────────────────────────────

export const preInscriptionsCol = () => 'pre_inscriptions'
export const preInscriptionDoc = (id: string) => `pre_inscriptions/${id}`

/**
 * Per-doc storage subcollection. One doc per uploaded file —
 * keeps the parent inscription light + lets admin lazy-load files.
 */
export const preInscriptionDocsCol = (piId: string) =>
  `pre_inscriptions/${piId}/documents`
export const preInscriptionDocDoc = (piId: string, docId: string) =>
  `pre_inscriptions/${piId}/documents/${docId}`

export const settingsInscriptionDoc = () => 'settings_inscription/config'

/**
 * RV slot counters. One doc per date (DD-MM-YYYY for legacy compat,
 * since the slash had to be removed from the doc id).
 */
export const rvCounterDoc = (dateDDMMYYYYDashed: string) =>
  `rv_counters/${dateDDMMYYYYDashed}`

// ─────────────────────────────────────────────────────────────
// System
// ─────────────────────────────────────────────────────────────

export const systemCacheRegistryDoc = () => 'system/cache_registry'

// ─────────────────────────────────────────────────────────────
// Archive (read-only after rollover)
// ─────────────────────────────────────────────────────────────

export const archiveYearDoc = (annee: string) => `archive/${annee}`
export const archiveClassesCol = (annee: string) => `archive/${annee}/classes`
export const archiveClasseDoc = (annee: string, classeId: string) =>
  `archive/${annee}/classes/${classeId}`
export const archiveElevesCol = (annee: string, classeId: string) =>
  `archive/${annee}/classes/${classeId}/eleves`
export const archiveEleveDoc = (annee: string, classeId: string, eleveId: string) =>
  `archive/${annee}/classes/${classeId}/eleves/${eleveId}`

// Élève subcollections inside archive
export const archiveEleveSubCol = (
  annee: string,
  classeId: string,
  eleveId: string,
  sub: 'notes' | 'colles' | 'absences' | 'bulletins' | 'paiements' | 'civismeHistory'
) => `archive/${annee}/classes/${classeId}/eleves/${eleveId}/${sub}`

// Top-level archived collections
export const archiveAnnoncesCol = (annee: string) => `archive/${annee}/annonces`
export const archiveAnnonceDoc = (annee: string, annonceId: string) =>
  `archive/${annee}/annonces/${annonceId}`

// Emploi du temps lives at root: emploisDuTemps/{classeId}/seances/*
export const emploiDuTempsSeancesCol = (classeId: string) =>
  `emploisDuTemps/${classeId}/seances`
export const archiveEmploiDuTempsSeancesCol = (annee: string, classeId: string) =>
  `archive/${annee}/emploisDuTemps/${classeId}/seances`

// ─────────────────────────────────────────────────────────────
// Path validators — shared by collectionGroup consumers
// ─────────────────────────────────────────────────────────────

/**
 * Parse a Firestore doc path under `/classes/{cid}/eleves/{eid}/...` and
 * return the parent classeId + eleveId.
 *
 * Returns `null` if the path is NOT under the live `classes/` root —
 * i.e. archive paths like `archive/{annee}/classes/.../eleves/.../...`
 * are explicitly rejected. This is the canonical shape check for any
 * collectionGroup consumer that needs to filter out archived documents.
 *
 * Why centralized: vanilla-era archived data leaks into collectionGroup
 * queries because `match /{path=**}/{collection}/{id}` rules match any
 * depth. Each consumer used to inline its own path parsing — easy to get
 * wrong, easy to forget. Routing all collectionGroup consumers through
 * this helper guarantees consistent live-only filtering.
 *
 * @param path  e.g. "classes/abc/eleves/xyz/absences/123"
 * @param subColName  optional last segment to validate (e.g. "absences").
 *                    If provided, returns null for paths that don't end in
 *                    `/{subColName}/{anyId}`. Saves a separate check.
 */
export function parseLiveElevePath(
  path: string,
  subColName?: string
): { classeId: string; eleveId: string } | null {
  const parts = path.split('/')
  if (parts.length < 4) return null
  if (parts[0] !== 'classes') return null
  if (parts[2] !== 'eleves') return null
  const classeId = parts[1]
  const eleveId = parts[3]
  if (!classeId || !eleveId) return null
  if (subColName !== undefined) {
    // Expect [classes, cid, eleves, eid, subColName, docId] = 6 segments
    if (parts.length !== 6) return null
    if (parts[4] !== subColName) return null
  }
  return { classeId, eleveId }
}

// ─────────────────────────────────────────────────────────────
// Civisme — Recompenses catalog (Phase 1)
// ─────────────────────────────────────────────────────────────

export const recompensesCol = () => 'recompenses'
export const recompenseDoc = (id: string) => `recompenses/${id}`

// ─────────────────────────────────────────────────────────────
// Civisme — Quêtes (Phase 2)
// ─────────────────────────────────────────────────────────────

export const quetesCol = () => 'quetes'
export const queteDoc = (questId: string) => `quetes/${questId}`
export const queteClaimsCol = (questId: string) =>
  `quetes/${questId}/claims`
export const queteClaimDoc = (questId: string, claimId: string) =>
  `quetes/${questId}/claims/${claimId}`

// ─────────────────────────────────────────────────────────────
// Civisme — Réclamations de récompenses (Phase 3)
// ─────────────────────────────────────────────────────────────

export const reclamationsCol = () => 'reclamations'
export const reclamationDoc = (id: string) => `reclamations/${id}`

// ─────────────────────────────────────────────────────────────
// Civisme — History subcollection on each eleve (Phase 3)
// ─────────────────────────────────────────────────────────────

export const civismeHistoryCol = (classeId: string, eleveId: string) =>
  `classes/${classeId}/eleves/${eleveId}/civismeHistory`
export const civismeHistoryDoc = (classeId: string, eleveId: string, id: string) =>
  `classes/${classeId}/eleves/${eleveId}/civismeHistory/${id}`

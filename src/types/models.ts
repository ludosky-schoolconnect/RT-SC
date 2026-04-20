/**
 * RT-SC · Firestore document models.
 * Every shape used by the app, typed and documented.
 * Mirror of the legacy app's Firestore schema, captured exactly.
 */

import type { Timestamp } from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────
// Common helpers
// ─────────────────────────────────────────────────────────────

export type Genre = 'M' | 'F'
export type Cycle = 'premier' | 'second'
export type Serie = 'A' | 'B' | 'C' | 'D' | 'G1' | 'G2' | 'G3'
export type Niveau =
  | '6ème' | '5ème' | '4ème' | '3ème'   // Premier cycle
  | '2nde' | '1ère' | 'Terminale'        // Second cycle

export type Periode = string  // e.g. "Trimestre 1", "Semestre 2"
export type StatutAbsence = 'en attente' | 'validée' | 'refusée'
export type StatutAnnuel = 'Admis' | 'Échoué'
export type AnnonceType = 'info' | 'devoir' | 'urgent'
export type SourceAbsence = 'eleve' | 'parent' | 'appel_prof'
export type StatutPreInscription = 'En attente' | 'Validé' | 'Refusé' | 'RV_fixé'
export type VigilanceType = 'success' | 'warning' | 'danger'

export type FirestoreDate = Timestamp | Date | string

// ─────────────────────────────────────────────────────────────
// /school_codes/{code}
// ─────────────────────────────────────────────────────────────

export interface SchoolCode {
  code: string  // e.g. "SC-ALPHA-99", "SC-BETA-44"
  url: string   // destination URL (current school OR redirect target)
  schoolName?: string
}

// ─────────────────────────────────────────────────────────────
// /ecole/{...} singletons
// ─────────────────────────────────────────────────────────────

export interface EcoleConfig {
  anneeActive: string  // "2026-2027"
  nom?: string
  ville?: string
  devise?: string
  nbEleves?: number
  nbClasses?: number
}

export interface PeriodeRange {
  /** ISO date "YYYY-MM-DD" */
  debut: string
  /** ISO date "YYYY-MM-DD" */
  fin: string
}

export interface BulletinConfig {
  typePeriode: 'Trimestre' | 'Semestre'
  nbPeriodes: number
  baseConduite: number  // /20 default
  /**
   * Optional per-period date ranges. Keyed by period name ("Trimestre 1", etc.)
   * When present, drives auto-detection of the current period everywhere
   * (NotesTab, future bulletin closure flows). When absent, the app falls back
   * to a Bénin-calendar guess.
   */
  periodeDates?: Record<string, PeriodeRange>
  /**
   * Formula for combining per-period moyennes into the annual moyenne.
   * 'standard' (default) uses Bénin convention: last period weights 2×.
   * 'simple' uses an equally-weighted arithmetic mean.
   */
  formuleAnnuelle?: 'standard' | 'simple'
}

export interface MatieresGlobales {
  liste: string[]
}

/** /ecole/coefficients_{niveau}-{serie|null} */
export interface CoefficientsDoc {
  [matiere: string]: number  // includes 'Conduite' key
}

export interface FinancesConfig {
  scolarite: number       // FCFA
  fraisAnnexes: number    // FCFA
  gratuiteFilles1er: boolean
  gratuiteFilles2nd: boolean
}

export interface SecuriteConfig {
  passkeyProf: string  // 6-digit code admin distributes
}

export interface SubscriptionDoc {
  deadline: Timestamp
  isManualLock: boolean
  hasRequestedUnlock?: boolean
  fedaPayPublicKey?: string
  subscriptionPrice?: number  // default 15000 FCFA
}

export interface ExamensConfig {
  // exam countdowns — admin sets dates
  [key: string]: { date: Timestamp; label: string }
}

// ─────────────────────────────────────────────────────────────
// /professeurs/{uid}
// ─────────────────────────────────────────────────────────────

export type ProfesseurRole = 'admin' | 'prof'
export type ProfesseurStatut = 'en_attente' | 'actif'

export interface Professeur {
  id: string
  nom: string
  email: string
  matieres: string[]
  classesIds: string[]
  role: ProfesseurRole
  statut: ProfesseurStatut
  createdAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}
// ─────────────────────────────────────────────────────────────

export interface Classe {
  id: string
  cycle: Cycle
  niveau: Niveau
  serie: Serie | null
  salle: string                   // "1", "M1", "A", etc.
  passkey: string                 // class passkey: XX-9999
  annee: string                   // "2026-2027"
  professeursIds: string[]
  profPrincipalId?: string
  createdAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}
// ─────────────────────────────────────────────────────────────

export interface Eleve {
  id: string
  nom: string
  genre: Genre
  contactParent?: string
  date_naissance: string  // YYYY-MM-DD
  dateAjout: Timestamp
  ajoutePar?: string  // uid of who added
  codePin: string         // 6 chars from safe alphabet (élève login)
  passkeyParent: string   // PRNT-XXXX-XXXX (parent login)
  moyenneAnnuelle?: number
  statutAnnuel?: StatutAnnuel
  rang?: string  // e.g. "3ème/45", "1er/45", "1ère ex/45"
  active_session_uid?: string
  active_parent_session_uid?: string
  /** Set true during rollover to mark "do not archive again" */
  _transfere?: boolean
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/notes/{periode_matiere}
// Doc ID = `${periode}_${matiere.replace('/','-')}`
// ─────────────────────────────────────────────────────────────

export interface Note {
  matiere: string
  periode: Periode
  interros: number[]
  devoir1: number | null
  devoir2: number | null
  /** Computed by prof "Calculer & Clôturer"; null until then */
  moyenneInterros: number | null
  /** Computed by prof "Calculer & Clôturer"; null until then */
  moyenneMatiere: number | null
  /** True after prof closure */
  estCloture: boolean
  /**
   * When true, this élève is marked as not participating in this matière
   * for this period. The bulletin engine skips this matière entirely for
   * this élève (no contribution to moyenneGenerale, no penalty).
   *
   * Set by the PP/prof during the closure flow when Layer A flags an
   * élève as having no notes. Per (élève × matière × period), so the
   * same élève can rejoin the matière in a later period.
   */
  abandonne?: boolean
  /** Auto-generated short comment based on note pattern */
  appreciation?: string
  professeurId?: string
  updatedAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/colles/{auto}
// ─────────────────────────────────────────────────────────────

export interface Colle {
  id: string
  periode: Periode
  heures: number
  professeurId: string
  matiere: string
  /** Optional reason text — e.g. "Bavardage répété", "Devoir non fait" */
  motif?: string
  date: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/absences/{auto}
// ─────────────────────────────────────────────────────────────

export interface Absence {
  id: string
  date: Timestamp
  heureDebut?: string  // "08:00"
  heureFin?: string    // "10:00"
  raison: string
  statut: StatutAbsence
  source: SourceAbsence
  /** When set true, élève cannot self-declare for the same day */
  verrou_appel?: boolean
  eleveNom: string
  classeNom: string
  profNom?: string
  createdAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/bulletins/{periode}
// Doc ID = periode (e.g. "Trimestre 1")
// ─────────────────────────────────────────────────────────────

export interface Bulletin {
  /**
   * Period name (e.g. "Trimestre 1", "Semestre 2") for per-period bulletins.
   * Special value "Année" marks the annual closure bulletin (Phase 4c-iii).
   */
  periode: Periode | 'Année'
  moyenneGenerale: number
  totalPoints: number
  totalCoeffs: number
  noteConduite: number
  totalHeuresColle: number
  coeffConduite: number
  estVerrouille: boolean
  dateCalcul: string  // ISO string
  rang?: string

  // ─── Annual-only fields (only set when periode === "Année") ───
  /** Per-period moyennes that fed into the annual computation, in order */
  perPeriodMoyennes?: { periode: string; moyenne: number }[]
  /** Formula used to combine them */
  formuleUsed?: 'standard' | 'simple'
  /** Final annual moyenne (same as moyenneGenerale on the annual doc, kept explicit) */
  moyenneAnnuelle?: number
  /** Computed status — Admis if moyenneAnnuelle ≥ 10 */
  statutAnnuel?: 'Admis' | 'Échoué'
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/paiements/{auto}
// ─────────────────────────────────────────────────────────────

export interface Paiement {
  id: string
  montant: number  // FCFA
  date: Timestamp
  caissier: string
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/presences/{YYYY-MM-DD}
// One doc per day per class, with each matière (slug) as a key.
// Each matière slot stores who was absent, who was retard,
// and who took the appel (prof identity + timestamp).
// ─────────────────────────────────────────────────────────────

export interface AbsentMark {
  nom: string         // denormalized at write time
  heure: string       // "HH:MM" when the prof saved (Bénin local)
  raison?: string     // optional inline note from the prof
}

export interface RetardMark {
  nom: string
  heure: string
  minutes?: number    // optional minutes-late (e.g. 15)
}

export interface PresenceSlot {
  absents: { [eleveId: string]: AbsentMark }
  retards: { [eleveId: string]: RetardMark }
  pris_par: string         // prof DISPLAY name
  pris_par_uid?: string    // prof firebase UID
  pris_a: Timestamp
  total_eleves: number
  /** Optional reference to the seance that this appel was taken for. */
  seanceId?: string
}

export interface PresenceDoc {
  [matiereSlug: string]: PresenceSlot
}

// ─────────────────────────────────────────────────────────────
// /seances/{auto}  — flat top-level collection for the emploi du temps
// Queries: where('classeId','==',X) for a class grid;
//          where('profId','==',U) for a prof's weekly view.
// ─────────────────────────────────────────────────────────────

export type Jour = 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi' | 'Samedi'

export const JOURS_ORDRE: Jour[] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
]

export interface Seance {
  id: string
  classeId: string
  profId: string
  matiere: string           // Name of the subject (e.g. "Mathématiques")
  matiereId?: string        // Slug (via safeMatiereId); optional for legacy
  jour: Jour
  heureDebut: string        // "08:00" (HH:MM)
  heureFin: string          // "10:00" (HH:MM)
  salle?: string | null     // Room (optional)
  anneeScolaireId?: string  // Current année at creation; for archival
  createdAt: Timestamp
  createdBy?: string
  updatedAt?: Timestamp | null
}

// ─────────────────────────────────────────────────────────────
// /annonces/{auto}  +  /annonces_globales/{auto}
// ─────────────────────────────────────────────────────────────

export interface Annonce {
  id: string
  classeId: string  // empty string for globales (or use globales collection)
  titre: string
  contenu: string
  type: AnnonceType
  auteur: string
  auteurId?: string
  createdAt: Timestamp
  classeNom?: string  // denormalized for display
}

export interface AnnonceGlobale {
  id: string
  titre: string
  contenu: string
  auteurNom: string
  dateCreation: Timestamp
  imageStr?: string  // base64 if it's a carousel image
}

// ─────────────────────────────────────────────────────────────
// /annuaire_parents/{eleveId_parent1 | eleveId_parent2}
// ─────────────────────────────────────────────────────────────

export interface AnnuaireParent {
  id: string  // e.g. "{eleveId}_parent1" or "{eleveId}_parent2"
  nom: string
  profession: string
  entreprise?: string
  tel: string  // exactly 13 digits, no formatting
  classeId: string
  eleveId: string
  dateAjout: Timestamp
  expireAt: Timestamp  // dateAjout + 365 days
}

// ─────────────────────────────────────────────────────────────
// /annales/{auto}
// ─────────────────────────────────────────────────────────────

export interface Annale {
  id: string
  titre: string
  matiere: string
  classe: string  // free text, e.g. "3ème M1"
  lien: string    // Google Drive URL
  corrige?: string  // Google Drive URL for solution
  ajoutePar: string
  dateAjout: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /vigilance_ia/{eleveId_matiere}
// ─────────────────────────────────────────────────────────────

export interface VigilanceAlerte {
  id: string
  eleveId: string
  nomEleve: string
  classeId: string
  classeName: string
  matiere: string
  message: string
  type: VigilanceType
  date: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /pre_inscriptions/{auto}
// ─────────────────────────────────────────────────────────────

export interface PreInscription {
  id: string
  nom: string
  genre: Genre
  date_naissance: string  // YYYY-MM-DD
  niveauSouhaite: string
  contactParent: string
  /** Document name → base64 string */
  documents: { [docName: string]: string }
  dateSoumission: Timestamp
  statut: StatutPreInscription
  trackingCode: string  // SC-XXXXXX
  raisonRefus?: string
  categorieDossier?: string
  dateRV?: string
}

// ─────────────────────────────────────────────────────────────
// /settings_inscription/config
// ─────────────────────────────────────────────────────────────

export interface SettingsInscription {
  /**
   * Array with `[CategoryName]` markers and document names.
   * Example: ['[Nouveau]', 'Acte de Naissance', 'Photo', '[Transfert]', 'Ancien bulletin']
   */
  documents: string[]
  materiel: string[]
}

// ─────────────────────────────────────────────────────────────
// /system/cache_registry
// (legacy mechanism; with TanStack Query we may not need it)
// ─────────────────────────────────────────────────────────────

export interface CacheRegistry {
  [key: string]: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /annonces/{auto}
// School-wide or class-scoped announcements, composed by admin
// (and optionally by PPs in a future phase). Read by admin/prof/
// eleve/parent per scope + expiration.
// ─────────────────────────────────────────────────────────────

export type AnnoncePriority = 'info' | 'important' | 'urgent'

export type AnnonceScope =
  | { kind: 'school' }
  | { kind: 'classes'; classeIds: string[] }

export interface Annonce {
  id: string
  title: string
  /** Markdown body — rendered via react-markdown on the consumer side */
  body: string
  scope: AnnonceScope
  priority: AnnoncePriority
  /** If set, the annonce is hidden from consumers after this time */
  expiresAt?: Timestamp
  createdAt: Timestamp
  createdBy: string       // uid
  createdByName?: string  // denormalized for display
  updatedAt?: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /archive/{annee}/...
// Same shapes as live collections, just nested under year
// ─────────────────────────────────────────────────────────────

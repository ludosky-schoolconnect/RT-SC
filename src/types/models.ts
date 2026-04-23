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
  /** Postal/street address of the school. Used on receipts + headers. */
  adresse?: string
  /** Main contact phone number. Used on receipts + parent comms. */
  telephone?: string
  /**
   * Becomes true the moment the admin kicks off the first class
   * transition (Operation A). Resets to false after the final archive
   * (Operation B) completes. While true, the admin dashboard shows a
   * persistent warning banner prompting them to finalize.
   *
   * Introduced to close the hole where admin could complete all class
   * transitions but forget to run the final archive — leaving the
   * database in a half-transitioned state.
   */
  transitionInProgress?: boolean
  /**
   * IDs of classes whose transition (Operation A) has been completed
   * this cycle. When this set equals the full list of active classes,
   * the Transition modal's Done step offers to chain into Archive.
   *
   * Tracked here (not client-side) so that if admin switches devices
   * or clears their session, the state survives.
   */
  classesTransitioned?: string[]
  /**
   * Server timestamp of the most recent successful final-archive run.
   * Used by the DangerZone UI to show a "just archived" success state
   * for a short grace window — admin immediately after completing
   * rollover sees "✓ Année X archivée" rather than a blank DangerZone,
   * preventing them from clicking "Archiver" again in confusion.
   */
  lastArchivedAt?: unknown
  /**
   * The année string that was just archived. Paired with
   * lastArchivedAt to populate the success banner text.
   */
  lastArchivedAnnee?: string
  /**
   * Bulletin v2 — Directrice signature, stored as a base64-encoded PNG
   * data URL (no Firebase Storage dependency). Drawn by the admin via
   * SignatureDrawCanvas in the Année tab. When present, rendered at
   * the bottom of every bulletin in the "Le Directeur / La Directrice"
   * signature block. When absent, the signature block shows the name
   * line with no image above it.
   */
  signatureDirectrice?: string
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
  /** Legacy field — 6-digit code gating prof signup. Session 4b also
   *  uses it to gate fresh prof logins (see ProfPasskeyGate). From
   *  Session E1a onward, this is SIGNUP-ONLY. Returning profs use
   *  their per-prof /professeurs/{uid}.loginPasskey instead (auto-
   *  generated by the onProfActivated trigger on admin approval). */
  passkeyProf: string
  /**
   * 6-digit code gating caissier signup (Phase 6d.2). Separate from
   * passkeyProf so admin can rotate them independently. If the field
   * is missing on a school's securite doc (fresh install or legacy
   * schools that haven't migrated), caissier signup falls back to
   * using passkeyProf — so no existing flow breaks during rollout.
   */
  passkeyCaisse?: string
}

export interface SubscriptionDoc {
  deadline: Timestamp
  isManualLock: boolean
  hasRequestedUnlock?: boolean
  fedaPayPublicKey?: string
  subscriptionPrice?: number  // default 15000 FCFA
  subscriptionDurationMonths?: number  // default 1 month
  /**
   * WhatsApp number for SchoolConnect support, international format
   * WITHOUT leading + or spaces (e.g. "22990123456"). Used to build
   * wa.me links on the LockedPage. Set via dev.html.
   */
  supportWhatsAppNumber?: string
}

/**
 * Target audience for an exam countdown.
 * 'tous' = visible to BOTH 3ème and Terminale (the two exam levels).
 * This matches vanilla semantics: "Tous" does NOT mean everyone —
 * it means the universal national-exam pool (BEPC + BAC levels).
 */
export type ExamCible = 'tous' | '3eme' | 'terminale'

export interface ExamCountdown {
  /** Stable client-side ID for React keys + deletion. */
  id: string
  /** Display name (e.g. "BEPC 2026", "BAC blanc"). */
  label: string
  /** YYYY-MM-DD date of the exam. */
  date: string
  /** Who sees this countdown. */
  cible: ExamCible
}

export interface ExamensConfig {
  examens: ExamCountdown[]
}

// ─────────────────────────────────────────────────────────────
// /professeurs/{uid}
// ─────────────────────────────────────────────────────────────

/**
 * Staff role. Exclusive — a user holds exactly one role at a time.
 *
 * - `admin`: full school management (classes, élèves, profs, pédagogie).
 *   Cannot access Finances or Inscriptions in 6d+ (those are caissier-only).
 * - `prof`: teacher. Gradebook, appel, bulletins. No admin surfaces.
 * - `caissier`: dedicated cashier + admission officer. Terminal de caisse,
 *   bilan, guichet d'admission. No teaching surfaces, no admin surfaces.
 *   classesIds + matieres are forced empty when this role is assigned.
 */
export type ProfesseurRole = 'admin' | 'prof' | 'caissier'
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
  /**
   * Bulletin v2 — Personal signature stored as a base64-encoded PNG
   * data URL (no Firebase Storage dependency). Drawn by the prof from
   * their "Mon profil" section on MesClassesTab. When the prof is PP
   * of a class, this signature is rendered on every bulletin under
   * the "Le/La Professeur Principal" block. When absent, the slot
   * shows a blank signature line (preserving legacy behavior).
   */
  signature?: string
  /**
   * Session E1a — per-prof 6-digit login passkey. Generated server-
   * side by the onProfActivated trigger when admin approves the
   * account (statut: en_attente → actif). Emailed to the prof once.
   * Used by ProfPasskeyGate to unlock the login page on return
   * visits. Client never reads this field directly — verification
   * happens via the verifyProfLogin callable which uses admin SDK.
   * Rules restrict read/write to admin + the prof themselves.
   */
  loginPasskey?: string
  /**
   * Version counter baked into the HMAC token payload. Incremented on
   * every rotation (self-regenerate or admin force-reset). Old tokens
   * with a stale version fail verification — effectively logging out
   * every session on rotation.
   */
  loginPasskeyVersion?: number
  /**
   * Stamped by verifyProfLogin on every successful gate unlock.
   * Consumed by the expireStalePasskeys weekly scheduler to retire
   * passkeys for profs inactive > 90 days.
   */
  lastLoginAt?: Timestamp
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
  /**
   * Legacy/optional eleve metadata — written by inscription forms or
   * imported from the legacy app. Read defensively (always with `eleve.X && ...`)
   * and surfaced on archive/finance views when present. Never written by
   * current RT-SC code paths.
   */
  matricule?: string
  telephoneParent?: string
  emailParent?: string
  adresse?: string
  moyenneAnnuelle?: number
  statutAnnuel?: StatutAnnuel
  rang?: string  // e.g. "3ème/45", "1er/45", "1ère ex/45"
  active_session_uid?: string
  active_parent_session_uid?: string
  /**
   * Civisme score (comportement/soft-skills) on a 0-20 scale.
   * Admin adjusts by ±1 from the Civisme tab. Undefined = 0.
   * Eleves with ≥ 18 become eligible for the PDF honor certificate.
   */
  civismePoints?: number
  /** Set true during rollover to mark "do not archive again" */
  _transfere?: boolean
  /**
   * English Hub — current streak count (consecutive days of correct
   * daily-quiz answers). Resets to 0 on a wrong answer or if the
   * student skips a day.
   */
  englishStreak?: number
  /**
   * English Hub — ISO date string ("YYYY-MM-DD") of the last day
   * the student answered the daily quiz. Used to gate repeat
   * answering and to detect streak breaks.
   */
  lastEnglishQuiz?: string
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
// /archived_absences/{auto}
// Per-élève-per-matière-per-day historical record of appel-marked
// absences. Originals from /presences/.absents{} are deleted as part
// of the daily roll-over.
// ─────────────────────────────────────────────────────────────

export interface ArchivedAbsence {
  id: string
  classeId: string
  classeNom: string       // denormalized at archive time
  eleveId: string
  eleveNom: string
  /** Calendar day of the absence (YYYY-MM-DD) */
  dateISO: string
  /** Same as dateISO but as a Timestamp for orderBy queries */
  date: Timestamp
  matiereSlug: string
  matiere: string         // human-readable, denormalized
  heure: string           // "HH:MM" the prof saved during appel
  raison?: string
  prisPar: string         // prof name at the time
  prisParUid?: string
  /** When this archive row was written */
  archivedAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/bulletins/{periode}
// Doc ID = periode (e.g. "Trimestre 1")
// ─────────────────────────────────────────────────────────────

/**
 * Bulletin v2 — Decision rendered by the conseil de classe.
 * Written by admin or PP from the BulletinObservationsEditor.
 * Stored as a string so that a future "other" free-text decision
 * stays easy to add without a schema migration.
 */
export type DecisionConseil =
  | "Tableau d'Honneur"
  | 'Félicitations'
  | 'Encouragement'
  | 'Avertissement'
  | 'Blâme'

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

  // ─── Bulletin v2 — editor-authored fields ───
  /**
   * Observations du chef d'établissement — free-text commentary written
   * by admin OR the classe's professeur principal. Max 500 chars enforced
   * client-side. Displayed in the gold-accent observations block at the
   * bottom of the bulletin when present. Absent when unset.
   */
  observationsChef?: string
  /**
   * Décision du conseil de classe. One of five standard mentions, or
   * undefined when no decision has been rendered. Rendered as a badge
   * within the observations block.
   */
  decisionConseil?: DecisionConseil
}

// ─────────────────────────────────────────────────────────────
// /classes/{id}/eleves/{id}/paiements/{auto}
// ─────────────────────────────────────────────────────────────

export interface Paiement {
  id: string
  montant: number  // FCFA
  date: Timestamp
  caissier: string
  /**
   * Optional method tag. Freeform but common values: 'espèces',
   * 'mobile money', 'chèque', 'virement'. Legacy docs without this
   * field default to 'espèces' in the UI.
   */
  methode?: string
  /** Optional short note (e.g. "1ère tranche", "bonus reçu"). */
  note?: string
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
//
// Past exam papers (BEPC blanc, devoirs, etc.) stored as Google
// Drive shareable links. Admins and profs add them; élèves
// consume them from their dashboard.
//
// The `classe` field is free text ("3ème M1" or "3ème") — student
// view matches on either exact-class or level-prefix so an annale
// tagged "3ème" shows up for all 3ème students across sections.
// ─────────────────────────────────────────────────────────────

export interface Annale {
  id: string
  titre: string
  matiere: string
  /** Free text: "3ème M1" or "3ème" or "Terminale D" */
  classe: string
  /** Google Drive URL for the subject paper */
  lien: string
  /** Google Drive URL for the corrigé (optional) */
  corrige?: string
  /** Display name of who uploaded */
  ajoutePar: string
  /** UID of uploader (for own-edit/delete permission check) */
  ajouteParUid?: string
  /** Role of uploader — affects UI badge */
  ajouteParRole?: 'admin' | 'prof'
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

/**
 * Statut values match legacy strings exactly to keep public-form
 * compatibility (parent can re-check status via tracking code).
 */
export type StatutPreInscriptionV2 =
  | 'En attente'
  | 'Approuvé'
  | 'Refusé'
  | 'Inscrit Officiellement'

export interface PreInscription {
  id: string
  nom: string
  genre: Genre
  date_naissance: string  // YYYY-MM-DD
  niveauSouhaite: string
  contactParent: string
  /**
   * Optional parent email — introduced alongside the Cloud Functions
   * email pipeline (Session B). If provided at submission time, the
   * applicant receives an email when their status changes to
   * Approuvé or Refusé. Free-form — validated only as "contains @".
   */
  emailParent?: string
  /**
   * Legacy embedded documents (base64 in the doc itself).
   * NEW dossiers use the /documents subcollection instead — leave this
   * field empty/undefined for those. The admin viewer reads BOTH so
   * existing legacy data still renders.
   */
  documents?: { [docName: string]: string }
  dateSoumission: Timestamp
  /** Renamed: now uses StatutPreInscriptionV2 values. */
  statut: StatutPreInscriptionV2
  trackingCode: string  // SC-XXXXXX
  raisonRefus?: string
  categorieDossier?: string
  /** Set when admin approves; format DD/MM/YYYY for legacy compat. */
  dateRV?: string
  /** Destination class assigned at approval time. */
  classeCible?: string
  /** How many times the parent has reprogrammed their RV (cap at 3). */
  reprogCount?: number
}

/**
 * Per-document storage in subcollection — one doc per uploaded file.
 * Path: /pre_inscriptions/{piId}/documents/{slugifiedDocName}
 *
 * Each doc is its own ~1MB envelope, so the inscription doesn't bloat
 * and admin's listing query doesn't pull file data unless requested.
 */
export interface PreInscriptionDocument {
  id: string
  /** Display name as set by admin in SettingsInscription. */
  nom: string
  /**
   * Data URL with MIME type. e.g. "data:image/jpeg;base64,/9j/4AAQ..."
   * Compressed client-side before upload.
   */
  dataUrl: string
  /** Original file size in bytes (for display/audit). */
  size: number
  /** MIME type extracted from upload. */
  mimeType: string
  uploadedAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /settings_inscription/config
// ─────────────────────────────────────────────────────────────

/**
 * Per-doc spec inside a category. Replaces the legacy magic-string
 * syntax (`*name*` for required, `"name"` for optional).
 */
export interface InscriptionDocSpec {
  nom: string       // "Acte de naissance"
  requis: boolean   // true = star, blocks form submission if empty
}

/**
 * A category of applicants (e.g. "Nouveaux élèves" vs "Anciens
 * élèves"). Each has its own document checklist. Public form asks
 * the parent which category they belong to first, then shows only
 * that category's documents.
 */
export interface InscriptionCategorie {
  nom: string                       // "Nouveaux élèves"
  documents: InscriptionDocSpec[]
}

export interface SettingsInscription {
  /**
   * Master open/close toggle for the public pre-inscription form.
   * When false, the public /inscription page shows a "closed" notice
   * and Firestore rules reject new /pre_inscriptions/* creates.
   *
   * Default: undefined → treated as OPEN (preserves behavior for
   * already-deployed schools that haven't seen this field yet).
   * Admin must explicitly flip to false to close.
   */
  preinscriptionsOuvertes?: boolean
  /**
   * Categories. If empty, the public form falls back to documentsSimple
   * (no category picker shown).
   */
  categories?: InscriptionCategorie[]
  /**
   * Flat doc list used when categories is empty (for schools with
   * just one applicant profile).
   */
  documentsSimple?: InscriptionDocSpec[]
  /** Free-text list of items parents must bring (uniforms, kits, etc.) */
  materiel: string[]
  /** Daily cap on physical RV slots. Legacy hardcoded 35. */
  rendezVousPlacesParJour?: number
  /** Today + N days = earliest RV. Legacy hardcoded 3. */
  rendezVousDelaiMinJours?: number
  /**
   * Legacy raw document strings (with [Category] / *required* / "optional"
   * syntax). Present until admin migrates. Ignored once `categories` or
   * `documentsSimple` is set.
   */
  documents?: string[]
}

// ─────────────────────────────────────────────────────────────
// /rv_counters/{DD-MM-YYYY}
// One doc per date, tracking how many RV slots are taken.
// ─────────────────────────────────────────────────────────────

export interface RvCounter {
  count: number
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

/**
 * Metadata doc written at /archive/{annee} by the year rollover.
 *
 * Exists so the browse UI can list archived years via getDocs on
 * `/archive` (listCollections isn't exposed in the Firebase JS SDK).
 * Carries denormalized counts so the years-list card doesn't need to
 * aggregate subcollections.
 */
export interface ArchivedYear {
  /** e.g. "2024-2025" */
  annee: string
  classesCount: number
  elevesCount: number
  errorsCount: number
  archivedAt: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /recompenses/{id}
// School-wide rewards catalog. Admin defines what students can
// claim with their cumulative civisme points. Phase 1 (this turn)
// only ships the admin CRUD. Student claims & redemptions ship
// in Phase 3.
// ─────────────────────────────────────────────────────────────

export interface Recompense {
  id: string
  /** Display name, e.g. "Calculatrice scientifique" */
  nom: string
  /** Free-text description shown to students browsing the catalog */
  description?: string
  /** Cost in civisme points to claim this reward */
  pointsRequis: number
  /**
   * Manual availability toggle. Admin sets to false when stock runs
   * out — no automatic counting, just a visibility flag. We deliberately
   * avoid stock counters because real-world inventory drifts and
   * counter mismatches would create more friction than they solve.
   */
  disponible: boolean
  createdAt: Timestamp
  /** Admin uid that created this reward */
  createdBy: string
  /** Last update — used for sort-by-recent in the catalog list */
  updatedAt?: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /quetes/{id}  — Civisme v3 quests (Phase 2)
//
// A quest is a posted opportunity to earn civisme points by doing
// a task the school needs done (cleaning, helping, organizing).
// Each quest has N slots; one student per slot. Claims are stored
// in a subcollection so we can support multi-slot cleanly without
// bloating the parent doc.
// ─────────────────────────────────────────────────────────────

export type QueteStatut =
  | 'ouverte'    // accepting claims (slotsRemaining > 0)
  | 'complete'   // all slots taken, awaiting validations
  | 'cloturee'   // admin closed it (no further claims, even if validations remain)
  | 'annulee'    // admin cancelled — open claims should be marked rejected

export interface Quete {
  id: string
  titre: string
  description?: string
  /** Points each successful claim awards */
  pointsRecompense: number
  /**
   * Total slots when posted. Stays constant after creation; admin
   * cannot reduce it below the number of taken slots.
   */
  slotsTotal: number
  /** Count of claims with statut in ('pending', 'validated') */
  slotsTaken: number
  /** Count of claims with statut === 'validated' (subset of slotsTaken) */
  slotsValidated: number
  /**
   * Optional class filter. When null/undefined, quest is visible to
   * all classes. When set, only students from that class can claim.
   */
  classeIdFilter?: string
  /** Display label for the class (denormalized at create time) */
  classeNomFilter?: string
  /** Optional deadline — purely advisory; not enforced server-side */
  echeance?: Timestamp
  statut: QueteStatut
  createdAt: Timestamp
  createdBy: string
  /** Last update timestamp — used to surface "récemment publiée" hints */
  updatedAt?: Timestamp
}

// ─────────────────────────────────────────────────────────────
// /quetes/{questId}/claims/{claimId}  — per-slot claim
// ─────────────────────────────────────────────────────────────

export type ClaimStatut =
  | 'pending'    // claimed, awaiting admin validation
  | 'validated'  // admin approved, points awarded
  | 'rejected'   // admin rejected, no points awarded

export interface QueteClaim {
  id: string
  /** Backlink — useful for collection-group queries */
  queteId: string
  /** Denormalized quest snapshot at claim time */
  queteTitre: string
  pointsRecompense: number
  // Who's doing the work
  eleveId: string
  eleveNom: string         // denormalized for ticket + admin list display
  classeId: string
  classeNom: string        // denormalized
  // How the claim was made
  claimedBy: 'eleve' | 'prof' | 'admin'
  /** UID of the actor (student themselves, or prof/admin acting on behalf) */
  claimedByUid: string
  claimedByNom?: string    // denormalized when prof/admin
  claimedAt: Timestamp
  // Validation
  statut: ClaimStatut
  validatedAt?: Timestamp
  validatedByUid?: string
  validatedByNom?: string
  rejectionReason?: string
  // Ticket — short readable code that admin can verify
  ticketCode: string       // e.g. "T-K7XQN3"
}

// ─────────────────────────────────────────────────────────────
// /reclamations/{id}  — reward claims (Phase 3)
//
// A student wants a reward from the catalog. They (or a prof/admin
// on their behalf) create a Reclamation doc. Admin then fulfills it
// (physical handover) or rejects it. Points are debited at
// fulfillment time, not request time — this way cancellations
// don't need refund logic.
//
// Why "reclamation" and not "redemption"? User preference — French-
// natural term that matches the school context. The code throughout
// refers to it as Reclamation for consistency.
// ─────────────────────────────────────────────────────────────

export type ReclamationStatut =
  | 'demandee'    // pending admin fulfillment
  | 'fulfillee'   // admin handed over the reward, points debited
  | 'annulee'     // admin or student cancelled before fulfillment

export interface Reclamation {
  id: string
  // Target
  eleveId: string
  eleveNom: string         // denormalized
  classeId: string
  classeNom: string        // denormalized
  // What they want
  recompenseId: string
  recompenseNom: string    // denormalized at request time (catalog could change)
  pointsCout: number       // snapshot of cost at request time
  // Who requested
  demandeeParType: 'eleve' | 'prof' | 'admin'
  demandeeParUid: string
  demandeeParNom?: string  // denormalized for prof/admin
  demandeeLe: Timestamp
  // Status + audit
  statut: ReclamationStatut
  fulfilleeLe?: Timestamp
  fulfilleeParUid?: string
  fulfilleeParNom?: string
  annuleeLe?: Timestamp
  annuleeParUid?: string
  annuleeParNom?: string
  annulationReason?: string
  /** Ticket code — same format as quest tickets, prefix 'R' instead of 'T' */
  ticketCode: string
}

// ─────────────────────────────────────────────────────────────
// /classes/{cid}/eleves/{eid}/civismeHistory/{id}  — audit trail
//
// Every point change leaves a footprint here. Required for:
//   - Student/parent transparency ("why did my solde change?")
//   - Admin audit if a dispute comes up
//   - The "Historique" section on the student civisme tab
//
// Writes happen in the same transaction that updates civismePoints,
// so the balance + history are always consistent.
// ─────────────────────────────────────────────────────────────

export type CivismeHistoryRaison =
  | 'quete'              // quest validation awarded points
  | 'reclamation'        // reward claim fulfilled, points debited
  | 'incident'           // incident report deducted points
  | 'ajustement_manuel'  // admin ±1 or manual tweak

export interface CivismeHistoryEntry {
  id: string
  /** Delta applied — can be positive (quete) or negative (incident, reclamation) */
  delta: number
  raison: CivismeHistoryRaison
  /** Required for incidents, optional for other reasons */
  motif?: string
  /** Backlink to the source doc for drilldown */
  reference?: {
    type: 'quete' | 'reclamation'
    id: string
    /** Denormalized label (e.g. quest title or reward name) */
    label: string
  }
  date: Timestamp
  /** Who triggered this change — admin uid, prof uid, or 'system' */
  parUid: string
  parNom?: string
  /** Snapshot of the balance AFTER this change — for display */
  soldeApres: number
}
